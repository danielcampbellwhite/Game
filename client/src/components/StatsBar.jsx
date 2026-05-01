import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { fmt } from '../components/Money.jsx';

function Bar({ label, value, max, color }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between text-[10px] text-ink-100/60 uppercase">
        <span>{label}</span><span>{value}/{max}</span>
      </div>
      <div className="bar"><div className={color} style={{ width: pct + '%' }} /></div>
    </div>
  );
}

export default function StatsBar() {
  const { character } = useGame();
  if (!character) return null;
  const c = character;
  return (
    <div className="border-b border-ink-100/10 bg-ink-900/50">
      <div className="max-w-6xl mx-auto px-4 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <Bar label="Energy"    value={c.energy} max={c.max_energy} color="bg-yellow-400" />
        <Bar label="Nerve"     value={c.nerve}  max={c.max_nerve}  color="bg-blood-500" />
        <Bar label="Health"    value={c.health} max={c.max_health} color="bg-money-500" />
        <Bar label="Happy"     value={c.happiness} max={100}       color="bg-pink-400" />
        <div>
          <div className="text-[10px] text-ink-100/60 uppercase">Cash / Bank · Dirty</div>
          <div className="text-money-400 font-semibold tabular-nums">{fmt(c.cash)}</div>
          <div className="text-ink-100/50 tabular-nums">{fmt(c.bank)}</div>
          <div className="text-blood-400 tabular-nums" title="Dirty cash — launder via car wash, nightclub, casino, etc.">{fmt(c.dirty_cash)}</div>
          <div className="text-[10px] text-gold-400 tabular-nums" title="Net worth: cash + bank + stocks + properties + businesses + vehicles">Networth {fmt(c.net_worth)}</div>
        </div>
        <div>
          <div className="text-[10px] text-ink-100/60 uppercase">Lvl {c.at_max_level ? '999+' : c.level} · {c.rank}</div>
          {c.at_max_level ? (
            <div className="text-[10px] text-gold-400 tabular-nums mt-1">MAX LEVEL</div>
          ) : (
            <>
              <div className="bar mt-1"><div className="bg-gold-500" style={{ width: ((c.xp / c.xp_to_next) * 100) + '%' }} /></div>
              <div className="text-[10px] text-ink-100/40 tabular-nums">{c.xp}/{c.xp_to_next} XP</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
