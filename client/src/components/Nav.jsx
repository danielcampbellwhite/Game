import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { api } from '../api.js';
import { useEventStream } from '../hooks/useEventStream.js';
import { fmt } from './Money.jsx';

const links = [
  { to: '/inventory', label: 'Inventory' },
  { to: '/missions',  label: 'Missions'  },
  { to: '/jobs',      label: 'Job Board' },
  { to: '/city',      label: 'City'      },
  { to: '/crimes',    label: 'Crimes'    },
  { to: '/oc',        label: 'Heists'    },
  { to: '/combat',    label: 'Fight Club'},
  { to: '/gangs',     label: 'Gangs'     },
  { to: '/wars',      label: 'Turf Wars' },
  { to: '/players',   label: 'Players'   },
  { to: '/trades',    label: 'Trades'    },
];

const TYPE_COLOR = {
  crime: 'text-blood-400',
  combat: 'text-blood-400',
  jail: 'text-yellow-400',
  hospital: 'text-blue-300',
  job: 'text-money-400',
  travel: 'text-cyan-300',
  business: 'text-emerald-400',
  bookmaker: 'text-gold-400',
  bank: 'text-money-400',
  system: 'text-ink-100/70',
};

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Two-tone Web Audio chime — synthesised on the fly so we don't need an
// asset file. AudioContext is lazy and reused; browsers suspend it until
// the first user gesture, so the first call after page-load is silent
// but subsequent ones (after the user has clicked anything) ring.
let _audioCtx = null;
function playNotificationSound() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!_audioCtx) _audioCtx = new Ctor();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, now);
    o.frequency.setValueAtTime(660, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    o.connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.34);
  } catch {}
}

function NotificationBell() {
  const [data, setData] = useState({ items: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef();
  // Prev unreadCount so we can detect *new* alerts and chime once.
  // null on first load so the initial fetch doesn't ring on page-open.
  const prevUnreadRef = useRef(null);

  async function load() {
    try {
      const r = await api.get('/notifications');
      if (prevUnreadRef.current !== null && r.unreadCount > prevUnreadRef.current) {
        playNotificationSound();
      }
      prevUnreadRef.current = r.unreadCount;
      setData(r);
    } catch {}
  }
  useEffect(() => {
    load();
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unreadCount > 0) {
      await api.post('/notifications/seen');
      setData({ ...data, unreadCount: 0, items: data.items.map(x => ({ ...x, unread: false })) });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative px-2 py-1 rounded-md hover:bg-ink-800/60 transition text-base text-ink-100/75"
        aria-label="Notifications"
        title="Notifications">
        🔔
        {data.unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-blood-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-tight">
            {data.unreadCount > 99 ? '99+' : data.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-ink-100/15 bg-ink-950/95 backdrop-blur shadow-2xl shadow-black/60 overflow-hidden">
          <div className="px-3 py-2 border-b border-ink-100/10 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-ink-100/60">Notifications</span>
            <span className="text-[10px] text-ink-100/40">{data.items.length} recent</span>
          </div>
          {!data.items.length ? (
            <div className="p-4 text-xs text-ink-100/45 text-center">No notifications yet.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto scrollbar">
              {data.items.map(n => (
                <li key={n.id}
                  className={`px-3 py-2 border-b border-ink-100/5 last:border-0 ${n.unread ? 'bg-blood-700/10' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`uppercase text-[9px] tracking-wide ${TYPE_COLOR[n.type] || 'text-ink-100/60'}`}>{n.type}</span>
                    <span className="text-[10px] text-ink-100/40 whitespace-nowrap">{timeAgo(n.created_at)} ago</span>
                  </div>
                  <div className="text-xs text-ink-100/85 mt-0.5">{n.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Compact inline stat — label, value, and a thin progress sliver. Used
// in the condensed header strip; keeps four vitals + cash legible at a
// glance without taking the full row of bars StatsBar used.
function MiniStat({ label, value, max, color, money }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="min-w-0 leading-tight">
      <div className="flex items-baseline justify-between gap-2 text-[10px] uppercase text-ink-100/55">
        <span>{label}</span>
        <span className={`tabular-nums ${money ? 'text-money-400 font-medium' : 'text-ink-100/85'}`}>
          {money ? fmt(value) : `${value}/${max}`}
        </span>
      </div>
      {!money && (
        <div className="h-[3px] rounded-full bg-ink-100/10 overflow-hidden">
          <div className={color} style={{ width: pct + '%', height: '100%' }} />
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const { logout, character } = useGame();
  const nav = useNavigate();
  const [dmUnread, setDmUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // Prev DM count for chiming on increases. null on mount so the initial
  // fetch doesn't ring; SSE deltas after that *should* ring.
  const prevDmRef = useRef(null);
  function applyDmUnread(n) {
    if (prevDmRef.current !== null && n > prevDmRef.current) {
      playNotificationSound();
    }
    prevDmRef.current = n;
    setDmUnread(n);
  }

  useEffect(() => {
    if (!character) return;
    api.get('/messages/unread').then(r => applyDmUnread(r.total_unread || 0)).catch(() => {});
  }, [character?.id]);
  useEventStream('dm.received', (p) => {
    if (p?.total_unread != null) applyDmUnread(p.total_unread);
  });
  useEventStream('dm.unread', (p) => {
    if (p?.total_unread != null) applyDmUnread(p.total_unread);
  });

  const now = Date.now();
  const inHospital = character?.hospital_until && character.hospital_until > now;
  const inJail     = character?.jail_until     && character.jail_until     > now;
  const lockedOut  = inHospital || inJail;

  const linkClass = (isActive) => {
    // No `shrink-0` — on mobile (flex column) we want each link to fill
    // the row; on desktop the wrap layout collapses naturally.
    if (lockedOut) return 'px-3 py-2 md:py-1.5 text-xs rounded-md text-ink-100/30 cursor-not-allowed line-through';
    return `px-3 py-2 md:py-1.5 text-xs rounded-md whitespace-nowrap ${isActive ? 'bg-blood-700 text-white' : 'hover:bg-ink-800/70 text-ink-100/85'}`;
  };
  const onClickGuard = (e) => { if (lockedOut) e.preventDefault(); };

  const charChipClass = lockedOut
    ? 'flex items-center gap-2 px-2 py-1 rounded-md text-ink-100/30 cursor-not-allowed line-through'
    : 'flex items-center gap-2 px-2 py-1 rounded-md hover:bg-ink-800/60 transition';

  const xpPct = character && !character.at_max_level && character.xp_to_next
    ? Math.max(0, Math.min(100, (character.xp / character.xp_to_next) * 100))
    : 0;

  return (
    <header className="border-b border-ink-100/10 bg-ink-950/85 backdrop-blur">
      {/*  Top bar — branding + character chip + actions  */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
        <Link to="/" className="font-display text-xl sm:text-2xl text-blood-500 shrink-0" aria-label="Home">
          MAFIA LIFE
        </Link>

        <Link to="/" onClick={onClickGuard} className={charChipClass + ' min-w-0'} aria-label="Dashboard">
          <div className="leading-tight min-w-0">
            <div className="text-sm font-medium truncate">{character?.name}</div>
            <div className="text-[10px] text-ink-100/50">
              Lvl {character?.at_max_level ? '999+' : character?.level} · {character?.rank}
            </div>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2 text-xs">
          <Link
            to="/messages"
            onClick={onClickGuard}
            aria-label="Messages"
            title="Messages"
            className={`relative px-2 py-1 rounded-md transition text-base ${lockedOut ? 'text-ink-100/30 cursor-not-allowed' : 'hover:bg-ink-800/60 text-ink-100/75'}`}>
            ✉
            {dmUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-blood-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-tight">
                {dmUnread > 99 ? '99+' : dmUnread}
              </span>
            )}
          </Link>
          <NotificationBell />
          {character?.is_admin && (
            <Link to="/admin"
              className="px-2 py-1 rounded-md text-[11px] uppercase tracking-wide text-blood-400 hover:bg-ink-800/60 transition"
              title="God mode">
              Admin
            </Link>
          )}
          {/* Mobile-only hamburger — toggles the nav-links drawer below.
              Desktop (md+) renders the nav links inline so this is hidden. */}
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden px-2 py-1 rounded-md hover:bg-ink-800/60 text-ink-100/85 text-lg leading-none">
            ☰
          </button>
        </div>
      </div>

      {/*  Condensed stats strip  */}
      {character && (
        <div className="border-t border-ink-100/10 bg-ink-900/40">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1.5 grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-1 text-xs">
            <MiniStat label="Energy"  value={character.energy}    max={character.max_energy} color="bg-yellow-400" />
            <MiniStat label="Health"  value={character.health}    max={character.max_health} color="bg-money-500"  />
            <MiniStat label="Happy"   value={character.happiness} max={100}                  color="bg-pink-400"   />
            <MiniStat label="Cash"    value={character.cash}      money />
            <div className="min-w-0 leading-tight">
              <div className="flex items-baseline justify-between gap-2 text-[10px] uppercase text-ink-100/55">
                <span>{character.at_max_level ? 'Max Lvl' : 'XP'}</span>
                <span className="tabular-nums text-ink-100/85">
                  {character.at_max_level ? '999+' : `${character.xp}/${character.xp_to_next}`}
                </span>
              </div>
              {!character.at_max_level && (
                <div className="h-[3px] rounded-full bg-ink-100/10 overflow-hidden">
                  <div className="bg-gold-500" style={{ width: xpPct + '%', height: '100%' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/*  Nav links
          Desktop (md+): horizontal row, always visible.
          Mobile (<md): hidden by default, opens as a vertical drawer
          when the ☰ button up top is tapped. */}
      <nav className={`border-t border-ink-100/10 ${menuOpen ? 'block' : 'hidden'} md:block`}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1.5 flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-1">
          {(inHospital || inJail) && (
            <NavLink to={inHospital ? '/hospital' : '/jail'}
              onClick={() => setMenuOpen(false)}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-md text-white animate-pulse whitespace-nowrap ${inHospital ? 'bg-blue-600' : 'bg-yellow-600'}`}>
              {inHospital ? 'Hospital — locked' : 'Jail — locked'}
            </NavLink>
          )}
          {links.map(l => (
            <NavLink key={l.to} to={l.to}
              onClick={(e) => { onClickGuard(e); setMenuOpen(false); }}
              className={({isActive}) => linkClass(isActive)}>
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </header>
  );
}
