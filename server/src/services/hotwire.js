// Hot-wire mini-game state. Fires on every tier='gta' crime commit,
// BEFORE the success roll. Result modifies both the crime success
// rate and the subsequent chase's escape odds (if a chase fires at
// all). Mirrors the chase/jailbreak/crime-qte patterns: pending row
// per char, tutorial-mode placeholder expires_at, /begin endpoint
// to ack the tutorial.
//
// The pending row stores enough info to resume the crime resolution
// on the resolve endpoint — crime id + name + everything the
// success/failure path needs. Energy / items are already deducted
// at commit time (the player committed to the crime), so resolving
// late just runs the resolution with the hot-wire bonus applied.

import { db } from '../db.js';

// Stores the QTE state PLUS the crime-resolution context the route
// captured at /commit time. /hotwire/resolve uses base_success_pct
// to seed the success roll (with the QTE bonus on top) and heat /
// hour_mul / intel_bonus to drive the consequence math on failure
// without recomputing — which would race against any heat decay or
// hour-bucket change between the commit and the resolve.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_hotwires (
      char_id           INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      crime_id          TEXT    NOT NULL,
      crime_name        TEXT    NOT NULL,
      sequence_json     TEXT    NOT NULL,
      created_at        INTEGER NOT NULL,
      expires_at        INTEGER NOT NULL,
      is_tutorial       INTEGER NOT NULL DEFAULT 0,
      base_success_pct  REAL    NOT NULL DEFAULT 50,
      heat_at_commit    REAL    NOT NULL DEFAULT 0,
      hour_mul          REAL    NOT NULL DEFAULT 1,
      intel_bonus       REAL    NOT NULL DEFAULT 0,
      dirty             INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Backfill columns for any DB that pre-dates the resolution-
  // context columns.
  const cols = db.prepare("PRAGMA table_info(active_hotwires)").all().map(c => c.name);
  for (const [name, sql] of [
    ['base_success_pct', 'REAL NOT NULL DEFAULT 50'],
    ['heat_at_commit',   'REAL NOT NULL DEFAULT 0'],
    ['hour_mul',         'REAL NOT NULL DEFAULT 1'],
    ['intel_bonus',      'REAL NOT NULL DEFAULT 0'],
    ['dirty',            'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE active_hotwires ADD COLUMN ${name} ${sql}`);
  }
} catch {}

export const HOTWIRE_SEQUENCE_LEN = 3;
export const HOTWIRE_DURATION_MS  = 4_000;
const TUTORIAL_HOLD_MS = 60 * 60 * 1000;
const ARROW_POOL = ['up', 'down', 'left', 'right'];

function randomSequence(n = HOTWIRE_SEQUENCE_LEN) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ARROW_POOL[Math.floor(Math.random() * ARROW_POOL.length)]);
  return out;
}

export function startHotwire(ch, { crime, baseSuccessPct, heatAtCommit, hourMul, intelBonus }) {
  const now = Date.now();
  const sequence = randomSequence();
  const isTutorial = !ch.hotwire_tutorial_seen ? 1 : 0;
  const expiresAt = isTutorial ? now + TUTORIAL_HOLD_MS : now + HOTWIRE_DURATION_MS;
  db.prepare(`
    INSERT INTO active_hotwires (
      char_id, crime_id, crime_name, sequence_json, created_at, expires_at, is_tutorial,
      base_success_pct, heat_at_commit, hour_mul, intel_bonus, dirty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(char_id) DO UPDATE SET
      crime_id         = excluded.crime_id,
      crime_name       = excluded.crime_name,
      sequence_json    = excluded.sequence_json,
      created_at       = excluded.created_at,
      expires_at       = excluded.expires_at,
      is_tutorial      = excluded.is_tutorial,
      base_success_pct = excluded.base_success_pct,
      heat_at_commit   = excluded.heat_at_commit,
      hour_mul         = excluded.hour_mul,
      intel_bonus      = excluded.intel_bonus,
      dirty            = excluded.dirty
  `).run(
    ch.id, crime.id, crime.name, JSON.stringify(sequence), now, expiresAt, isTutorial,
    baseSuccessPct, heatAtCommit, hourMul, intelBonus, crime.dirty ? 1 : 0,
  );
  return {
    crimeName: crime.name,
    sequence,
    expiresAt,
    durationMs: HOTWIRE_DURATION_MS,
    tutorial: !!isTutorial,
  };
}

export function loadHotwire(charId) {
  const row = db.prepare('SELECT * FROM active_hotwires WHERE char_id = ?').get(charId);
  if (!row) return null;
  return {
    crimeId:        row.crime_id,
    crimeName:      row.crime_name,
    sequence:       JSON.parse(row.sequence_json),
    createdAt:      row.created_at,
    expiresAt:      row.expires_at,
    isTutorial:     !!row.is_tutorial,
    baseSuccessPct: row.base_success_pct,
    heatAtCommit:   row.heat_at_commit,
    hourMul:        row.hour_mul,
    intelBonus:     row.intel_bonus,
    dirty:          !!row.dirty,
  };
}

export function clearHotwire(charId) {
  db.prepare('DELETE FROM active_hotwires WHERE char_id = ?').run(charId);
}

export function beginHotwire(ch) {
  const h = loadHotwire(ch.id);
  if (!h) return null;
  if (!h.isTutorial) return h;
  const now = Date.now();
  const expiresAt = now + HOTWIRE_DURATION_MS;
  db.prepare('UPDATE active_hotwires SET is_tutorial = 0, expires_at = ?, created_at = ? WHERE char_id = ?')
    .run(expiresAt, now, ch.id);
  ch.hotwire_tutorial_seen = 1;
  db.prepare('UPDATE characters SET hotwire_tutorial_seen = 1 WHERE id = ?').run(ch.id);
  return { ...h, isTutorial: false, expiresAt };
}

// Returns { correct, length, successBonusPct, chaseBonusPct }.
// successBonusPct is added to the crime success rate; chaseBonusPct
// is fed into startChase to scale the escape chance.
export function scoreHotwire(h, inputs, { expired = false } = {}) {
  if (expired) return { correct: 0, length: h.sequence.length, successBonusPct: 0, chaseBonusPct: 0 };
  let correct = 0;
  for (let i = 0; i < h.sequence.length; i++) {
    if (inputs[i] === h.sequence[i]) correct++;
  }
  return {
    correct,
    length: h.sequence.length,
    successBonusPct: correct * 3,  // 0–9%
    chaseBonusPct:   correct * 5,  // 0–15%
  };
}
