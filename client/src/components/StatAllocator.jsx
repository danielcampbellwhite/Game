import React from 'react';

// Shared by /character-create and /new-character. Each stat starts at
// STAT_BASE and the player has STAT_POINTS to distribute. Server applies
// the same bounds in routes/character.js.
export const STAT_BASE = 1;
export const STAT_POINTS = 10;
export const STAT_MAX = STAT_BASE + STAT_POINTS;

const STATS = [
  { id: 'strength',     label: 'Strength',     desc: 'Melee damage and robbery success.' },
  { id: 'defence',      label: 'Defence',      desc: 'Damage absorbed when attacked.' },
  { id: 'speed',        label: 'Speed',        desc: 'Hit accuracy and dodge.' },
  { id: 'intelligence', label: 'Intelligence', desc: 'Cybercrime payout and crime success.' },
];

export function initialStats() {
  return { strength: STAT_BASE, defence: STAT_BASE, speed: STAT_BASE, intelligence: STAT_BASE };
}

export function pointsRemaining(stats) {
  const spent = Object.values(stats).reduce((s, n) => s + (n - STAT_BASE), 0);
  return STAT_POINTS - spent;
}

export default function StatAllocator({ value, onChange }) {
  const remaining = pointsRemaining(value);

  function bump(id, d) {
    const next = (value[id] || STAT_BASE) + d;
    if (next < STAT_BASE || next > STAT_MAX) return;
    if (d > 0 && remaining <= 0) return;
    onChange({ ...value, [id]: next });
  }

  function reset() {
    onChange(initialStats());
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs uppercase text-ink-100/60">Stat points</span>
        <span className="flex items-baseline gap-3">
          <span className={`text-xs tabular-nums ${remaining > 0 ? 'text-money-300' : 'text-ink-100/55'}`}>
            {remaining} / {STAT_POINTS} unspent
          </span>
          <button type="button" onClick={reset}
            disabled={remaining === STAT_POINTS}
            className="text-[10px] uppercase tracking-wide text-ink-100/55 hover:text-ink-100/85 disabled:opacity-40">
            reset
          </button>
        </span>
      </div>
      <div className="space-y-2">
        {STATS.map(s => (
          <div key={s.id} className="flex items-center gap-3 rounded-md border border-ink-100/10 bg-ink-950/40 p-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-[10px] text-ink-100/50 truncate">{s.desc}</div>
            </div>
            <button type="button" onClick={() => bump(s.id, -1)}
              disabled={(value[s.id] || STAT_BASE) <= STAT_BASE}
              className="btn btn-ghost text-xs px-2 py-1 leading-none">−</button>
            <span className="font-display text-lg w-8 text-center tabular-nums">{value[s.id]}</span>
            <button type="button" onClick={() => bump(s.id, +1)}
              disabled={remaining <= 0 || (value[s.id] || STAT_BASE) >= STAT_MAX}
              className="btn btn-ghost text-xs px-2 py-1 leading-none">+</button>
          </div>
        ))}
      </div>
    </div>
  );
}
