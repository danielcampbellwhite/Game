import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Card from '../components/Card.jsx';
import FactionBadge from '../components/FactionBadge.jsx';
import LogFeed from '../components/LogFeed.jsx';
import ClothingSvg from '../components/ClothingSvg.jsx';
import { fmt } from '../components/Money.jsx';
import Timer from '../components/Timer.jsx';

const OUTFIT_SLOTS = ['hat', 'top', 'bottom', 'shoes', 'accessory'];
const OUTFIT_LABELS = { hat: 'Hat', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', accessory: 'Accessory' };

// Small five-slot outfit strip on the dashboard. Reads
// equipped_clothing from publicCharacter — no extra fetch. Empty
// slots render as muted placeholders so it's clear at a glance
// what's still missing.
function OutfitPanel({ c }) {
  const outfit = c?.equipped_clothing || {};
  const total = OUTFIT_SLOTS.reduce((n, s) => n + (outfit[s] ? 1 : 0), 0);
  return (
    <Card title="Outfit" subtitle={total === 0
      ? 'Nothing on. Visit a clothing store to kit yourself out.'
      : `${total}/5 slots filled. Manage from Inventory → Wardrobe.`}
      right={
        <div className="flex gap-2">
          <Link to="/inventory?tab=wardrobe" className="btn btn-ghost text-xs">Manage</Link>
        </div>
      }>
      <div className="grid grid-cols-5 gap-2">
        {OUTFIT_SLOTS.map(slot => {
          const id = outfit[slot];
          return (
            <div key={slot} className="rounded-lg p-2 border border-ink-100/10 bg-ink-950/40 flex flex-col items-center">
              <div className="text-[10px] uppercase tracking-wide text-ink-100/50">{OUTFIT_LABELS[slot]}</div>
              <div className="w-14 h-14 mt-1 rounded bg-ink-900/60 flex items-center justify-center">
                {id ? <ClothingSvg id={id} size={56} /> : <span className="text-ink-100/25 text-xl">·</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Evidence Board ────────────────────────────────────────────
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
  { to: '/city',       label: 'City',        teaser: 'Streets & shops',    style: 'note' },
  { to: '/missions',   label: 'Missions',    teaser: 'Daily ops',          style: 'note' },
  { to: '/crimes',     label: 'Crimes',      teaser: 'Solo & crew jobs',   style: 'note' },
  { to: '/businesses', label: 'Businesses',  teaser: 'Fronts & empire',    style: 'note' },
  { to: '/combat',     label: 'Fight Club',  teaser: 'Knuckles only',      style: 'note' },
  { to: '/gangs',      label: 'Gangs',       teaser: 'Crews & politics',   style: 'note' },
  { to: '/wars',       label: 'Turf Wars',   teaser: 'Active fronts',      style: 'note' },
  { to: '/trades',     label: 'Trades',      teaser: 'Deals on the side',  style: 'note' },
];

// Deterministic per-node tilts so refreshes don't shuffle the board.
const ROT = [-4, 3, -2, 5, -3, 4, -5, 2, -3, 4];

// Stylised fedora-and-suit silhouette for the centre. Sized via parent
// container; viewBox keeps the shape proportional. The tie pop of red
// echoes the strings and faction badge palette.
function GangsterBust() {
  // White stencil so it pops against the dark corkboard. Mid-grey accents
  // (hat band, lapels, head shadow) preserve depth without going dark.
  // Tie stays red as the anchor pop of colour.
  const FILL_MAIN   = '#fafaf9';   // ink-50 — main silhouette
  const FILL_ACCENT = '#a8a29e';   // stone-400 — band / lapels
  const FILL_SHADE  = '#e7e5e4';   // stone-200 — head-under-brim
  const FILL_COLLAR = '#1f1d1b';   // dark — pops against white shirt
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {/* drop shadow */}
      <ellipse cx="50" cy="128" rx="42" ry="3" fill="rgba(0,0,0,0.5)" />
      {/* fedora brim */}
      <ellipse cx="50" cy="36" rx="42" ry="6" fill={FILL_MAIN} />
      {/* fedora crown */}
      <path d="M 26 35 C 26 14, 38 10, 50 10 C 62 10, 74 14, 74 35 Z" fill={FILL_MAIN} />
      {/* hat band */}
      <ellipse cx="50" cy="33" rx="25" ry="2" fill={FILL_ACCENT} />
      {/* shoulders / coat */}
      <path d="M 8 96 C 8 80, 22 67, 36 64 L 50 78 L 64 64 C 78 67, 92 80, 92 96 L 92 130 L 8 130 Z" fill={FILL_MAIN} />
      {/* lapel left */}
      <path d="M 36 64 L 50 78 L 46 100 L 38 76 Z" fill={FILL_ACCENT} />
      {/* lapel right */}
      <path d="M 64 64 L 50 78 L 54 100 L 62 76 Z" fill={FILL_ACCENT} />
      {/* shirt collar */}
      <path d="M 46 76 L 54 76 L 53 84 L 47 84 Z" fill={FILL_COLLAR} />
      {/* tie */}
      <path d="M 47 80 L 53 80 L 55 110 L 50 118 L 45 110 Z" fill="#991b1b" />
    </svg>
  );
}

function ArticleNode({ node, x, y, rotation, lockedOut, focused, dimmed }) {
  const isPaper = node.style === 'paper';
  // Focus state pops the card forward — bigger, untilted, brighter
  // border, on top z-axis. The non-focused-but-something-is-focused
  // case fades the card to push attention to the highlighted one.
  const transform =
    `translate(-50%, -50%) rotate(${focused ? 0 : rotation}deg) scale(${focused ? 1.35 : 1})`;
  return (
    <Link
      to={node.to}
      onClick={(e) => { if (lockedOut) e.preventDefault(); }}
      aria-disabled={lockedOut}
      className={`absolute select-none
        transition-[transform,opacity,filter] duration-150 ease-out
        ${lockedOut ? 'opacity-40 cursor-not-allowed' : ''}
        ${focused ? 'z-30' : dimmed ? 'opacity-50 z-10' : 'z-10'}`}
      style={{
        left: `${x}%`, top: `${y}%`,
        transform,
        filter: focused ? 'drop-shadow(0 0 12px rgba(220, 38, 38, 0.55))' : undefined,
      }}>
      {isPaper ? (
        <div className={`w-20 sm:w-24 bg-amber-50 shadow-lg shadow-black/60 rounded-sm overflow-hidden ${focused ? 'border-2 border-blood-500' : 'border border-stone-700/30'}`}>
          <div className="px-1.5 pt-1 pb-0.5 text-[6px] uppercase tracking-[0.2em] text-blood-800 border-b border-stone-800/40 font-medium">
            The Daily
          </div>
          <div className="px-1.5 py-1">
            <div className="font-display text-sm sm:text-base text-stone-900 leading-tight">{node.label}</div>
            <div className="text-[11px] italic text-stone-700/85 leading-snug mt-0.5">{node.teaser}</div>
          </div>
        </div>
      ) : (
        <div className={`w-20 sm:w-24 bg-amber-100 shadow-lg shadow-black/60 rounded-sm overflow-hidden relative ${focused ? 'border-2 border-blood-500' : 'border border-stone-700/30'}`}>
          {/* red left margin */}
          <div className="absolute left-1.5 top-0 bottom-0 w-px bg-blood-600/70" />
          {/* horizontal rule lines */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(transparent 0px, transparent 9px, rgba(31,29,27,0.18) 10px)',
            }} />
          <div className="relative px-1.5 py-1.5 pl-3">
            <div className="font-display text-sm sm:text-base text-stone-900 leading-tight">{node.label}</div>
            <div className="text-[11px] italic text-stone-700/85 leading-snug mt-0.5">{node.teaser}</div>
          </div>
        </div>
      )}
    </Link>
  );
}

// Vintage Polaroid-style frame for the centre of the evidence board.
// Renders the player's uploaded avatar (sepia + grain) when present,
// then their emoji avatar, then falls back to the gangster bust.
// The cream stock + caption strip + slight tilt do the heavy lifting.
function PolaroidFrame({ character }) {
  const hasImage = !!character?.avatar_image;
  const hasEmoji = !!character?.avatar;
  return (
    <div
      className="w-full h-full bg-amber-50 p-1.5 pb-5 sm:p-2 sm:pb-6 shadow-lg shadow-black/60 border border-stone-700/40 relative"
      style={{ transform: 'rotate(-2.5deg)' }}>
      <div className="w-full h-full bg-stone-900 overflow-hidden relative">
        {hasImage ? (
          <img
            src={character.avatar_image}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: 'sepia(0.55) contrast(1.1) brightness(0.95) saturate(0.85)' }}
          />
        ) : hasEmoji ? (
          <div className="w-full h-full flex items-center justify-center text-4xl sm:text-6xl bg-stone-800/80">
            <span style={{ filter: 'sepia(0.4) contrast(1.05)' }}>{character.avatar}</span>
          </div>
        ) : (
          <div className="w-full h-full" style={{ filter: 'sepia(0.4) contrast(1.05)' }}>
            <GangsterBust />
          </div>
        )}
        {/* Faint photographic grain — very subtle radial gradient. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)',
            mixBlendMode: 'multiply',
          }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 text-center text-[7px] sm:text-[11px] uppercase tracking-[0.3em] text-stone-700 pb-1 truncate px-1">
        {character?.name || 'wanted'}
      </div>
    </div>
  );
}

function EvidenceBoard({ character, lockedOut }) {
  const nav = useNavigate();
  // Polar layout — start at the top (-90°) and walk clockwise so the
  // first node sits straight above the silhouette. Radius 36 spreads
  // the ring a touch wider; with the smaller card type the outermost
  // edges still stay inside the container on a 360px-wide phone.
  const RADIUS = 36;
  const positions = NODES.map((_, i) => {
    const angle = ((-90 + (i * 360 / NODES.length)) * Math.PI) / 180;
    return {
      x: 50 + RADIUS * Math.cos(angle),
      y: 50 + RADIUS * Math.sin(angle),
    };
  });

  // ── Proximity focus ─────────────────────────────────────
  // Track the pointer in container-percent coords; the closest node
  // within FOCUS_THRESHOLD lights up + scales. Works on both touch
  // (drag your finger across the board to scrub through nodes) and
  // mouse (hover does the same thing). Releasing the pointer commits
  // the highlighted node — so dragging to a card and lifting your
  // finger navigates without a separate tap.
  const wrapRef = useRef(null);
  const [focusedId, setFocusedId] = useState(null);
  const focusedRef = useRef(null);
  const FOCUS_THRESHOLD = 22;   // %-distance — generous so neighbours don't fight

  function setFocus(id) {
    focusedRef.current = id;
    setFocusedId(id);
  }
  function updateFocusFromEvent(e) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    let bestId = null;
    let bestDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const dx = positions[i].x - x;
      const dy = positions[i].y - y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) { bestDist = d; bestId = NODES[i].to; }
    }
    setFocus(bestDist < FOCUS_THRESHOLD ? bestId : null);
  }
  function clearFocus() { setFocus(null); }
  function commitFocus() {
    // Read from the ref, not the closure — pointer events fire faster
    // than React batches state, so focusedId may be stale here.
    const id = focusedRef.current;
    if (lockedOut || !id) return;
    nav(id);
  }

  return (
    <div
      className="relative w-full max-w-3xl mx-auto aspect-square touch-none"
      ref={wrapRef}
      onPointerMove={updateFocusFromEvent}
      onPointerDown={updateFocusFromEvent}
      onPointerUp={commitFocus}
      onPointerLeave={clearFocus}
      onPointerCancel={clearFocus}>
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

      {/* String layer — drawn before nodes so they render on top.
          The string to the focused node thickens and brightens. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none">
        {positions.map((p, i) => {
          const isFocused = focusedId === NODES[i].to;
          const stroke = isFocused
            ? 'rgba(248, 113, 113, 0.95)'
            : focusedId
              ? 'rgba(220, 38, 38, 0.18)'
              : 'rgba(220, 38, 38, 0.5)';
          return (
            <line
              key={NODES[i].to}
              x1="50" y1="50"
              x2={p.x} y2={p.y}
              stroke={stroke}
              strokeWidth={isFocused ? 0.45 : 0.25}
              strokeDasharray="0.9 0.5"
              strokeLinecap="round"
              style={{ transition: 'stroke 150ms ease, stroke-width 150ms ease' }}
            />
          );
        })}
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
          focused={focusedId === n.to}
          dimmed={!!focusedId && focusedId !== n.to}
        />
      ))}

      {/* Centre — old camera-photo of the player, hung on the
          corkboard. Acts as a jump-link to the character sheet. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <button
          type="button"
          onClick={() => document.getElementById('character-sheet')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          aria-label="Jump to character sheet"
          className="w-20 h-28 sm:w-28 sm:h-40 cursor-pointer transition-transform duration-150 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-blood-500
            drop-shadow-[0_0_14px_rgba(220,38,38,0.45)] drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]">
          <PolaroidFrame character={character} />
        </button>
      </div>
    </div>
  );
}

function PrettyCity({ city }) {
  if (!city) return null;
  return city.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}

// Slim banner shown when a detective has opened a case on the player.
// Reads /api/investigations on mount and re-polls every 30s. Hidden
// when there's no active investigation. The pending-trial state is
// handled separately by App.jsx's lockout redirect to /trial.
function InvestigationBanner() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await api.get('/investigations');
        if (alive) setData(r);
      } catch { /* ignore — banner is non-critical */ }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const inv = data?.investigation;
  const record = data?.record;
  if (!inv && (!record || record.weight === 0)) return null;
  if (!inv) {
    // No live case, but you've got a record. Soft reminder, no progress bar.
    return (
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink-100/45">Criminal record</div>
            <div className="font-display text-base text-ink-50 mt-0.5">
              {record.bandLabel} <span className="text-ink-100/45 text-[13px]">· {record.weight} conviction{record.weight === 1 ? '' : 's'} on file</span>
            </div>
            {record.weight >= 3 && (
              <p className="text-[12px] text-ink-100/55 leading-snug mt-1">
                Cops aren't going easy on you. Jail times are {record.weight >= 5 ? '+50%' : '+25%'} until older marks roll off.
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }
  const pct = Math.round((inv.courtChance || 0) * 100);
  const colour = pct < 25 ? 'bg-gold-400' : pct < 60 ? 'bg-blood-500' : 'bg-blood-400';
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-blood-400">Active investigation</div>
          <div className="font-display text-base text-ink-50 mt-0.5">{inv.detective}</div>
          <p className="text-[12px] text-ink-100/55 leading-snug mt-1">
            Building a case on you. Each <span className="text-blood-300">failed</span> crime now rolls a
            heat-scaled chance of going straight to court (1.5% per heat point above 50).
            Cool off or live with the odds.
          </p>
        </div>
        <div className="text-right shrink-0 tabular-nums">
          <div className="text-[12px] uppercase text-ink-100/45">Court risk</div>
          <div className="text-lg text-ink-50">{pct}%</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 bg-ink-900/70 rounded overflow-hidden">
        <div className={`h-full ${colour} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}

// Resize the picked file to a square 256px webp on a canvas, then
// base64-encode and POST to /api/character/avatar. The server
// validates type + size; we keep the heavy lifting on the client so
// the wire payload stays under 50KB even for a multi-MB phone photo.
function AvatarUploader({ entity, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function fileToWebp(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      // Square crop to the smaller dimension, then scale to 256px.
      const SIZE = 256;
      const side = Math.min(img.width, img.height);
      const sx = Math.max(0, Math.floor((img.width - side) / 2));
      const sy = Math.max(0, Math.floor((img.height - side) / 2));
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      return canvas.toDataURL('image/webp', 0.82);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('Pick an image file.'); return; }
    setBusy(true); setErr(null);
    try {
      const dataUrl = await fileToWebp(file);
      await api.post('/character/avatar', { image: dataUrl });
      await onChange?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function clearImage() {
    setBusy(true); setErr(null);
    try {
      await api.delete('/character/avatar');
      await onChange?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="shrink-0 relative">
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        aria-label={entity?.avatar_image ? 'Edit profile picture' : 'Upload profile picture'}
        className="relative block group focus:outline-none focus-visible:ring-2 focus-visible:ring-blood-500 rounded-full">
        <Avatar entity={entity} size={64} />
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[12px] uppercase tracking-wide text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition pointer-events-none"
          aria-hidden>
          {busy ? '…' : entity?.avatar_image ? 'Edit' : 'Upload'}
        </span>
        {/* Always-visible camera nub in the corner so the edit
            affordance is obvious on touch devices where there is no
            hover state. */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blood-700 border border-ink-950 flex items-center justify-center shadow"
          aria-hidden>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M3 7h3l2-3h8l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
      {entity?.avatar_image && (
        <button type="button" disabled={busy} onClick={clearImage}
          className="block mt-1 text-[12px] text-ink-100/45 hover:text-ink-100/75 transition w-full text-center">
          Remove
        </button>
      )}
      {err && <div className="text-[12px] text-blood-400 mt-0.5 max-w-[120px] text-center">{err}</div>}
    </div>
  );
}

function CharacterSheet({ c, onAvatarChange }) {
  const stats = [
    ['STR', c.strength],
    ['DEF', c.defence],
    ['SPD', c.speed],
    ['INT', c.intelligence],
  ];
  const money = [
    ['Cash',      c.cash],
    ['Bank',      c.bank],
    ['Net worth', c.net_worth],
  ];
  return (
    <div id="character-sheet" className="scroll-mt-4">
    <Card>
      <div className="flex items-start gap-3">
        <AvatarUploader entity={c} onChange={onAvatarChange} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-xl text-ink-50 truncate">{c.name}</h2>
            <FactionBadge faction={c.faction} />
          </div>
          <p className="text-xs text-ink-100/60 mt-0.5">
            Lvl {c.level}{c.prestige ? ` ★${c.prestige}` : ''} · {c.rank}
            {c.city && <> · <PrettyCity city={c.city} /></>}
          </p>
          <p className="text-[12px] uppercase tracking-wide text-ink-100/45 mt-0.5">
            Reputation <span className="text-gold-400 tabular-nums">{c.reputation.toLocaleString()}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        {money.map(([label, value]) => (
          <div key={label} className="rounded-md bg-ink-900/50 px-2 py-1.5 leading-tight">
            <div className="text-[12px] uppercase tracking-wide text-ink-100/55">{label}</div>
            <div className="text-sm tabular-nums text-money-400 font-medium truncate">{fmt(value)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-md bg-ink-900/50 px-2 py-1.5 text-center leading-tight">
            <div className="text-[12px] uppercase tracking-wide text-ink-100/55">{label}</div>
            <div className="text-sm tabular-nums text-ink-50">{value.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </Card>
    </div>
  );
}

// Retirement / prestige prompt — shown only when the player has hit
// the level cap and still has prestige tiers available. Confirms
// before resetting because the action is consequential.
function RetirementCard({ c, onDone }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState(null);
  const newPrestige = (c.prestige || 0) + 1;
  async function retire() {
    setBusy(true); setErr(null);
    try {
      await api.post('/character/retire');
      setConfirming(false);
      await onDone?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <Card title=" Retire & Prestige" subtitle={`You've capped at level ${c.level}. Step back to start a new prestige cycle.`}>
      <p className="text-xs text-ink-100/65">
        You'll keep your <span className="text-money-300">cash, bank, properties, businesses, vehicles and stocks</span>,
        and gain <span className="text-money-400">+2% max energy & nerve forever</span>{' '}
        (★ {newPrestige}/5).
      </p>
      <p className="text-[13px] text-ink-100/55 mt-1">
        Reset: level → 1, all stats → 1, reputation → 0, inventory wiped, equipped gear cleared,
        gang membership lost. The streets won't remember your old grind.
      </p>
      {err && <p className="text-[13px] text-blood-400 mt-2">{err}</p>}
      {!confirming ? (
        <button onClick={() => setConfirming(true)} disabled={busy}
          className="btn btn-primary text-xs mt-3">
          Retire to ★ {newPrestige}
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={retire} disabled={busy} className="btn btn-money text-xs flex-1">
            {busy ? '…' : `Confirm — Retire to ★ ${newPrestige}`}
          </button>
          <button onClick={() => setConfirming(false)} disabled={busy} className="btn btn-ghost text-xs">
            Cancel
          </button>
        </div>
      )}
    </Card>
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

      <InvestigationBanner />

      <EvidenceBoard character={c} lockedOut={lockedOut} />

      <CharacterSheet c={c} onAvatarChange={refresh} />
      <OutfitPanel c={c} />

      {c.at_max_level && (c.prestige || 0) < 5 && (
        <RetirementCard c={c} onDone={refresh} />
      )}

      {(c.level || 0) >= 25 && !c.specialisation && (
        <Card title=" Pick a specialisation"
          subtitle="You've hit level 25 — time to commit to a criminal path. Five passive perks per path, locked in until you retire.">
          <Link to="/specialisations" className="btn btn-primary text-xs">Choose your path →</Link>
        </Card>
      )}

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
