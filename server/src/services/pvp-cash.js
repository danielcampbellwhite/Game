// Atomic PvP cash transfers. The naive pattern in routes/murder.js and
// routes/rob.js — read target.cash from a stale snapshot, mutate in
// memory, then saveCharacter(target) — was TOCTOU-broken: any parallel
// route the target hit (bank deposit, casino bet, stocks buy) could be
// silently overwritten by the attacker's stale save. Worse, the attacker
// was credited cashTaken based on the snapshot, so the system could mint
// or destroy money if the target's true balance had moved.
//
// These helpers do the debit/hospitalisation as precise column-level
// UPDATEs inside explicit transactions, returning the *actual* amount
// taken so the attacker is credited exactly what the target lost.
//
// IMPORTANT: this project uses node:sqlite (DatabaseSync), NOT
// better-sqlite3. DatabaseSync has no db.transaction() helper, so we
// drive transactions manually via db.exec('BEGIN IMMEDIATE') / COMMIT /
// ROLLBACK — same pattern as routes/trades.js executeSwap().

import { db } from '../db.js';

// Debit up to `intended` cash from `targetId`, clamped to whatever they
// actually have right now. Returns the real amount debited.
export function debitTargetCash(targetId, intended) {
  const want = Math.max(0, Math.floor(intended) || 0);
  if (want === 0) return 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT cash FROM characters WHERE id = ?').get(targetId);
    if (!row) {
      db.exec('COMMIT');
      return 0;
    }
    const have = Math.max(0, row.cash || 0);
    const take = Math.min(want, have);
    if (take > 0) {
      db.prepare('UPDATE characters SET cash = MAX(0, cash - ?) WHERE id = ?').run(take, targetId);
    }
    db.exec('COMMIT');
    return take;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

// Apply the post-PvP "you're in hospital" state with a precise UPDATE so
// we don't blow away other in-flight changes on the target row. Health
// is forced to 1 (consistent with the old behaviour where the attacker
// mutated target.health then saveCharacter()d).
export function hospitaliseTarget(targetId, hospitalUntil, reason) {
  db.prepare(`
    UPDATE characters
       SET health = 1,
           hospital_until = ?,
           hospital_reason = ?
     WHERE id = ?
  `).run(hospitalUntil, reason, targetId);
}
