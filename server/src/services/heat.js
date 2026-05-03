// Police "heat" — per-character pressure that accumulates with each
// crime committed and decays passively over time. Lazy decay model:
// we store the heat snapshot + the timestamp it was taken, then
// compute the live value at read time as `snapshot - elapsed minutes`
// (floored at 0). No background job needed.
//
// Effects (applied by routes/crimes.js):
//   - success base reduced by HEAT_SUCCESS_PENALTY × heat
//   - jail-on-fail probability multiplied by 1 + heat / 100
//
// Future-proofing: the model is single-value-per-character today. If
// we ever want per-city heat, this file is the natural home for it.

export const HEAT_MAX             = 100;
export const HEAT_DECAY_PER_MIN   = 1;        // 100 → 0 over ~100 minutes
export const HEAT_SUCCESS_PENALTY = 0.2;      // success base -20% at heat 100
export const HEAT_JAIL_MULTIPLIER = 0.01;     // +1% jail mul per heat point

// Heat added per attempt, keyed by the crime's `risk` tier (tiny/low/
// med/high/extreme). Each commit calls addHeat(ch, HEAT_BY_RISK[risk]).
// Cybercrime and major scores light up bigger heat than street picks.
export const HEAT_BY_RISK = {
  tiny:    2,
  low:     5,
  med:    10,
  high:   15,
  extreme: 25,
};

export function effectiveHeat(ch, now = Date.now()) {
  const stored = ch?.heat || 0;
  if (!stored) return 0;
  const at = ch.heat_updated_at || now;
  const elapsedMin = Math.max(0, (now - at) / 60000);
  return Math.max(0, stored - elapsedMin * HEAT_DECAY_PER_MIN);
}

// Mutates ch.heat / ch.heat_updated_at. Caller must persist via
// saveCharacter() — we don't write to the DB directly so the change
// stays inside the same transaction the route is already running.
export function addHeat(ch, amount, now = Date.now()) {
  const cur = effectiveHeat(ch, now);
  ch.heat = Math.min(HEAT_MAX, Math.max(0, cur + amount));
  ch.heat_updated_at = now;
  return ch.heat;
}

// Snapshot the live (decayed) value into the stored column. Useful when
// you want to "lock in" the decayed value without otherwise mutating —
// not used in the hot crime path but handy for admin/debug.
export function refreshHeat(ch, now = Date.now()) {
  ch.heat = effectiveHeat(ch, now);
  ch.heat_updated_at = now;
  return ch.heat;
}
