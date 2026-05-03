import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import LogFeed from '../components/LogFeed.jsx';
import { fmt } from '../components/Money.jsx';
import Timer from '../components/Timer.jsx';

// ── Evidence Board ─────────────────────────────────────────────────
//
// Detective-style "person of interest" board. The player's silhouette
// sits at the centre as a stylised gangster bust; red strings fan out
// to a ring of pinned articles that act as the main-nav launcher.
//
// Articles alternate between two visual styles:
//   - newspaper clipping  — cream paper, serif headline, kicker line
//   - notepad page        — pale yellow paper, ruled lines, red margin
//
// Layout: aspect-square container. SVG strings layer on the bottom;
// HTML article cards positioned absolutely on top using polar
// coordinates around the centre.

const NODES = [
  { to: '/city',      label: 'City',       teaser: 'Streets & shops',    style: 'paper' },
  { to: '/inventory', label: 'Inventory',  teaser: 'Your loadout',       style: 'note'  },
  { to: '/missions',  label: 'Missions',   teaser: 'Daily ops',          style: 'paper' },
  { to: '/crimes',    label: 'Crimes',     teaser: 'Solo & crew jobs',   style: 'note'  },
  { to: '/combat',    label: 'Fight Club', teaser: 'Knuckles only',      style: 'note'  },
  { to: '/gangs',     label: 'Gangs',      teaser: 'Crews & politics',   style: 'paper' },
  { to: '/wars',      label: 'Turf Wars',  teaser: 'Active fronts',      style: 'note'  },
  { to: '/players',   label: 'Players',    teaser: 'Find someone',       style: 'paper' },
  { to: '/trades',    label: 'Trades',     teaser: 'Deals on the side',  style: 'note'  },
];

// Deterministic per-node tilts so refreshes don't shuffle the board.
const ROT = [-4, 3, -2, 5, -3, 4, -5, 2, -3, 4];

// Stylised fedora-and-suit silhouette for the centre. Sized via parent
// container; viewBox keeps the shape proportional. The tie pop of red
// echoes the strings and faction badge palette.
function GangsterBust() {
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {/* drop shadow */}
      <ellipse cx="50" cy="128" rx="42" ry="3" fill="rgba(0,0,0,0.4)" />
      {/* fedora brim */}
      <ellipse cx="50" cy="36" rx="42" ry="6" fill="#0a0908" />
      {/* fedora crown */}
      <path d="M 26 35 C 26 14, 38 10, 50 10 C 62 10, 74 14, 74 35 Z" fill="#0a0908" />
      {/* hat band */}
      <ellipse cx="50" cy="33" rx="25" ry="2" fill="#1f1d1b" />
      {/* head shadow under brim */}
      <ellipse cx="50" cy="49" rx="14" ry="11" fill="#0a0908" opacity="0.92" />
      {/* neck */}
      <rect x="42" y="58" width="16" height="9" fill="#0a0908" />
      {/* shoulders / coat */}
      <path d="M 8 96 C 8 80, 22 67, 36 64 L 50 78 L 64 64 C 78 67, 92 80, 92 96 L 92 130 L 8 130 Z" fill="#0a0908" />
      {/* lapel left */}
      <path d="M 36 64 L 50 78 L 46 100 L 38 76 Z" fill="#1f1d1b" />
      {/* lapel right */}
      <path d="M 64 64 L 50 78 L 54 100 L 62 76 Z" fill="#1f1d1b" />
      {/* shirt collar */}
      <path d="M 46 76 L 54 76 L 53 84 L 47 84 Z" fill="#e7e5e4" />
      {/* tie */}
      <path d="M 47 80 L 53 80 L 55 110 L 50 118 L 45 110 Z" fill="#991b1b" />
    </svg>
  );
}

function ArticleNode({ node, x, y, rotation, lockedOut }) {
  const isPaper = node.style === 'paper';
  return (
    <Link
      to={node.to}
      onClick={(e) => { if (lockedOut) e.preventDefault(); }}
      aria-disabled={lockedOut}
      className={`absolute select-none transition
        ${lockedOut ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110 hover:!rotate-0 hover:z-20'}`}
      style={{
        left: `${x}%`, top: `${y}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}>
      {isPaper ? (
        <div className="w-28 sm:w-32 bg-amber-50 border border-stone-700/30 shadow-lg shadow-black/60 rounded-sm overflow-hidden">
          <div className="px-2 pt-1.5 pb-0.5 text-[7px] uppercase tracking-[0.2em] text-blood-800 border-b border-stone-800/40 font-medium">
            The Daily
          </div>
          <div className="px-2 py-1.5">
            <div className="font-display text-[14px] sm:text-base text-stone-900 leading-tight">{node.label}</div>
            <div className="text-[9px] italic text-stone-700/85 leading-snug mt-0.5">{node.teaser}</div>
          </div>
        </div>
      ) : (
        <div className="w-28 sm:w-32 bg-amber-100 border border-stone-700/30 shadow-lg shadow-black/60 rounded-sm overflow-hidden relative">
          {/* red left margin */}
          <div className="absolute left-2 top-0 bottom-0 w-px bg-blood-600/70" />
          {/* horizontal rule lines */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(transparent 0px, transparent 9px, rgba(31,29,27,0.18) 10px)',
            }} />
          <div className="relative px-3 py-2 pl-4">
            <div className="font-display text-[14px] sm:text-base text-stone-900 leading-tight">{node.label}</div>
            <div className="text-[9px] italic text-stone-700/85 leading-snug mt-1">{node.teaser}</div>
          </div>
        </div>
      )}
    </Link>
  );
}

function EvidenceBoard({ character, lockedOut }) {
  // Polar layout — start at the top (-90°) and walk clockwise so the
  // first node sits straight above the silhouette. Radius 35 keeps the
  // article cards (each ~140px wide on desktop) inside the container
  // even on a 360px-wide phone, avoiding horizontal overflow.
  const RADIUS = 35;
  const positions = NODES.map((_, i) => {
    const angle = ((-90 + (i * 360 / NODES.length)) * Math.PI) / 180;
    return {
      x: 50 + RADIUS * Math.cos(angle),
      y: 50 + RADIUS * Math.sin(angle),
    };
  });

  return (
    <div className="relative w-full max-w-3xl mx-auto aspect-square">
      {/* Backdrop — corkboard-feeling vignette */}
      <div
        className="absolute inset-0 rounded-2xl border border-ink-100/10"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(220,38,38,0.10), transparent 65%), ' +
            'radial-gradient(circle at 20% 20%, rgba(245,158,11,0.06), transparent 50%), ' +
            'radial-gradient(circle at 80% 80%, rgba(245,158,11,0.05), transparent 50%), ' +
            '#0a0908',
        }}
      />

      {/* String layer — drawn before nodes so they render on top. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none">
        {positions.map((p, i) => (
          <line
            key={NODES[i].to}
            x1="50" y1="50"
            x2={p.x} y2={p.y}
            stroke="rgba(220, 38, 38, 0.5)"
            strokeWidth="0.25"
            strokeDasharray="0.9 0.5"
            strokeLinecap="round"
          />
        ))}
        {/* Centre thumbtack */}
        <circle cx="50" cy="50" r="0.7" fill="#fbbf24" opacity="0.7" />
      </svg>

      {/* Article nodes */}
      {NODES.map((n, i) => (
        <ArticleNode
          key={n.to}
          node={n}
          x={positions[i].x}
          y={positions[i].y}
          rotation={ROT[i % ROT.length]}
          lockedOut={lockedOut}
        />
      ))}

      {/* Centre — gangster silhouette only. Identity info lives in the
          top-bar character chip, no need to duplicate it here. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
        <div className="w-28 h-36 sm:w-36 sm:h-48 drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
          <GangsterBust />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { character, log, refresh } = useGame();
  const [daily, setDaily] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);
  const nav = useNavigate();

  async function loadDaily() { setDaily(await api.get('/daily')); }
  useEffect(() => { loadDaily(); }, []);

  async function claim() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/daily/claim');
      setMsg(`+${fmt(r.reward)} (streak ${r.streak})`);
      await refresh();
      await loadDaily();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!character) return null;
  const c = character;
  const now = Date.now();
  const inJail     = c.jail_until && c.jail_until > now;
  const inHospital = c.hospital_until && c.hospital_until > now;
  const travelling = c.travel_until && c.travel_until > now;
  const lockedOut  = inJail || inHospital || travelling;

  return (
    <div className="space-y-6">
      {lockedOut && (
        <Card title="Status">
          {inJail && (
            <div className="flex items-center justify-between">
              <p>In jail. <Timer until={c.jail_until} prefix="Out in " onExpire={refresh} /></p>
              <button className="btn" onClick={() => nav('/jail')}>Open cell options</button>
            </div>
          )}
          {inHospital && (
            <div className="flex items-center justify-between mt-2">
              <p>In hospital. <Timer until={c.hospital_until} prefix="Out in " onExpire={refresh} /></p>
              <button className="btn" onClick={() => nav('/hospital')}>Pay for treatment</button>
            </div>
          )}
          {travelling && (
            <div className="mt-2">
              <p>Travelling to {c.travel_to}. <Timer until={c.travel_until} prefix="Arriving in " onExpire={refresh} /></p>
            </div>
          )}
        </Card>
      )}

      <EvidenceBoard character={c} lockedOut={lockedOut} />

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Daily reward">
          {daily?.ready ? (
            <>
              <p className="text-sm">Streak: <span className="text-gold-400">{daily.streak} days</span></p>
              <p className="text-xs text-ink-100/60 my-2">+£{(400 + c.level * 100).toLocaleString()}{((daily.streak + 1) % 7 === 0) && ' + full vital refill'}</p>
              <button disabled={busy} className="btn btn-money w-full" onClick={claim}>{busy ? '...' : 'Claim today'}</button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-100/70">Log in tomorrow for your daily bonus.</p>
              {daily?.streak > 0 && <p className="text-xs text-ink-100/50">Current streak: {daily.streak} day{daily.streak === 1 ? '' : 's'}</p>}
            </>
          )}
          {msg && <p className="text-xs text-money-400 mt-2">{msg}</p>}
        </Card>

        <Card title="Recent activity">
          <LogFeed items={log} />
        </Card>
      </div>
    </div>
  );
}
