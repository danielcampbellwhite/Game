import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import ChatPanel from './ChatPanel.jsx';
import Messages from '../pages/Messages.jsx';
import Newspaper from '../pages/Newspaper.jsx';
import Stocks from '../pages/Stocks.jsx';
import { BankAppTab, FlightsTab, VehiclesTab, WeaponsTab, ShopAppTab } from '../pages/Online.jsx';

// iPhone-styled overlay that opens when the player taps the floating
// phone button. Has its own internal "screen" state so apps can open
// inside the phone frame (Live Chat, in particular) without leaving
// the modal. Apps that lead to a full website page (Bank, Flights,
// Cars, Gear, Gazette) navigate to the route and close the phone.

const APP_ICONS = {
  bank:     { gradient: ['#16a34a', '#065f46'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden>
      <rect x="6" y="13" width="20" height="11" rx="1.2" />
      <polygon points="4,13 16,5 28,13" fill="white" />
      <rect x="3.5" y="24" width="25" height="2.5" rx="0.6" />
      <rect x="9"  y="15.5" width="2.5" height="6" fill="#065f46" />
      <rect x="14.7" y="15.5" width="2.5" height="6" fill="#065f46" />
      <rect x="20.5" y="15.5" width="2.5" height="6" fill="#065f46" />
    </svg>
  )},
  flights:  { gradient: ['#22d3ee', '#0e7490'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden>
      <path d="M2 19 L22 9 L28 5 L30 7 L25 11 L21 24 L18 24 L19 14 L13 17 L11 22 L9 22 L10 18 L7 18 L2 19 Z" />
    </svg>
  )},
  cars:     { gradient: ['#facc15', '#a16207'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden>
      <path d="M5 21 C5 18 6 17 8 16 L11 12 C11.5 11 12.5 10.5 14 10.5 L20 10.5 C21.5 10.5 22.5 11 23 12 L26 16 C28 17 29 18 29 21 L29 23 L5 23 Z" />
      <circle cx="10.5" cy="23.5" r="2.7" fill="#1a1815" />
      <circle cx="10.5" cy="23.5" r="1.2" fill="white" />
      <circle cx="23.5" cy="23.5" r="2.7" fill="#1a1815" />
      <circle cx="23.5" cy="23.5" r="1.2" fill="white" />
    </svg>
  )},
  weapons:  { gradient: ['#dc2626', '#7f1d1d'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden>
      <rect x="4"  y="13" width="18" height="6" rx="0.6" />
      <rect x="20" y="13" width="6"  height="3" />
      <rect x="7"  y="19" width="5"  height="4" rx="0.5" />
      <rect x="14" y="11" width="2"  height="3" />
    </svg>
  )},
  shop:     { gradient: ['#f97316', '#9a3412'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="white" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {/* Shopping bag with handles */}
      <path d="M7 12 H25 L23 27 H9 Z" fill="white" stroke="white" />
      <path d="M11 12 V9 a5 5 0 0 1 10 0 V12" stroke="white" fill="none" />
    </svg>
  )},
  messages: { gradient: ['#3b82f6', '#1e40af'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <rect x="5" y="8" width="22" height="16" rx="3" />
      <path d="M6 10 L16 18 L26 10" />
    </svg>
  )},
  chat:     { gradient: ['#10b981', '#065f46'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden>
      <path d="M6 7 L26 7 C28 7 29 8 29 10 L29 19 C29 21 28 22 26 22 L18 22 L12 27 L12 22 L6 22 C4 22 3 21 3 19 L3 10 C3 8 4 7 6 7 Z" />
      <circle cx="11" cy="14.5" r="1.3" fill="#065f46" />
      <circle cx="16" cy="14.5" r="1.3" fill="#065f46" />
      <circle cx="21" cy="14.5" r="1.3" fill="#065f46" />
    </svg>
  )},
  news:     { gradient: ['#a8a29e', '#44403c'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden>
      <rect x="4" y="7" width="24" height="18" rx="1.5" />
      <rect x="7"  y="11" width="13" height="2" fill="#44403c" />
      <rect x="7"  y="14" width="18" height="1.4" fill="#44403c" />
      <rect x="7"  y="16.4" width="18" height="1.4" fill="#44403c" />
      <rect x="7"  y="18.8" width="11" height="1.4" fill="#44403c" />
      <rect x="22" y="11" width="3" height="2.8" fill="#44403c" />
    </svg>
  )},
  markets:  { gradient: ['#059669', '#064e3b'], glyph: (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden>
      <rect x="5"  y="18" width="4" height="9" />
      <rect x="12" y="13" width="4" height="14" />
      <rect x="19" y="9"  width="4" height="18" />
      <rect x="26" y="15" width="4" height="12" />
      <polyline points="5,17 12,12 19,8 26,14" fill="none" stroke="white" strokeWidth="1.5" />
    </svg>
  )},
};

// Each app opens AS A SCREEN inside the phone — no navigation, the
// component renders directly inside the device frame so the player
// feels like they're flicking between phone apps. `title` is shown
// on the in-phone header bar; `Component` is rendered into the screen
// body when the app is open.
const APPS = [
  { id: 'chat',     label: 'Chat',     title: 'Live Chat', screen: 'chat'      },
  { id: 'messages', label: 'Messages', title: 'Messages',  screen: 'messages'  },
  { id: 'bank',     label: 'Bank',     title: 'Bank',      screen: 'bank'      },
  { id: 'shop',     label: 'Shop',     title: 'Shop',      screen: 'shop'      },
  { id: 'flights',  label: 'Flights',  title: 'Flights',   screen: 'flights'   },
  { id: 'cars',     label: 'Cars',     title: 'Cars',      screen: 'cars'      },
  { id: 'weapons',  label: 'Gear',     title: 'Gear',      screen: 'weapons'   },
  { id: 'news',     label: 'Gazette',  title: 'Gazette',   screen: 'news'      },
  { id: 'markets',  label: 'Markets',  title: 'Markets',   screen: 'markets'   },
];

function AppTile({ app, disabled, onPick }) {
  const def = APP_ICONS[app.id] || APP_ICONS.bank;
  const bg = `linear-gradient(160deg, ${def.gradient[0]}, ${def.gradient[1]})`;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(app)}
      className={`group flex flex-col items-center gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <span
        style={{ background: bg, boxShadow: '0 6px 14px -6px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.15)' }}
        className="w-14 h-14 rounded-[16px] flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95">
        {def.glyph}
      </span>
      <span className="text-[10px] text-white/95 leading-tight text-center px-1 line-clamp-2 drop-shadow">
        {app.label}
      </span>
    </button>
  );
}

// Animated wallpaper for the phone. Uses CSS gradients only so the
// bundle stays asset-free. The two overlapping radial gradients add
// faint colour pops without imitating a real photo.
const WALLPAPER = {
  background:
    'radial-gradient(circle at 18% 12%, rgba(220, 38, 38, 0.35), transparent 55%), ' +
    'radial-gradient(circle at 82% 88%, rgba(250, 204, 21, 0.28), transparent 55%), ' +
    'linear-gradient(160deg, #1f1b18 0%, #0a0908 100%)',
};

export default function PhoneOverlay({ open, onClose }) {
  const { character } = useGame();
  const nav = useNavigate();
  const [screen, setScreen] = useState('home');
  // Scroll container for whichever app screen is mounted. Children
  // fire the `mafia:phone-action` window event after a successful
  // order / message-send / book / etc., and we scroll it back to
  // the top so the player sees the confirmation banner that just
  // rendered above the catalogue they were browsing.
  const appScrollRef = useRef(null);

  // Reset to home each time the phone opens — feels right when the
  // player taps the icon: phone wakes to the home screen.
  useEffect(() => { if (open) setScreen('home'); }, [open]);
  // Scroll back to top whenever the active screen changes too — a
  // fresh app shouldn't inherit the previous one's scroll position.
  useEffect(() => {
    if (appScrollRef.current) appScrollRef.current.scrollTop = 0;
  }, [screen]);

  // Listen for action confirmations from the embedded apps and snap
  // the screen back up so the success banner is in view.
  useEffect(() => {
    if (!open) return;
    const onAction = () => {
      const el = appScrollRef.current;
      if (!el) return;
      // Use smooth scroll where supported; falls back to a hard jump.
      try { el.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch { el.scrollTop = 0; }
    };
    window.addEventListener('mafia:phone-action', onAction);
    return () => window.removeEventListener('mafia:phone-action', onAction);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (screen !== 'home') setScreen('home');
      else onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, screen, onClose]);

  if (!open) return null;

  const online = !!character?.internet?.online;
  const reasonLabel = {
    phone: 'LTE',
  }[character?.internet?.reason] || '';
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  function launch(app) {
    if (app.screen) setScreen(app.screen);
  }

  const activeApp = APPS.find(a => a.screen === screen);

  // Header shown above the active app screen (chat etc.) — a back
  // arrow returns to the home grid.
  function AppHeader({ title }) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-ink-950/85 border-b border-ink-100/10 shrink-0">
        <button
          type="button"
          onClick={() => setScreen('home')}
          aria-label="Back to home screen"
          className="text-ink-100/85 hover:text-white text-base leading-none px-1">
          ‹
        </button>
        <span className="text-xs uppercase tracking-wider text-ink-100/85 font-medium">{title}</span>
      </div>
    );
  }

  // Compact CSS scope applied to every embedded page rendered inside
  // the phone screen. The pages were designed for a wide layout; we
  // shrink the body type and tighten the card padding so they fit a
  // ~298px phone viewport without overflow. Anything that uses md:
  // breakpoints just stays in its mobile layout — we never widen.
  // CSS scope applied to every embedded page rendered inside the
  // phone screen. The pages were designed for a wider, more colour-
  // coded layout; we bump the base size up to 14px so it reads at
  // arm's length and force all text white so the muted greys (which
  // disappear against the dark phone wallpaper) get the contrast
  // they need. Inputs and buttons are bumped a notch for legibility
  // too.
  const phonePageWrap =
    'text-[14px] text-white [&_*]:text-white ' +
    '[&_input]:text-[14px] [&_input]:text-white [&_input::placeholder]:text-white/60 ' +
    '[&_.btn]:text-[13px] [&_.btn]:py-1.5 [&_.btn]:px-2.5 ' +
    '[&_.card]:p-3 [&_h3]:text-lg [&_h3]:text-white ' +
    '[&_h4]:text-base [&_h4]:text-white';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60 }}
      className="bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Phone frame */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[330px] h-[660px] max-h-[92vh] rounded-[44px] bg-ink-1000 border-[6px] border-ink-1000 shadow-2xl shadow-black/80 overflow-hidden relative flex flex-col"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 20px 60px -10px rgba(0,0,0,0.85)' }}>
        {/* Wallpaper layer */}
        <div style={WALLPAPER} className="absolute inset-0 z-0" aria-hidden />

        {/* Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-20" />

        {/* Status bar */}
        <div className="pt-6 px-5 pb-1 flex items-baseline justify-between text-[11px] text-white tabular-nums shrink-0 relative z-10">
          <span className="font-medium">{clock}</span>
          <span className="flex items-center gap-1.5">
            {online ? (
              <>
                {reasonLabel && <span className="text-white/85">{reasonLabel}</span>}
                <span className="inline-flex items-center gap-0.5" aria-hidden>
                  <span className="block w-0.5 h-1 bg-white rounded-sm" />
                  <span className="block w-0.5 h-1.5 bg-white rounded-sm" />
                  <span className="block w-0.5 h-2 bg-white rounded-sm" />
                  <span className="block w-0.5 h-2.5 bg-white rounded-sm" />
                </span>
              </>
            ) : (
              <span className="text-blood-300">No service</span>
            )}
          </span>
        </div>

        {/* Screen body */}
        <div className="flex-1 relative z-10 flex flex-col min-h-0">
          {screen === 'home' && (
            <div className="flex-1 overflow-y-auto scrollbar px-6 pt-6 pb-4">
              {/* 3-column grid with generous spacing so icons breathe. */}
              <div className="grid grid-cols-3 gap-x-6 gap-y-7">
                {APPS.map(app => (
                  <AppTile
                    key={app.id}
                    app={app}
                    disabled={!online}
                    onPick={launch} />
                ))}
              </div>

              {!online && (
                <div className="mt-6 mx-1 px-3 py-3 rounded-lg border border-blood-500/40 bg-blood-700/15 text-[12px] text-white/90 text-center">
                  <div className="font-medium text-blood-300 mb-1">No signal</div>
                  Carry a smartphone to use the apps. Pick one up at the General Store.
                </div>
              )}
            </div>
          )}

          {activeApp && (
            <>
              <AppHeader title={activeApp.title} />
              <div ref={appScrollRef}
                onClickCapture={(e) => {
                  // Internal links inside an embedded page would
                  // navigate the underlying app router and tear the
                  // phone overlay off the player's screen. We swallow
                  // them here so the phone stays self-contained —
                  // navigation between phone apps happens via the
                  // home-screen launcher, not via embedded Links.
                  const a = e.target?.closest && e.target.closest('a');
                  if (!a) return;
                  if (a.target === '_blank') return;             // honour explicit new-tab
                  const href = a.getAttribute('href') || '';
                  if (!href) return;
                  if (/^(mailto:|tel:|https?:\/\/)/i.test(href)) return; // external goes via browser
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex-1 min-h-0 overflow-y-auto scrollbar bg-ink-950/85">
                {/* Each app's content renders as if it were a tiny
                    mobile web view. Embedded page components stay
                    self-contained — they reuse the same /api/* calls
                    they would on their own routes. */}
                {screen === 'chat'     && <ChatPanel onPickDms={() => setScreen('messages')} />}
                {screen === 'messages' && <div className={`${phonePageWrap} p-2`}><Messages /></div>}
                {screen === 'bank'     && <div className={`${phonePageWrap} p-2`}><BankAppTab /></div>}
                {screen === 'shop'     && <div className={`${phonePageWrap} p-2`}><ShopAppTab /></div>}
                {screen === 'flights'  && <div className={`${phonePageWrap} p-2`}><FlightsTab /></div>}
                {screen === 'cars'     && <div className={`${phonePageWrap} p-2`}><VehiclesTab /></div>}
                {screen === 'weapons'  && <div className={`${phonePageWrap} p-2`}><WeaponsTab /></div>}
                {screen === 'news'     && <div className={`${phonePageWrap} p-2`}><Newspaper darkMode /></div>}
                {screen === 'markets'  && <div className={`${phonePageWrap} p-2`}><Stocks /></div>}
              </div>
            </>
          )}
        </div>

        {/* iPhone-style hardware home button. One tap closes the
            current app (back to the home grid); tapping it on the
            home screen locks the phone (closes the overlay). */}
        <div className="relative z-20 pt-2 pb-3 shrink-0 flex items-center justify-center">
          <button
            type="button"
            onClick={() => { screen === 'home' ? onClose?.() : setScreen('home'); }}
            aria-label={screen === 'home' ? 'Lock phone' : 'Home'}
            title={screen === 'home' ? 'Lock' : 'Home'}
            className="w-11 h-11 rounded-full bg-ink-1000 border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_6px_rgba(0,0,0,0.6)] hover:bg-ink-950 active:scale-95 transition flex items-center justify-center">
            {/* Inner concentric square — matches the classic iPhone
                home glyph without needing an image asset. */}
            <span aria-hidden className="block w-4 h-4 rounded-[5px] border-2 border-white/55" />
          </button>
        </div>
      </div>
    </div>
  );
}
