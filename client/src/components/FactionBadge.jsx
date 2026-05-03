import React from 'react';

// Tiny pill rendered next to a player's name to show their faction.
// Lookup is by id → display name + colour. Kept in sync with the
// server FACTIONS catalogue (server/src/data.js).

const FACTION_DISPLAY = {
  fraudster: { label: 'Fraudster', cls: 'border-gold-400/40  text-gold-400' },
  mafia:     { label: 'Mafia',     cls: 'border-blood-500/40 text-blood-400' },
  cartel:    { label: 'Cartel',    cls: 'border-money-500/40 text-money-400' },
};

export default function FactionBadge({ faction, className = '' }) {
  if (!faction) return null;
  const meta = FACTION_DISPLAY[faction];
  if (!meta) return null;
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.cls} ${className}`}>
      {meta.label}
    </span>
  );
}
