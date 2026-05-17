import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';

// Floating phone widget anchored to the bottom-right of every authed
// page. Green pulsing dot when the player is online (smartphone in
// pocket); red solid when offline. Tap when online to open the
// iPhone-style PhoneOverlay; tap when offline to see a short "no
// signal" hint with the buy-a-smartphone pointer.

// Comfortable thumb-sized FAB.
const BUBBLE_PX = 56;

export default function PhoneFab({ onOpen }) {
  const { character } = useGame();
  const nav = useNavigate();
  const [showOfflineHint, setShowOfflineHint] = useState(false);

  if (!character) return null;
  const online = !!character.internet?.online;

  // Auto-hide the offline hint after a couple of seconds.
  useEffect(() => {
    if (!showOfflineHint) return;
    const t = setTimeout(() => setShowOfflineHint(false), 2400);
    return () => clearTimeout(t);
  }, [showOfflineHint]);

  function handleTap() {
    if (online) onOpen?.();
    else setShowOfflineHint(true);
  }

  return (
    <>
      {showOfflineHint && (
        <div
          style={{ position: 'fixed', right: 12, bottom: 12 + BUBBLE_PX + 8 }}
          className="z-50 max-w-[220px] px-3 py-2 rounded-md bg-ink-950/95 border border-blood-500/40 text-[11px] text-ink-100/90 shadow-2xl shadow-black/60">
          <div className="font-medium text-blood-300 mb-0.5">No signal</div>
          <div>Carry a smartphone to come online. Pick one up at the General Store.</div>
        </div>
      )}
      <button
        type="button"
        onClick={handleTap}
        aria-label={online ? 'Open phone' : 'Phone — offline'}
        title={online ? 'Open phone' : 'Phone — offline'}
        style={{ position: 'fixed', right: 12, bottom: 12, width: BUBBLE_PX, height: BUBBLE_PX, zIndex: 40 }}
        className="rounded-2xl bg-ink-950/95 border border-ink-100/15 backdrop-blur shadow-2xl shadow-black/60 hover:bg-ink-900/95 active:scale-95 transition flex items-center justify-center">
        {/* Phone glyph — simple rounded rectangle outline so it reads
            as "mobile" without needing an icon font. */}
        <svg viewBox="0 0 24 32" className="w-6 h-8 text-ink-100/90" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <rect x="2" y="2" width="20" height="28" rx="3" />
          <line x1="2" y1="6"  x2="22" y2="6"  />
          <line x1="2" y1="26" x2="22" y2="26" />
          <circle cx="12" cy="28" r="0.8" fill="currentColor" />
        </svg>
        {/* Status dot — top-right corner of the FAB. Green pulses
            when online; red sits solid when offline. The ::after
            ring achieves the pulse via Tailwind's `animate-ping`. */}
        <span className="absolute top-1.5 right-1.5">
          <span className={`block w-2.5 h-2.5 rounded-full ${online ? 'bg-money-400' : 'bg-blood-500'}`} />
          {online && (
            <span className="absolute inset-0 rounded-full bg-money-400 opacity-70 animate-ping" />
          )}
        </span>
      </button>
    </>
  );
}
