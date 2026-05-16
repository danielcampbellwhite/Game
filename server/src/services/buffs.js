// Temporary stat buffs (gym + shooting range training).
//
// Model: each buff has an `amount` and a `started_at` timestamp. The
// effective buff decays linearly at 1 point per hour from `started_at`.
// Training adds the new gain on top of the current decayed buff and
// resets `started_at` to now. So a +5 buff lasts 5h; if you train again
// when it's at +3, you get current+gain capped at MAX_BUFF.

export const MAX_BUFF = 30;
const HOURS_PER_POINT = 1;
const HOUR_MS = 60 * 60 * 1000;

const STATS = ['strength', 'defence', 'speed', 'accuracy'];

export function getCurrentBuff(ch, stat) {
  const amount = ch[`${stat}_buff`] || 0;
  const startedAt = ch[`${stat}_buff_at`] || 0;
  if (!amount || !startedAt) return 0;
  // Decay one full point per completed hour. Sub-hour drift doesn't shave
  // anything off, so the buff you just trained reads as the full amount
  // until the first hour mark passes.
  const fullHours = Math.floor((Date.now() - startedAt) / HOUR_MS) * HOURS_PER_POINT;
  return Math.max(0, amount - fullHours);
}

// Apply a training session — `gains` is { strength, defence, ... }
export function applyTrainingBuffs(ch, gains) {
  for (const [stat, gain] of Object.entries(gains)) {
    if (!STATS.includes(stat)) continue;
    const current = getCurrentBuff(ch, stat);
    const newBuff = Math.min(MAX_BUFF, current + gain);
    ch[`${stat}_buff`] = newBuff;
    ch[`${stat}_buff_at`] = Date.now();
  }
}

// Snapshot used by combat and the public character payload.
export function buffSnapshot(ch) {
  const out = {};
  for (const stat of STATS) {
    const current = getCurrentBuff(ch, stat);
    const startedAt = ch[`${stat}_buff_at`] || null;
    const stored = ch[`${stat}_buff`] || 0;
    // Buff drops to 0 at startedAt + stored * HOUR_MS
    const fadesAt = stored && startedAt ? startedAt + stored * HOUR_MS * HOURS_PER_POINT : null;
    out[stat] = { current, fadesAt, max: MAX_BUFF };
  }
  return out;
}

export function effectiveStats(ch) {
  return {
    strength: (ch.strength || 0) + getCurrentBuff(ch, 'strength'),
    defence:  (ch.defence  || 0) + getCurrentBuff(ch, 'defence'),
    speed:    (ch.speed    || 0) + getCurrentBuff(ch, 'speed'),
    // No INT buff stat in the current buff system — pass the raw
    // value so callers (e.g. the murder hit formula) read a number,
    // not undefined. Skipping this turns the whole hit math into
    // NaN, which silently makes every shot miss.
    intelligence: ch.intelligence || 0,
    accuracy: getCurrentBuff(ch, 'accuracy'), // base 0; pure buff stat
  };
}
