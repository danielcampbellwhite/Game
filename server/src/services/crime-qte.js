// Crime mini-games — deferred payout for tier='cyber' and tier='major'
// successes. The crime commit handler runs the normal success roll and
// computes the base payout, then instead of paying out, parks it in
// active_crime_qte and returns a QTE descriptor to the client. The
// /api/crimes/qte/resolve endpoint scores the inputs and applies a
// 0.25–1.0 multiplier to the base payout.
//
// Same tutorial pattern as the chase / jailbreak QTEs: first-time
// resolves park expires_at +1h until the player hits Continue. Shared
// `crime_qte_tutorial_seen` flag across cyber + major since both
// feel identical (only the accent and the sequence length differ).

import { db } from '../db.js';

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_crime_qte (
      char_id        INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      crime_id       TEXT    NOT NULL,
      crime_name     TEXT    NOT NULL,
      crime_tier     TEXT    NOT NULL,   -- 'cyber' | 'major'
      base_payout    INTEGER NOT NULL,   -- pre-multiplier net payout (after gang skim)
      gang_skim      INTEGER NOT NULL,   -- already deducted at commit time; carried for logging
      dirty          INTEGER NOT NULL,   -- 0/1 — pays into cash vs dirty_cash
      xp_gain        INTEGER NOT NULL,
      levels_json    TEXT,               -- awardXp() return value, surfaced on the resolve response
      sequence_json  TEXT    NOT NULL,
      created_at     INTEGER NOT NULL,
      expires_at     INTEGER NOT NULL,
      is_tutorial    INTEGER NOT NULL DEFAULT 0
    );
  `);
} catch {}

// Per-tier QTE shape. Kept symmetric: identical mechanic, different
// length / time / accent so the moment feels appropriate to the
// scale of the crime.
export const TIER_QTE = {
  cyber: { sequenceLen: 5, durationMs: 4_000, accent: 'cyan' },
  major: { sequenceLen: 7, durationMs: 6_000, accent: 'gold' },
};
const ARROW_POOL = ['up', 'down', 'left', 'right'];
const TUTORIAL_HOLD_MS = 60 * 60 * 1000;

function randomSequence(len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(ARROW_POOL[Math.floor(Math.random() * ARROW_POOL.length)]);
  return out;
}

// Returns the QTE payload to send back from /crimes/commit, OR null
// if the crime doesn't trigger a QTE. The caller has already
// computed the base payout and applied any XP / reputation / missions.
export function deferCrimeQte(ch, { crime, payout, skim, dirty, xpGain, levels }) {
  const cfg = TIER_QTE[crime.tier];
  if (!cfg) return null;
  const now = Date.now();
  const sequence = randomSequence(cfg.sequenceLen);
  const isTutorial = !ch.crime_qte_tutorial_seen ? 1 : 0;
  const expiresAt = isTutorial ? now + TUTORIAL_HOLD_MS : now + cfg.durationMs;
  db.prepare(`
    INSERT INTO active_crime_qte (
      char_id, crime_id, crime_name, crime_tier, base_payout, gang_skim, dirty,
      xp_gain, levels_json, sequence_json, created_at, expires_at, is_tutorial
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(char_id) DO UPDATE SET
      crime_id      = excluded.crime_id,
      crime_name    = excluded.crime_name,
      crime_tier    = excluded.crime_tier,
      base_payout   = excluded.base_payout,
      gang_skim     = excluded.gang_skim,
      dirty         = excluded.dirty,
      xp_gain       = excluded.xp_gain,
      levels_json   = excluded.levels_json,
      sequence_json = excluded.sequence_json,
      created_at    = excluded.created_at,
      expires_at    = excluded.expires_at,
      is_tutorial   = excluded.is_tutorial
  `).run(
    ch.id, crime.id, crime.name, crime.tier, payout, skim, dirty ? 1 : 0,
    xpGain, JSON.stringify(levels || []), JSON.stringify(sequence), now, expiresAt, isTutorial,
  );
  return {
    type:        crime.tier,
    crimeName:   crime.name,
    sequence,
    expiresAt,
    durationMs:  cfg.durationMs,
    tutorial:    !!isTutorial,
    basePayout:  payout,
  };
}

export function loadPendingCrimeQte(charId) {
  const row = db.prepare('SELECT * FROM active_crime_qte WHERE char_id = ?').get(charId);
  if (!row) return null;
  return {
    crimeId:      row.crime_id,
    crimeName:    row.crime_name,
    crimeTier:    row.crime_tier,
    basePayout:   row.base_payout,
    gangSkim:     row.gang_skim,
    dirty:        !!row.dirty,
    xpGain:       row.xp_gain,
    levels:       row.levels_json ? JSON.parse(row.levels_json) : [],
    sequence:     JSON.parse(row.sequence_json),
    createdAt:    row.created_at,
    expiresAt:    row.expires_at,
    isTutorial:   !!row.is_tutorial,
  };
}

export function clearPendingCrimeQte(charId) {
  db.prepare('DELETE FROM active_crime_qte WHERE char_id = ?').run(charId);
}

// Tutorial ack — flips is_tutorial=0, writes the real expires_at,
// marks the character as having seen the explainer.
export function beginCrimeQte(ch) {
  const p = loadPendingCrimeQte(ch.id);
  if (!p) return null;
  if (!p.isTutorial) return p;
  const cfg = TIER_QTE[p.crimeTier];
  const now = Date.now();
  const expiresAt = now + cfg.durationMs;
  db.prepare('UPDATE active_crime_qte SET is_tutorial = 0, expires_at = ?, created_at = ? WHERE char_id = ?')
    .run(expiresAt, now, ch.id);
  ch.crime_qte_tutorial_seen = 1;
  db.prepare('UPDATE characters SET crime_qte_tutorial_seen = 1 WHERE id = ?').run(ch.id);
  return { ...p, isTutorial: false, expiresAt };
}

// Score the player's inputs against the stored sequence and produce
// a multiplier: 0.25 (no hits) → 1.0 (perfect). Bell-shaped between.
export function scoreCrimeQte(pending, inputs) {
  let correct = 0;
  for (let i = 0; i < pending.sequence.length; i++) {
    if (inputs[i] === pending.sequence[i]) correct++;
  }
  const frac = pending.sequence.length > 0 ? correct / pending.sequence.length : 0;
  // 0.25 floor so even a clean miss still pays something — XP and
  // mission credit were already applied at the commit; the QTE just
  // scales how much cash you walk away with.
  const mul = 0.25 + 0.75 * frac;
  return { correct, length: pending.sequence.length, multiplier: mul };
}
