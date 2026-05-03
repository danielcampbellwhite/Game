import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import LogFeed from '../components/LogFeed.jsx';
import { fmt } from '../components/Money.jsx';
import Timer from '../components/Timer.jsx';
import FactionBadge from '../components/FactionBadge.jsx';

// ── Evidence Board ─────────────────────────────────────────────────
//
// Detective-style "person of interest" board: the player sits in the
// centre, and red strings connect them to every major game surface
// the main nav exposes. Replaces the inventory-duplicating dashboard
// with a single hero element that doubles as a launcher.
//
// Layout: a single aspect-square container. Strings are drawn in an
// SVG layer; nodes are absolutely-positioned <Link>s on top so they're
// clickable. Both layers use viewport-relative percent coordinates so
// the whole thing scales proportionally on mobile.
const NODES = [
  { to: '/city',      label: 'City'       },
  { to: '/inventory', label: 'Inventory'  },
  { to: '/missions',  label: 'Missions'   },
  { to: '/jobs',      label: 'Job Board'  },
  { to: '/crimes',    label: 'Crimes'     },
  { to: '/oc',        label: 'Heists'     },
  { to: '/combat',    label: 'Fight Club' },
  { to: '/gangs',     label: 'Gangs'      },
  { to: '/wars',      label: 'Turf Wars'  },
  { to: '/players',   label: 'Players'    },
  { to: '/trades',    label: 'Trades'     },
];

function EvidenceBoard({ character, lockedOut }) {
  // Polar coordinates around the centre, starting from the top
  // (-90°) and going clockwise. radius is in percentage of the
  // container's half-width — 38 leaves room for the node circles.
  const RADIUS = 38;
  const positions = NODES.map((_, i) => {
    const angle = ((-90 + (i * 360 / NODES.length)) * Math.PI) / 180;
    return {
      x: 50 + RADIUS * Math.cos(angle),
      y: 50 + RADIUS * Math.sin(angle),
    };
  });

  return (
    <div className="relative w-full max-w-3xl mx-auto aspect-square">
      {/* Backdrop: subtle radial vignette to evoke a lit corkboard. */}
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

      {/* String layer — drawn first so nodes/avatar render on top. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none">
        {positions.map((p, i) => (
          <line
            key={NODES[i].to}
            x1="50" y1="50"
            x2={p.x} y2={p.y}
            stroke="rgba(220, 38, 38, 0.45)"
            strokeWidth="0.25"
            strokeDasharray="0.9 0.5"
            strokeLinecap="round"
          />
        ))}
        {/* Centre pin — small disc behind the avatar to feel like a thumbtack. */}
        <circle cx="50" cy="50" r="0.7" fill="#fbbf24" opacity="0.6" />
      </svg>

      {/* Node layer — clickable Links, positioned with %s. */}
      {NODES.map((n, i) => {
        const p = positions[i];
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={(e) => { if (lockedOut) e.preventDefault(); }}
            aria-disabled={lockedOut}
            className={`absolute -translate-x-1/2 -translate-y-1/2 select-none
              w-16 h-16 sm:w-20 sm:h-20
              rounded-full border-2
              flex items-center justify-center text-center text-[10px] sm:text-xs uppercase tracking-wide
              transition
              ${lockedOut
                ? 'border-ink-100/15 bg-ink-950/70 text-ink-100/30 cursor-not-allowed'
                : 'border-blood-500/50 bg-ink-950/85 text-ink-100/85 hover:border-blood-400 hover:bg-ink-900 hover:scale-110 hover:text-white shadow-md shadow-black/40 backdrop-blur'}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <span className="px-1 leading-tight">{n.label}</span>
          </Link>
        );
      })}

      {/* Centre — the player. Larger circle, blood-red gradient. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className="w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-blood-500
            bg-gradient-to-br from-blood-700 via-blood-800 to-blood-900
            flex flex-col items-center justify-center text-center
            shadow-2xl shadow-blood-500/40 px-2">
          <div className="font-display text-base sm:text-xl leading-tight text-white truncate max-w-[90%]">
            {character.name}
          </div>
          <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-blood-100/85 mt-0.5">
            Lvl {character.at_max_level ? '999+' : character.level}
          </div>
          <div className="text-[9px] sm:text-[10px] text-blood-100/70 leading-tight">
            {character.rank}
          </div>
          <div className="mt-1">
            <FactionBadge faction={character.faction} />
          </div>
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
      {/* Status banner — only when the player is locked out of normal play. */}
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

      {/* The board — central hero element, replaces the old inventory dump. */}
      <EvidenceBoard character={c} lockedOut={lockedOut} />

      {/* Two-column row: daily reward + recent activity. */}
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
