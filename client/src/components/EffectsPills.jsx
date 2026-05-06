import React from 'react';

// Renders a row of coloured pills for an `effects` map like
// { energy: 18, happiness: -2 }. Used wherever we want players to
// see at a glance what an item does when used — wholesaler picker,
// shop listings, inventory, etc. Negative values render in a dimmer
// blood-red so trade-offs (whisky's -3 health) are obvious.

const VITAL_STYLE = {
  energy:    { label: 'Energy', pos: 'border-yellow-400/60 text-yellow-300', neg: 'border-yellow-700/40 text-yellow-300/60' },
  health:    { label: 'Health', pos: 'border-money-500/60  text-money-300',  neg: 'border-blood-500/60  text-blood-300'      },
  happiness: { label: 'Happy',  pos: 'border-pink-400/60   text-pink-300',   neg: 'border-pink-700/40   text-pink-300/60'   },
};

// Stats that no longer affect gameplay — hide them from the UI even
// if old item data still carries their effect entry (server-side
// vital application is harmless, just invisible to players).
const HIDDEN_VITALS = new Set(['nerve']);

export default function EffectsPills({ effects, className = '' }) {
  if (!effects) return null;
  const entries = Object.entries(effects).filter(([k, v]) =>
    Number.isFinite(v) && v !== 0 && !HIDDEN_VITALS.has(k)
  );
  if (!entries.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {entries.map(([key, v]) => {
        const meta = VITAL_STYLE[key] || { label: key, pos: 'border-ink-100/30 text-ink-100/85', neg: 'border-ink-100/20 text-ink-100/55' };
        const cls = v >= 0 ? meta.pos : meta.neg;
        return (
          <span key={key}
            className={`text-[12px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls} tabular-nums`}>
            {v > 0 ? '+' : ''}{v} {meta.label}
          </span>
        );
      })}
    </div>
  );
}
