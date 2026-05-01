import React from 'react';

export function fmt(n) {
  if (n == null || isNaN(n)) return '$0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  if (abs >= 1_000_000_000) return `${sign}£${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000)        return `${sign}£${(abs / 1_000).toFixed(1)}K`;
  return `${sign}£${abs.toLocaleString()}`;
}

export default function Money({ value, dirty = false, className = '' }) {
  return (
    <span className={`tabular-nums ${dirty ? 'text-blood-400' : 'text-money-400'} ${className}`}>
      {fmt(value)}{dirty && <span className="ml-1 text-[10px] uppercase opacity-70">dirty</span>}
    </span>
  );
}
