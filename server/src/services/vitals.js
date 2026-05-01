import { getPropertyBonuses } from './character.js';

// Apply additive vital effects respecting caps.
// `effects` may include: energy, nerve, health, happiness (positive or negative integers).
export function applyVitalEffects(ch, effects) {
  const bonuses = getPropertyBonuses(ch.id, ch.city);
  const happyCeiling = 100 + bonuses.happiness;
  const out = {};
  if (typeof effects.energy === 'number') {
    const before = ch.energy;
    ch.energy = Math.max(0, Math.min(ch.max_energy, ch.energy + effects.energy));
    out.energy = ch.energy - before;
  }
  if (typeof effects.nerve === 'number') {
    const before = ch.nerve;
    ch.nerve = Math.max(0, Math.min(ch.max_nerve, ch.nerve + effects.nerve));
    out.nerve = ch.nerve - before;
  }
  if (typeof effects.health === 'number') {
    const before = ch.health;
    ch.health = Math.max(1, Math.min(ch.max_health, ch.health + effects.health));
    out.health = ch.health - before;
  }
  if (typeof effects.happiness === 'number') {
    const before = ch.happiness;
    ch.happiness = Math.max(0, Math.min(happyCeiling, ch.happiness + effects.happiness));
    out.happiness = ch.happiness - before;
  }
  return out;
}

export function effectsToText(applied) {
  const parts = [];
  for (const [k, v] of Object.entries(applied)) {
    if (!v) continue;
    parts.push(`${v > 0 ? '+' : ''}${v} ${k}`);
  }
  return parts.join(', ') || 'no effect';
}
