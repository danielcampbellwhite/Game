import React from 'react';

// Small consistent "level-locked" indicator. Drop next to the
// title or in the corner of any card whose action is gated by the
// player's level. Keeps the rendering uniform across crimes,
// weapons, armour, businesses, OC heists, etc.
//
// Usage: <LockBadge level={39} />  →  🔒 Unlocks at Lvl 39

export default function LockBadge({ level, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-100/55 ${className}`}>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
        <path d="M12 2a5 5 0 0 0-5 5v3H6.5A2.5 2.5 0 0 0 4 12.5v7A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 17.5 10H17V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
      </svg>
      Unlocks at Lvl {level}
    </span>
  );
}
