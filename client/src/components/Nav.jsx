import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { api } from '../api.js';
import { useEventStream } from '../hooks/useEventStream.js';

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

function NotificationBell() {
  const [data, setData] = useState({ items: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef();

  async function load() {
    try { setData(await api.get('/notifications')); } catch {}
  }
  useEffect(() => {
    load();
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, []);

  // Close on outside click
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
      // Optimistic clear
      setData({ ...data, unreadCount: 0, items: data.items.map(x => ({ ...x, unread: false })) });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative px-2 py-1 rounded-md hover:bg-ink-800/60 transition"
        aria-label="Notifications">
        <span className="text-xl">🔔</span>
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

export default function Nav() {
  const { logout, character } = useGame();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);

  // Initial fetch + SSE-driven updates for the Messages link badge.
  useEffect(() => {
    if (!character) return;
    api.get('/messages/unread').then(r => setDmUnread(r.total_unread || 0)).catch(() => {});
  }, [character?.id]);
  useEventStream('dm.received', (p) => {
    if (p?.total_unread != null) setDmUnread(p.total_unread);
  });
  useEventStream('dm.unread', (p) => {
    if (p?.total_unread != null) setDmUnread(p.total_unread);
  });

  const now = Date.now();
  const inHospital = character?.hospital_until && character.hospital_until > now;
  const inJail     = character?.jail_until     && character.jail_until     > now;
  const lockedOut  = inHospital || inJail;

  const linkClass = (l, isActive) => {
    if (lockedOut) return 'px-2.5 py-1.5 text-xs rounded-md text-ink-100/30 cursor-not-allowed line-through';
    return `px-2.5 py-1.5 text-xs rounded-md ${isActive ? 'bg-blood-700 text-white' : 'hover:bg-ink-800/70'}`;
  };
  const onClickGuard = (e) => { if (lockedOut) e.preventDefault(); };

  const charChipClass = lockedOut
    ? 'flex items-center gap-2 px-2 py-1 rounded-md text-ink-100/30 cursor-not-allowed line-through'
    : 'flex items-center gap-2 px-2 py-1 rounded-md hover:bg-ink-800/60 transition';

  return (
    <header className="border-b border-ink-100/10 bg-ink-950/85 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <button className="md:hidden btn btn-ghost px-2 py-1" onClick={() => setOpen(!open)} aria-label="menu">☰</button>
        <div className="font-display text-2xl text-blood-500 hidden sm:block">MAFIA LIFE</div>

        <Link to="/" onClick={onClickGuard} className={charChipClass} aria-label="Dashboard">
          <span className="text-2xl leading-none">{character?.avatar}</span>
          <div className="hidden sm:block leading-tight">
            <div className="text-sm font-medium">{character?.name}</div>
            <div className="text-[10px] text-ink-100/50">Lvl {character?.at_max_level ? '999+' : character?.level} · {character?.rank}</div>
          </div>
        </Link>

        <nav className="hidden md:flex flex-wrap gap-1 ml-auto">
          {links.map(l => (
            <NavLink key={l.to} to={l.to}
              onClick={onClickGuard}
              className={({isActive}) => linkClass(l, isActive)}>
              {l.label}
            </NavLink>
          ))}
          {inHospital && (
            <NavLink to="/hospital" className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600 text-white animate-pulse">
              🏥 Hospital
            </NavLink>
          )}
          {inJail && (
            <NavLink to="/jail" className="px-2.5 py-1.5 text-xs rounded-md bg-yellow-600 text-white animate-pulse">
              🚓 Jail
            </NavLink>
          )}
        </nav>

        <div className="md:ml-2 ml-auto flex items-center gap-2 text-xs">
          <Link
            to="/messages"
            onClick={onClickGuard}
            aria-label="Messages"
            className={`relative px-2 py-1 rounded-md transition ${lockedOut ? 'text-ink-100/30 cursor-not-allowed' : 'hover:bg-ink-800/60'}`}>
            <span className="text-xl">✉️</span>
            {dmUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-blood-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-tight">
                {dmUnread > 99 ? '99+' : dmUnread}
              </span>
            )}
          </Link>
          <NotificationBell />
          <button className="btn btn-ghost text-xs" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-ink-100/10 grid grid-cols-3 gap-1 p-2">
          {inHospital && (
            <NavLink to="/hospital" onClick={() => setOpen(false)}
              className="col-span-3 text-center px-2 py-2 text-xs rounded bg-blue-600 text-white">
              🏥 You're in hospital — tap here
            </NavLink>
          )}
          {inJail && (
            <NavLink to="/jail" onClick={() => setOpen(false)}
              className="col-span-3 text-center px-2 py-2 text-xs rounded bg-yellow-600 text-white">
              🚓 You're in jail — tap here
            </NavLink>
          )}
          {links.map(l => (
            <NavLink key={l.to} to={l.to}
              onClick={(e) => { onClickGuard(e); if (!e.defaultPrevented) setOpen(false); }}
              className={({isActive}) =>
                lockedOut
                  ? 'text-center px-2 py-2 text-xs rounded bg-ink-800/20 text-ink-100/30 line-through'
                  : `text-center px-2 py-2 text-xs rounded ${isActive ? 'bg-blood-700 text-white' : 'bg-ink-800/40'}`
              }>
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
