import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext.jsx';

// Floating phone widget anchored to one vertical edge of every authed
// page. Green pulsing dot when the player is online (smartphone in
// pocket); red solid when offline.
//
// Drag-to-move: hold and drag the icon to reposition it. On release
// it snaps to the nearest vertical edge (left or right) at the
// player's drop height. A short drag threshold lets a casual tap
// still open the phone overlay. Position is persisted in localStorage
// so the choice survives reloads.
//
// Tap when online → opens the iPhone-style PhoneOverlay.
// Tap when offline → shows a short "no signal" hint with the
//                    buy-a-smartphone pointer.

// Comfortable thumb-sized FAB — chunky enough on mobile to spot at a
// glance and easy to grab with a thumb.
const BUBBLE_PX   = 72;
const EDGE_MARGIN = 12;
// Pixels of movement before a pointerdown becomes a drag rather than
// a tap. Keeps small thumb jitter from closing the overlay accidentally.
const DRAG_THRESH = 6;
const POS_KEY     = 'mafia.phonefab.pos';

function readPos() {
  if (typeof window === 'undefined') return { side: 'right', y: null };
  try {
    const raw = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null');
    if (raw && (raw.side === 'left' || raw.side === 'right')) {
      return { side: raw.side, y: typeof raw.y === 'number' ? raw.y : null };
    }
  } catch {}
  return { side: 'right', y: null };
}

function clampY(y) {
  if (typeof window === 'undefined') return y;
  const min = EDGE_MARGIN;
  const max = window.innerHeight - BUBBLE_PX - EDGE_MARGIN;
  return Math.max(min, Math.min(max, y));
}

export default function PhoneFab({ onOpen }) {
  const { character } = useGame();
  const [showOfflineHint, setShowOfflineHint] = useState(false);
  // Snapped resting position: side = left|right, y = px (or null for "bottom").
  const [pos,  setPos]  = useState(readPos);
  // Active drag position. Non-null only while the finger is down + moving.
  const [drag, setDrag] = useState(null);
  // Mutable bookkeeping for the in-flight gesture — kept in a ref so
  // we don't re-render every pointermove. `startX/Y` capture the
  // pointer's starting client coords so we can measure total drift
  // for the drag/tap discrimination.
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0, moved: false });

  // Auto-hide the offline hint after a couple of seconds.
  useEffect(() => {
    if (!showOfflineHint) return;
    const t = setTimeout(() => setShowOfflineHint(false), 2400);
    return () => clearTimeout(t);
  }, [showOfflineHint]);

  // Re-snap on window resize so the FAB never ends up off-screen.
  useEffect(() => {
    const onResize = () => {
      setPos(p => ({ ...p, y: p.y == null ? null : clampY(p.y) }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!character) return null;
  // Only render the floating phone icon for players who actually
  // own a smartphone (anywhere — pockets, house, vehicle). If the
  // phone is reachable right now it glows green; if it's stashed
  // somewhere they aren't, it glows red so the player knows where
  // to go to recover it.
  if (!character.internet?.owned) return null;
  const online = !!character.internet?.online;

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return; // ignore right / middle click
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      active: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX:  e.clientX,
      startY:  e.clientY,
      moved:   false,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d.active) return;
    if (!d.moved) {
      const dx = Math.abs(e.clientX - d.startX);
      const dy = Math.abs(e.clientY - d.startY);
      if (dx + dy > DRAG_THRESH) d.moved = true;
      else return; // still inside the tap window — don't visibly drag yet
    }
    setDrag({ x: e.clientX - d.offsetX, y: e.clientY - d.offsetY });
  }

  function onPointerUp(e) {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (!d.moved) {
      // Tap path: open phone (or show the offline hint).
      setDrag(null);
      if (online) onOpen?.();
      else setShowOfflineHint(true);
      return;
    }
    // Snap to the nearest vertical edge, at the drop height.
    const centreX = (drag?.x ?? e.clientX - d.offsetX) + BUBBLE_PX / 2;
    const side = centreX < window.innerWidth / 2 ? 'left' : 'right';
    const y = clampY(e.clientY - d.offsetY);
    const next = { side, y };
    setPos(next);
    setDrag(null);
    try { localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch {}
  }

  // Where the FAB sits this frame: follow the pointer while dragging,
  // otherwise rest on the snapped side.
  let style;
  if (drag) {
    style = { position: 'fixed', left: drag.x, top: drag.y, width: BUBBLE_PX, height: BUBBLE_PX, zIndex: 40, touchAction: 'none' };
  } else {
    const base = { position: 'fixed', [pos.side]: EDGE_MARGIN, width: BUBBLE_PX, height: BUBBLE_PX, zIndex: 40, touchAction: 'none' };
    if (pos.y != null) base.top = clampY(pos.y);
    else               base.bottom = EDGE_MARGIN;
    style = base;
  }

  // Hint anchors to the opposite vertical end of the FAB so it never
  // covers the icon itself.
  const hintStyle = drag
    ? { position: 'fixed', right: 12, bottom: 12 }
    : {
        position: 'fixed',
        [pos.side]: EDGE_MARGIN,
        // If FAB has a saved y, put the hint just above it; otherwise
        // up from the bottom by the FAB's height.
        ...(pos.y != null
          ? { top: Math.max(EDGE_MARGIN, clampY(pos.y) - 56) }
          : { bottom: EDGE_MARGIN + BUBBLE_PX + 8 }),
      };

  return (
    <>
      {showOfflineHint && (
        <div
          style={hintStyle}
          className="z-50 max-w-[220px] px-3 py-2 rounded-md bg-ink-950/95 border border-blood-500/40 text-[11px] text-ink-100/90 shadow-2xl shadow-black/60">
          <div className="font-medium text-blood-300 mb-0.5">Phone out of reach</div>
          <div>Your phone isn't on you. Pick it up from the house or car stash you left it in.</div>
        </div>
      )}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={online ? 'Open phone' : 'Phone — offline'}
        title={online ? 'Open phone (drag to move)' : 'Phone — offline'}
        style={style}
        className={`rounded-2xl bg-ink-950/95 border border-ink-100/15 backdrop-blur shadow-2xl shadow-black/60 hover:bg-ink-900/95 ${drag ? 'cursor-grabbing' : 'cursor-grab'} active:scale-95 transition flex items-center justify-center select-none`}>
        {/* Phone glyph — simple rounded rectangle outline so it reads
            as "mobile" without needing an icon font. */}
        <svg viewBox="0 0 24 32" className="w-8 h-10 text-ink-100/90" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <rect x="2" y="2" width="20" height="28" rx="3" />
          <line x1="2" y1="6"  x2="22" y2="6"  />
          <line x1="2" y1="26" x2="22" y2="26" />
          <circle cx="12" cy="28" r="0.8" fill="currentColor" />
        </svg>
        {/* Status dot — top-right corner of the FAB. Green pulses
            when online; red sits solid when offline. */}
        <span className="absolute top-2 right-2">
          <span className={`block w-3 h-3 rounded-full ${online ? 'bg-money-400' : 'bg-blood-500'}`} />
          {online && (
            <span className="absolute inset-0 rounded-full bg-money-400 opacity-70 animate-ping" />
          )}
        </span>
      </button>
    </>
  );
}
