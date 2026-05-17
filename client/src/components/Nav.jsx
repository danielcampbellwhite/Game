import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { api } from '../api.js';
import { useEventStream } from '../hooks/useEventStream.js';
import { fmt } from './Money.jsx';
import MuteToggle from './MuteToggle.jsx';

// Nav tree — each top-level item has an optional `children` array that
// becomes a click-to-open dropdown. Children also render as flat items
// in the mobile drawer (indented). City fans out to every gated
// location in town; Crimes, Gangs, Players etc. group their related
// pages so everything in the app is reachable from the main nav.
const NAV_TREE = [
  { to: '/inventory', label: 'Inventory', children: [
    { to: '/inventory',          label: 'Loadout & stash' },
    { to: '/customize/weapons',  label: 'Customise weapons' },
    { to: '/customize/vehicles', label: 'Customise vehicles' },
  ]},
  { to: '/car',   label: 'My Car' },
  { to: '/house', label: 'House' },
  { to: '/city',  label: 'City', children: [
    // `locationSlug` makes a child a travel destination: when the
    // player isn't already at this location, the dropdown row gets
    // Walk + Drive buttons so they can launch the trip without
    // walking to /city first. Tapping the label still navigates
    // (the City page handles arrival).
    { to: '/city',            label: 'City map' },
    { to: '/bank',            label: 'Bank',              locationSlug: 'bank' },
    { to: '/general-store',   label: 'General Store',     locationSlug: 'general_store' },
    { to: '/high-street',     label: 'High Street',       locationSlug: 'high_street' },
    { to: '/clothing/low',    label: 'Streetwear Outlet', locationSlug: 'clothing_low' },
    { to: '/clothing/high',   label: 'Atelier',           locationSlug: 'clothing_high' },
    { to: '/dealership',      label: 'Car Dealership',    locationSlug: 'dealership' },
    { to: '/aircraft-dealer', label: 'Aircraft Broker',   locationSlug: 'aircraft_dealer' },
    { to: '/chop-shop',       label: 'Chop Shop',         locationSlug: 'chop_shop' },
    { to: '/repair',          label: 'Repair Shop',       locationSlug: 'repair' },
    { to: '/gun-store',       label: 'Gun Store',         locationSlug: 'gun_store' },
    { to: '/drugs',           label: 'The Block (drugs)', locationSlug: 'drug_market' },
    { to: '/fence',           label: 'The Fence',         locationSlug: 'fence' },
    { to: '/property',        label: 'Estate Agent',      locationSlug: 'estate_agent' },
    { to: '/stocks',          label: 'Stock Brokerage',   locationSlug: 'brokerage' },
    { to: '/travel',          label: 'Airport',           locationSlug: 'airport' },
    { to: '/casino',          label: 'Casino',            locationSlug: 'casino' },
    { to: '/bookmaker',       label: 'Bookmaker',         locationSlug: 'bookmaker' },
    { to: '/gym',             label: 'Gym',               locationSlug: 'gym' },
    { to: '/range',           label: 'Shooting Range',    locationSlug: 'range' },
    { to: '/university',      label: 'University',        locationSlug: 'university' },
    { to: '/driving-school',  label: 'Driving School',    locationSlug: 'driving_school' },
    { to: '/hospital',        label: 'Hospital',          locationSlug: 'hospital' },
    { to: '/jail',            label: 'Jail',              locationSlug: 'jail' },
  ]},
  // Online services now live behind the phone in the bottom-right
  // corner — no top-level Online nav link needed.
  { to: '/crimes',     label: 'Crimes', children: [
    { to: '/crimes',    label: 'Solo crimes' },
    { to: '/burglary',  label: 'Burglary' },
    { to: '/oc',        label: 'Organised crime' },
  ]},
  { to: '/jobs',       label: 'Job Board' },
  { to: '/businesses', label: 'My Businesses' },
  { to: '/combat',     label: 'Fight Club' },
  { to: '/races',      label: 'Street Races' },
  { to: '/bounties',   label: 'Bounties' },
  { to: '/gangs',      label: 'Gangs', children: [
    { to: '/gangs', label: 'Gangs directory' },
    { to: '/gang',  label: 'My Gang' },
    { to: '/wars',  label: 'Wars' },
  ]},
  { to: '/players',    label: 'Players', children: [
    { to: '/players',   label: 'Player directory' },
    { to: '/newspaper', label: 'Daily Gazette' },
    { to: '/shops',     label: 'Player Shops' },
    { to: '/missions',  label: 'Missions' },
  ]},
  { to: '/friends',    label: 'Friends' },
  { to: '/trades',     label: 'Trades' },
  // Account dropdown. Children include action items (no `to`); the
  // NavMenuItem renders those as buttons that fire `action` instead
  // of navigating. Admin link only appears for admin characters.
  { to: '/premium', label: 'Account', children: [
    { to: '/premium', label: 'Gold Bars / Premium' },
    { to: '/patches', label: 'Updates & patches' },
    { adminOnly: true, to: '/admin', label: 'Admin' },
    { signOut: true, label: 'Sign out' },
  ]},
];

// Alphabetic sort by label, used for both the top-level list and
// every dropdown's children. Items without a label (defensive) sink
// to the bottom so they don't tilt the comparison.
function alphabetic(items) {
  return [...items].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
}

// Pre-sort the whole tree once at module load: top-level entries
// alphabetic, and every dropdown's children alphabetic too. Re-used
// by the main nav, the mobile drawer, and the secondary horizontal
// strip so the order is consistent everywhere.
const NAV_TREE_SORTED = alphabetic(NAV_TREE).map(item =>
  item.children ? { ...item, children: alphabetic(item.children) } : item
);

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
  social: 'text-pink-300',
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
  const dropdownRef = useRef();
  // px-shift applied to the dropdown when its left edge would
  // otherwise overflow the viewport (e.g. mobile, where the bell
  // sits to the left of the hamburger so right:0 isn't at the
  // screen edge).
  const [shiftX, setShiftX] = useState(0);
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

  // When the dropdown opens, measure its left edge against the
  // viewport. If it would extend past the left edge, translate it
  // right by the overflow amount + a small gutter. Cleared on close.
  useEffect(() => {
    if (!open) { setShiftX(0); return; }
    const id = requestAnimationFrame(() => {
      const r = dropdownRef.current?.getBoundingClientRect();
      if (!r) return;
      const GUTTER = 8;
      if (r.left < GUTTER) setShiftX(GUTTER - r.left);
    });
    return () => cancelAnimationFrame(id);
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
          <span className="absolute -top-0.5 -right-0.5 bg-blood-500 text-white text-[11px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-tight">
            {data.unreadCount > 99 ? '99+' : data.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={dropdownRef}
          style={{ transform: `translateX(${shiftX}px)` }}
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-ink-100/15 bg-ink-950/95 backdrop-blur shadow-2xl shadow-black/60 overflow-hidden">
          <div className="px-3 py-2 border-b border-ink-100/10 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-ink-100/60">Notifications</span>
            <span className="text-[12px] text-ink-100/40">{data.items.length} recent</span>
          </div>
          {!data.items.length ? (
            <div className="p-4 text-xs text-ink-100/45 text-center">No notifications yet.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto scrollbar">
              {data.items.map(n => (
                <li key={n.id}
                  className={`px-3 py-2 border-b border-ink-100/5 last:border-0 ${n.unread ? 'bg-blood-700/10' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`uppercase text-[11px] tracking-wide ${TYPE_COLOR[n.type] || 'text-ink-100/60'}`}>{n.type}</span>
                    <span className="text-[12px] text-ink-100/40 whitespace-nowrap">{timeAgo(n.created_at)} ago</span>
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
  // For money mode, `color` is an optional Tailwind text class that
  // overrides the default money-green (e.g. blood-red for illegal cash).
  const moneyClass = money ? (color || 'text-money-400') : null;
  return (
    <div className="min-w-0 leading-tight">
      <div className={`flex items-baseline gap-2 text-[12px] uppercase text-ink-100/55 ${money ? 'justify-end' : 'justify-between'}`}>
        <span>{label}</span>
        <span className={`tabular-nums ${money ? `${moneyClass} font-medium` : 'text-ink-100/85'}`}>
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

// One nav item. Without `children` it's a plain NavLink; with
// `children` it's a click-to-open dropdown that closes on outside
// click or when a child link is picked. Active styling kicks in when
// the route equals the parent OR any child.
function NavMenuItem({ item, lockedOut, onPick, linkClass, onClickGuard, isAdmin, onSignOut, currentLocation, hasVehicle, onTravelTo }) {
  const [open, setOpen] = useState(false);
  // Bounding rect of the trigger button — used to position the
  // dropdown with `position: fixed` so it escapes the scrolling
  // SubNavStrip container (overflow-x:auto clips absolute children).
  const [rect, setRect] = useState(null);
  const triggerRef = useRef();
  const dropdownRef = useRef();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // Close on scroll, but ignore scrolls that originate INSIDE the
    // dropdown itself — those are the user scrolling through long
    // child lists (e.g. the City menu), not the page moving under them.
    const onScroll = (e) => {
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  function toggle(e) {
    if (lockedOut) { e.preventDefault(); return; }
    e.preventDefault();
    if (!open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen(o => !o);
  }

  if (!item.children) {
    return (
      <NavLink to={item.to}
        onClick={(e) => { onClickGuard(e); onPick?.(); }}
        className={({ isActive }) => linkClass(isActive)}>
        {item.label}
      </NavLink>
    );
  }

  // Parent dropdown — highlight when the active path matches a child.
  const isActiveParent = (currentPath) =>
    item.children.some(c => currentPath === c.to) || currentPath === item.to;

  // Position the dropdown in viewport space, just below the trigger,
  // and nudge it left to keep it inside the viewport on mobile.
  let style = null;
  if (open && rect) {
    const GUTTER = 8;
    const W = 220;
    let left = rect.left;
    if (left + W + GUTTER > window.innerWidth) left = Math.max(GUTTER, window.innerWidth - W - GUTTER);
    style = { position: 'fixed', top: rect.bottom + 4, left, width: W, zIndex: 50 };
  }

  return (
    <>
      <NavLink to={item.to}
        ref={triggerRef}
        end={false}
        onClick={toggle}
        className={({ isActive }) => `${linkClass(isActive || isActiveParent(window.location.pathname))} flex items-center gap-1 shrink-0`}>
        {item.label}
        <span aria-hidden className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </NavLink>
      {open && style && (
        <div
          ref={dropdownRef}
          style={style}
          className="rounded-md border border-ink-100/15 bg-ink-950/95 backdrop-blur shadow-2xl shadow-black/60 overflow-hidden">
          <ul className="py-1 text-xs max-h-[60vh] overflow-y-auto scrollbar">
            {item.children.map(c => {
              if (c.adminOnly && !isAdmin) return null;
              if (c.signOut) {
                return (
                  <li key="signout">
                    <button
                      type="button"
                      onClick={() => { setOpen(false); onPick?.(); onSignOut?.(); }}
                      className="block w-full text-left px-3 py-1.5 text-blood-300 hover:bg-blood-700/30">
                      {c.label}
                    </button>
                  </li>
                );
              }
              // Location row: show Walk + Drive shortcuts inline so
              // the player can launch the trip without first jumping
              // to /city. The label itself still navigates (handy
              // when you're already at the location and want to enter
              // the building).
              if (c.locationSlug) {
                const here = currentLocation === c.locationSlug;
                return (
                  <li key={c.to} className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <NavLink
                        to={c.to}
                        onClick={(e) => { onClickGuard(e); setOpen(false); onPick?.(); }}
                        className={({ isActive }) =>
                          `flex-1 min-w-0 truncate px-2 py-1 rounded ${isActive || here ? 'bg-blood-700/60 text-white' : 'text-ink-100/85 hover:bg-ink-800/70'}`}>
                        {c.label}{here && <span className="ml-1 text-[10px] uppercase text-money-300">· here</span>}
                      </NavLink>
                      {!here && !lockedOut && (
                        <>
                          <button type="button"
                            onClick={() => { setOpen(false); onPick?.(); onTravelTo?.(c.locationSlug, 'walk'); }}
                            title="Walk here"
                            className="shrink-0 px-2 py-1 rounded text-[11px] uppercase bg-ink-900/60 hover:bg-ink-800/70 text-ink-100/85">
                            Walk
                          </button>
                          <button type="button"
                            disabled={!hasVehicle}
                            onClick={() => { setOpen(false); onPick?.(); onTravelTo?.(c.locationSlug, 'drive'); }}
                            title={hasVehicle ? 'Drive here' : 'No active car — walk instead'}
                            className={`shrink-0 px-2 py-1 rounded text-[11px] uppercase ${hasVehicle ? 'bg-money-700/60 hover:bg-money-700 text-white' : 'bg-ink-900/30 text-ink-100/40 cursor-not-allowed'}`}>
                            Drive
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              }
              return (
                <li key={c.to}>
                  <NavLink
                    to={c.to}
                    onClick={(e) => { onClickGuard(e); setOpen(false); onPick?.(); }}
                    className={({ isActive }) =>
                      `block px-3 py-1.5 ${isActive ? 'bg-blood-700/60 text-white' : 'text-ink-100/85 hover:bg-ink-800/70'}`}>
                    {c.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

// Horizontally-scrollable quick-access strip that mirrors the main
// nav. Collapsible via the toggle handle on the right; preference is
// persisted to localStorage so we don't reset on every render.
const SUBNAV_KEY = 'mafia.subnav.collapsed';
function SubNavStrip({ items, lockedOut, onClickGuard, linkClass, isAdmin, onSignOut, currentLocation, hasVehicle, onTravelTo }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SUBNAV_KEY) === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(SUBNAV_KEY, collapsed ? '1' : '0'); }
    catch {}
  }, [collapsed]);

  return (
    <div className="border-t border-ink-100/10 bg-ink-900/30">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 flex items-stretch">
        {/* The scroll lane itself. Hidden via max-h transition when
            collapsed so the toggle handle smoothly slides up. */}
        <div
          className={`min-w-0 flex-1 transition-[max-height] duration-200 overflow-hidden ${collapsed ? 'max-h-0' : 'max-h-16'}`}
          aria-hidden={collapsed}>
          <div className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar"
            style={{ WebkitOverflowScrolling: 'touch' }}>
            {items.map(item => (
              <NavMenuItem key={item.to}
                item={item}
                lockedOut={lockedOut}
                linkClass={linkClass}
                onClickGuard={onClickGuard}
                isAdmin={isAdmin}
                onSignOut={onSignOut}
                currentLocation={currentLocation}
                hasVehicle={hasVehicle}
                onTravelTo={onTravelTo} />
            ))}
          </div>
        </div>
        {/* Toggle handle. Down arrow when collapsed (i.e. "expand me"),
            up arrow when expanded ("collapse me"). aria-expanded
            mirrors the visual state. */}
        <button
          type="button"
          aria-label={collapsed ? 'Show quick-access nav' : 'Hide quick-access nav'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(c => !c)}
          className="shrink-0 self-center ml-1 px-2 py-1 rounded-md text-ink-100/55 hover:bg-ink-800/60 hover:text-ink-100/85 transition">
          <span aria-hidden className="text-base leading-none inline-block transition-transform"
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
            ▾
          </span>
        </button>
      </div>
    </div>
  );
}

export default function Nav() {
  const { logout, character, refresh } = useGame();
  const nav = useNavigate();
  // Bound logout — drop the auth token and bounce to /login. Wired
  // into the Account dropdown so the sign-out button lives in the
  // main nav rather than the footer.
  const signOut = useCallback(() => { logout(); nav('/login'); }, [logout, nav]);

  // Fire an intra-city travel directly from a nav dropdown — the
  // server endpoint mirrors the City page's startTravel(). On
  // success the character refresh picks up the new
  // intra_travel_until and the existing travel banner takes over;
  // the nav also bounces the player to /city so they can see the
  // countdown immediately.
  const travelTo = useCallback(async (slug, mode) => {
    try {
      await api.post('/locations/travel', { to: slug, mode });
      await refresh?.();
      if (window.location.pathname !== '/city') nav('/city');
    } catch (e) {
      // Surface the error inline isn't possible from here — fall back
      // to a console hint. The most common 4xx ("you're travelling",
      // "you need a vehicle") is also visible on /city.
      console.warn('travel failed:', e.message);
    }
  }, [nav, refresh]);

  const [dmUnread, setDmUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // While the mobile drawer is open, lock body scroll so the page
  // behind the menu can't move under the user's finger. Restored on
  // close (or unmount). No-op on desktop where the drawer never opens.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);
  // Local tick clock so the intra-city travel countdown updates every
  // 500ms without waiting for the 30s character refresh.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!character?.intra_travel_until) return;
    const i = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(i);
  }, [character?.intra_travel_until]);
  // When the countdown finishes, force a character refresh so the
  // banner flips off and the player can navigate again.
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (!character?.intra_travel_until) { arrivedRef.current = false; return; }
    if (arrivedRef.current) return;
    if (clock >= character.intra_travel_until) {
      arrivedRef.current = true;
      refresh?.();
    }
  }, [clock, character?.intra_travel_until, refresh]);
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
  const inIntraTravel = character?.intra_travel_until && character.intra_travel_until > now;
  const lockedOut  = inHospital || inJail || inIntraTravel;

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
        <Link
          to="/"
          aria-label="Home — Mafia Life: Criminal Empire"
          className="relative inline-block shrink-0">
          <span className="font-display text-4xl sm:text-5xl text-blood-500 leading-none tracking-wide">
            MAFIA LIFE
          </span>
          <span
            aria-hidden
            className="font-cursive text-gold-400/95 text-2xl sm:text-3xl leading-none absolute -bottom-1 right-0 sm:right-1 translate-y-[2px] select-none pointer-events-none whitespace-nowrap"
            style={{ textShadow: '0 1px 0 rgba(0,0,0,0.55)' }}>
            Criminal Empire
          </span>
        </Link>

        <Link to="/" onClick={onClickGuard} className={charChipClass + ' min-w-0 hidden md:flex'} aria-label="Dashboard">
          <div className="leading-tight min-w-0">
            <div className="text-sm font-medium truncate">{character?.name}</div>
            <div className="text-[12px] text-ink-100/50">
              Lvl {character?.level}{character?.prestige ? ` ★${character.prestige}` : ''} · {character?.rank}
            </div>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-3 sm:gap-4 text-xs">
          <Link
            to="/messages"
            onClick={onClickGuard}
            aria-label="Messages"
            title="Messages"
            className={`relative px-2 py-1 rounded-md transition hidden md:flex items-center justify-center ${lockedOut ? 'text-ink-100/30 cursor-not-allowed' : 'hover:bg-ink-800/60 text-white'}`}>
            {/* Inline SVG envelope — pure white, bigger than the
                emoji glyph it replaces, scales cleanly across DPRs. */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 sm:w-7 sm:h-7"
              aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            {dmUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-blood-500 text-white text-[11px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-tight">
                {dmUnread > 99 ? '99+' : dmUnread}
              </span>
            )}
          </Link>
          <Link
            to="/premium"
            onClick={onClickGuard}
            aria-label="Gold Bars store"
            title={`Gold Bars: ${character?.premium_points || 0}`}
            className={`px-2 py-1 rounded-md transition flex items-center gap-1.5 text-gold-300 ${lockedOut ? 'opacity-30 cursor-not-allowed' : 'hover:bg-ink-800/60'}`}>
            {/* Gold-bar SVG — small trapezoidal ingot with a top
                highlight, scales cleanly to any DPR. */}
            <svg viewBox="0 0 20 14" className="w-5 h-3.5 shrink-0" aria-hidden>
              <polygon points="3,2 17,2 19,12 1,12" fill="currentColor" />
              <polygon points="3,2 17,2 15,5 5,5" fill="#fff" opacity="0.35" />
              <line x1="6" y1="8" x2="14" y2="8" stroke="#000" strokeOpacity="0.2" strokeWidth="0.5" />
            </svg>
            <span className="text-[13px] tabular-nums font-medium">{character?.premium_points || 0}</span>
          </Link>
          <div className="hidden md:flex">
            <MuteToggle />
          </div>
          <NotificationBell />
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

      {/*  Mobile-only character strip — name + level/prestige/rank +
           reputation. Sits between the top bar and the stats so
           the player can see who they are at a glance without
           the desktop inline chip.  */}
      {character && (
        <div className="md:hidden border-t border-ink-100/10 bg-ink-900/40">
          <Link
            to="/"
            onClick={onClickGuard}
            className={`max-w-6xl mx-auto px-3 sm:px-4 py-1.5 flex items-baseline justify-between gap-2 ${lockedOut ? 'text-ink-100/30 cursor-not-allowed' : ''}`}>
            <div className="text-sm font-medium truncate">{character.name}</div>
            <div className="text-[12px] text-ink-100/55 whitespace-nowrap shrink-0">
              Lvl {character.level}{character.prestige ? ` ★${character.prestige}` : ''} · {character.rank} · Rep {character.reputation?.toLocaleString() || 0}
            </div>
          </Link>
        </div>
      )}

      {/*  Condensed stats strip  */}
      {character && (
        <div className="border-t border-ink-100/10 bg-ink-900/40 stats-strip">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1.5 grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1 text-xs">
            <MiniStat label="Energy"  value={character.energy}    max={character.max_energy} color="bg-yellow-400" />
            <MiniStat label="Health"  value={character.health}    max={character.max_health} color="bg-money-500"  />
            <MiniStat label="Moral"   value={character.happiness} max={100}                  color="bg-pink-400"   />
            <div className="min-w-0 leading-tight">
              <div className="flex items-baseline justify-between gap-2 text-[12px] uppercase text-ink-100/55">
                <span>{character.at_max_level ? 'Max Lvl' : 'XP'}</span>
                <span className="tabular-nums text-ink-100/85">
                  {character.at_max_level ? 'MAX' : `${character.xp}/${character.xp_to_next}`}
                </span>
              </div>
              {!character.at_max_level && (
                <div className="h-[3px] rounded-full bg-ink-100/10 overflow-hidden">
                  <div className="bg-gold-500" style={{ width: xpPct + '%', height: '100%' }} />
                </div>
              )}
            </div>
            <MiniStat label="Cash"    value={character.cash}        money />
            <MiniStat label="Illegal" value={character.dirty_cash}  money color="text-blood-300" />
          </div>
        </div>
      )}

      {/*  Secondary quick-access nav — horizontally scrolling copy
           of the main nav, sits directly under the stats strip and
           can be collapsed/expanded by the down/up arrow on the right.
           Hidden when the player has no character loaded.  */}
      {character && (
        <SubNavStrip
          items={NAV_TREE_SORTED}
          lockedOut={lockedOut}
          linkClass={linkClass}
          onClickGuard={onClickGuard}
          isAdmin={!!character.is_admin}
          onSignOut={signOut}
          currentLocation={character.current_location}
          hasVehicle={!!character.active_vehicle_id || !!character.active_premium_vehicle_id}
          onTravelTo={travelTo} />
      )}

      {/*  Nav links
          Desktop (md+): horizontal row, always visible inline.
          Mobile (<md): pops up as a fixed bottom sheet so the menu
          has its own scroll boundary instead of pushing the page
          content down. Body scroll is locked (effect above) and a
          backdrop catches taps outside the sheet to close it. */}
      <nav className="hidden md:block border-t border-ink-100/10">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1.5 flex flex-row flex-wrap items-center gap-1">
          {(inHospital || inJail) && (
            <NavLink to={inHospital ? '/hospital' : '/jail'}
              onClick={() => setMenuOpen(false)}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-md text-white animate-pulse whitespace-nowrap ${inHospital ? 'bg-blue-600' : 'bg-yellow-600'}`}>
              {inHospital ? 'Hospital — locked' : 'Jail — locked'}
            </NavLink>
          )}
          {inIntraTravel && !inHospital && !inJail && (() => {
            const secs = Math.max(0, Math.ceil((character.intra_travel_until - clock) / 1000));
            const dest = (character.intra_travel_to || '').replace(/_/g, ' ');
            const verb = character.intra_travel_mode === 'drive' ? 'Driving' : 'Walking';
            return (
              <NavLink to="/city"
                onClick={() => setMenuOpen(false)}
                className="shrink-0 px-3 py-1.5 text-xs rounded-md text-white animate-pulse whitespace-nowrap bg-cyan-700">
                {verb} to {dest} — {secs}s
              </NavLink>
            );
          })()}
          {!lockedOut && character?.current_location_meta?.gated && (
            <NavLink
              to={character.current_location_meta.route}
              onClick={() => setMenuOpen(false)}
              title={`Enter ${character.current_location_meta.name}`}
              className="shrink-0 px-3 py-1.5 text-xs rounded-md whitespace-nowrap bg-money-700/20 border border-money-500/40 text-money-300 hover:bg-money-700/30 transition">
              <span className="opacity-75 mr-1">At:</span>
              {character.current_location_meta.name} →
            </NavLink>
          )}
          <div className="flex md:flex-wrap items-center gap-1">
            {NAV_TREE_SORTED.map(item => (
              <NavMenuItem key={item.to}
                item={item}
                lockedOut={lockedOut}
                linkClass={linkClass}
                onClickGuard={onClickGuard}
                isAdmin={!!character?.is_admin}
                onSignOut={signOut}
                currentLocation={character?.current_location}
                hasVehicle={!!character?.active_vehicle_id || !!character?.active_premium_vehicle_id}
                onTravelTo={travelTo}
                onPick={() => setMenuOpen(false)} />
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile full-screen menu — fills the viewport with a solid
          black panel. Rendered through a portal to document.body so
          the header's backdrop-blur (which would otherwise establish
          a containing block) doesn't clip the overlay to the header
          row. Renders only when menuOpen so the closed state pays
          no layout cost. */}
      {menuOpen && createPortal(
        <div
          role="dialog"
          aria-label="Navigation"
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#000' }}
          className="md:hidden flex flex-col overscroll-contain">
          {/* Header bar with the brand mark + a prominent Close button.
              Sticky so it stays put while the menu list scrolls. */}
          <div className="shrink-0 px-3 py-3 flex items-center justify-between gap-2 border-b border-ink-100/15">
            <span className="font-display text-blood-500 text-2xl tracking-wide leading-none">MENU</span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="px-3 py-2 rounded-md bg-ink-900 border border-ink-100/15 text-ink-100 hover:bg-ink-800 active:scale-95 transition flex items-center gap-2">
              <span aria-hidden className="text-lg leading-none">×</span>
              <span className="text-sm uppercase tracking-wider">Close</span>
            </button>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar px-3 py-4"
            style={{ WebkitOverflowScrolling: 'touch' }}>
            {(inHospital || inJail) && (
              <NavLink to={inHospital ? '/hospital' : '/jail'}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-white animate-pulse text-center ${inHospital ? 'bg-blue-600' : 'bg-yellow-600'}`}>
                {inHospital ? 'Hospital — locked' : 'Jail — locked'}
              </NavLink>
            )}
            {inIntraTravel && !inHospital && !inJail && (() => {
              const secs = Math.max(0, Math.ceil((character.intra_travel_until - clock) / 1000));
              const dest = (character.intra_travel_to || '').replace(/_/g, ' ');
              const verb = character.intra_travel_mode === 'drive' ? 'Driving' : 'Walking';
              return (
                <NavLink to="/city"
                  onClick={() => setMenuOpen(false)}
                  className="block mt-1 px-3 py-2 rounded-md text-white animate-pulse text-center bg-cyan-700">
                  {verb} to {dest} — {secs}s
                </NavLink>
              );
            })()}
            {!lockedOut && character?.current_location_meta?.gated && (
              <NavLink
                to={character.current_location_meta.route}
                onClick={() => setMenuOpen(false)}
                className="block mt-1 px-3 py-2 rounded-md bg-money-700/20 border border-money-500/40 text-money-300 hover:bg-money-700/30 transition text-center">
                <span className="opacity-75 mr-1">At:</span>
                {character.current_location_meta.name} →
              </NavLink>
            )}
            <div className="flex flex-col gap-0.5 mt-2">
              {NAV_TREE_SORTED.map(item => (
                <React.Fragment key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={(e) => { onClickGuard(e); setMenuOpen(false); }}
                    className={({ isActive }) => linkClass(isActive)}>
                    {item.label}
                  </NavLink>
                  {item.children?.map(c => {
                    if (c.adminOnly && !character?.is_admin) return null;
                    if (c.signOut) {
                      return (
                        <button
                          key="signout"
                          type="button"
                          onClick={() => { setMenuOpen(false); signOut(); }}
                          className="text-left pl-7 text-[11px] px-3 py-2 rounded-md text-blood-300 hover:bg-blood-700/30">
                          {c.label}
                        </button>
                      );
                    }
                    return (
                      <NavLink key={c.to} to={c.to}
                        onClick={(e) => { onClickGuard(e); setMenuOpen(false); }}
                        className={({ isActive }) =>
                          `${linkClass(isActive)} pl-7 text-[11px] text-ink-100/70`}>
                        {c.label}
                      </NavLink>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
