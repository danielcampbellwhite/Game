// Per-player relationship scores for named city NPCs (see
// data-npcs.js). Inline DB migration so we don't need to touch
// db.js; idempotent ALTER + CREATE.

import { db } from '../db.js';
import { npcById, relationshipBand } from '../data-npcs.js';

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS npc_relationships (
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      npc_id  TEXT    NOT NULL,
      score   INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      PRIMARY KEY (char_id, npc_id)
    );
    CREATE INDEX IF NOT EXISTS idx_npc_rel_char ON npc_relationships(char_id);
  `);
} catch {}

export function getScore(charId, npcId) {
  const row = db.prepare(
    'SELECT score, last_used_at FROM npc_relationships WHERE char_id = ? AND npc_id = ?'
  ).get(charId, npcId);
  return row ? row.score : 0;
}

export function relationshipFor(charId, npcId) {
  const npc = npcById(npcId);
  if (!npc) return null;
  const score = getScore(charId, npcId);
  return { npc, score, band: relationshipBand(score) };
}

export function bumpScore(charId, npcId, delta = 1) {
  const npc = npcById(npcId);
  if (!npc) return null;
  const now = Date.now();
  db.prepare(`
    INSERT INTO npc_relationships (char_id, npc_id, score, last_used_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(char_id, npc_id) DO UPDATE SET
      score = score + excluded.score,
      last_used_at = excluded.last_used_at
  `).run(charId, npcId, delta, now);
  return getScore(charId, npcId);
}

// Cross a contact and they freeze you out. Used by future routes
// when the player kills, robs, or otherwise betrays a known
// contact. Floor at zero — we don't model permanent grudges yet.
export function damageScore(charId, npcId, drop = 10) {
  const cur = getScore(charId, npcId);
  const next = Math.max(0, cur - drop);
  db.prepare(`
    INSERT INTO npc_relationships (char_id, npc_id, score, last_used_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(char_id, npc_id) DO UPDATE SET
      score = excluded.score,
      last_used_at = excluded.last_used_at
  `).run(charId, npcId, next, Date.now());
  return next;
}
