import React from 'react';

const COLORS = {
  crime: 'text-blood-400',
  combat: 'text-blood-400',
  jail: 'text-yellow-400',
  hospital: 'text-blue-300',
  job: 'text-money-400',
  drugs: 'text-fuchsia-400',
  business: 'text-emerald-400',
  travel: 'text-cyan-300',
  bank: 'text-money-400',
  stock: 'text-gold-400',
  property: 'text-amber-300',
  shop: 'text-orange-300',
  equip: 'text-orange-300',
  training: 'text-violet-300',
  daily: 'text-pink-300',
  launder: 'text-emerald-300',
  consume: 'text-pink-400',
  system: 'text-ink-100/70',
};

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function LogFeed({ items = [], max = 30 }) {
  if (!items.length) return <p className="text-xs text-ink-100/50">No activity yet.</p>;
  return (
    <ul className="space-y-1.5 max-h-96 overflow-y-auto scrollbar pr-2">
      {items.slice(0, max).map(i => (
        <li key={i.id} className="text-xs">
          <span className="text-ink-100/40 mr-2 tabular-nums">{timeAgo(i.created_at)}</span>
          <span className={`${COLORS[i.type] || 'text-ink-50'} uppercase text-[10px] tracking-wide mr-2`}>{i.type}</span>
          <span className="text-ink-100/85">{i.message}</span>
        </li>
      ))}
    </ul>
  );
}
