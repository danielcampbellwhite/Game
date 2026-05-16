import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';

// iPhone-styled overlay that opens when the player taps the floating
// phone in the bottom-right. App tiles route to the same online
// services the /online page exposes, plus DMs and the live chat.
// Closes on outside tap, Escape, or the close button on the lock bar.

const APPS = [
  // Each app: { id, label, glyph (React node), to (route) or action }.
  { id: 'bank',     label: 'Bank',     to: '/online?tab=bank',     hint: 'Balance + loans',          color: 'bg-money-500',  initial: '£'  },
  { id: 'flights',  label: 'Flights',  to: '/online?tab=flights',  hint: 'Book a seat',              color: 'bg-cyan-500',   initial: ''   },
  { id: 'cars',     label: 'Cars',     to: '/online?tab=vehicles', hint: 'Ship to a garage',         color: 'bg-yellow-500', initial: ''   },
  { id: 'weapons',  label: 'Gear',     to: '/online?tab=weapons',  hint: 'Ship to a property',       color: 'bg-blood-600',  initial: ''   },
  { id: 'messages', label: 'Messages', to: '/messages',            hint: 'DMs with players',         color: 'bg-blue-500',   initial: '@'  },
  { id: 'chat',     label: 'Live Chat',action: 'open-chat',        hint: 'World / faction / gang',   color: 'bg-emerald-500',initial: '*'  },
  { id: 'news',     label: 'Gazette',  to: '/newspaper',           hint: 'Today\'s headlines',       color: 'bg-stone-500',  initial: '|'  },
  { id: 'stocks',   label: 'Markets',  to: '/online?tab=bank',     hint: 'Wallet status',            color: 'bg-emerald-700',initial: '$'  },
];

export default function PhoneOverlay({ open, onClose }) {
  const { character } = useGame();
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const online = !!character?.internet?.online;
  const reasonLabel = {
    phone:        'iPhone · Mobile data',
    laptop_home:  'iPhone · Home Wi-Fi',
    laptop_car:   'iPhone · Car hotspot',
  }[character?.internet?.reason] || 'iPhone';
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  function launch(app) {
    if (app.action === 'open-chat') {
      try { window.dispatchEvent(new CustomEvent('mafia:open-chat')); } catch {}
    } else if (app.to) {
      nav(app.to);
    }
    onClose?.();
  }

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
        className="w-full max-w-[320px] h-[640px] max-h-[90vh] rounded-[40px] bg-ink-1000 border-4 border-ink-950 shadow-2xl shadow-black/80 overflow-hidden relative flex flex-col">
        {/* Notch */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-10" />

        {/* Status bar */}
        <div className="pt-6 px-5 pb-2 flex items-baseline justify-between text-[11px] text-ink-100/90 tabular-nums shrink-0">
          <span className="font-medium">{clock}</span>
          <span className="flex items-center gap-1">
            {online ? (
              <>
                <span className="text-money-300">●</span>
                <span className="text-ink-100/70">{reasonLabel}</span>
              </>
            ) : (
              <span className="text-blood-300">● Offline</span>
            )}
          </span>
        </div>

        {/* Home screen */}
        <div className="flex-1 px-4 py-3 overflow-y-auto scrollbar">
          <div className="grid grid-cols-3 gap-3 mt-2">
            {APPS.map(app => {
              const disabled = !online;
              return (
                <button
                  key={app.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => launch(app)}
                  className={`group flex flex-col items-center gap-1 ${disabled ? 'opacity-40' : ''}`}>
                  <span
                    className={`w-14 h-14 rounded-2xl ${app.color} shadow-md shadow-black/40 flex items-center justify-center text-white text-2xl font-display group-hover:scale-105 transition-transform`}
                    aria-hidden>
                    {app.initial}
                  </span>
                  <span className="text-[10px] text-ink-100/85 leading-tight text-center px-1 line-clamp-2">{app.label}</span>
                </button>
              );
            })}
          </div>

          {!online && (
            <div className="mt-6 mx-2 px-3 py-3 rounded-lg border border-blood-500/40 bg-blood-700/15 text-[12px] text-ink-100/90 text-center">
              <div className="font-medium text-blood-300 mb-1">No signal</div>
              Carry a smartphone in your pocket, or be at the property / in the car
              where you've stashed a laptop, to use the apps.
            </div>
          )}
        </div>

        {/* Home indicator + close */}
        <div className="px-4 py-3 flex items-center justify-between shrink-0 border-t border-ink-100/5">
          <span className="text-[10px] uppercase tracking-wider text-ink-100/45">{character?.name || 'Mafia Life'}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] uppercase tracking-wider text-ink-100/70 hover:text-ink-100 px-3 py-1 rounded-md hover:bg-ink-900/60">
            Lock
          </button>
        </div>
        {/* Home bar */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-ink-100/40 rounded-full" />
      </div>
    </div>
  );
}
