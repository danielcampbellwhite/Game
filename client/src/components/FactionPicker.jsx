import React from 'react';

// Picker rendered on character-create and new-character pages. Faction is
// locked at creation — no swapping later — so we surface the perks
// (pros + cons) prominently instead of as a hover tooltip.
//
// `palette` field on each faction maps to the project's custom Tailwind
// colours (gold/blood/money). We pre-compose class strings here so
// Tailwind's JIT picks them up at build time.

const PALETTE_CLASS = {
  gold: {
    selected:   'border-gold-400 bg-gold-500/10',
    unselected: 'border-ink-100/10 hover:border-gold-400/40',
    accent:     'text-gold-400',
  },
  blood: {
    selected:   'border-blood-500 bg-blood-700/15',
    unselected: 'border-ink-100/10 hover:border-blood-500/40',
    accent:     'text-blood-400',
  },
  money: {
    selected:   'border-money-500 bg-money-700/15',
    unselected: 'border-ink-100/10 hover:border-money-500/40',
    accent:     'text-money-400',
  },
};

export default function FactionPicker({ factions = [], value, onChange }) {
  if (!factions.length) return null;
  return (
    <div>
      <label className="text-xs uppercase text-ink-100/60 block mb-2">Faction</label>
      <div className="grid sm:grid-cols-3 gap-2">
        {factions.map(f => {
          const pal = PALETTE_CLASS[f.palette] || PALETTE_CLASS.gold;
          const selected = value === f.id;
          return (
            <button type="button" key={f.id}
              onClick={() => onChange(f.id)}
              className={`text-left p-3 rounded-lg border transition ${selected ? pal.selected : `bg-ink-950/40 ${pal.unselected}`}`}>
              <div className={`font-display text-lg ${pal.accent}`}>{f.name}</div>
              <div className="text-[11px] text-ink-100/60 mt-1 leading-snug">{f.blurb}</div>
              {f.perks && (
                <div className="mt-2 space-y-0.5 text-[10px]">
                  {(f.perks.pros || []).map((p, i) => (
                    <div key={`pro-${i}`} className="text-money-400">+ {p}</div>
                  ))}
                  {(f.perks.cons || []).map((c, i) => (
                    <div key={`con-${i}`} className="text-blood-400">− {c}</div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
