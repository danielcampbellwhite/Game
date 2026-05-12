import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

const ESCAPE_SUCCESS_CHANCE = 0.5;

// Escape is one-and-done per sentence. The column tracks whether the
// player has already tried to bolt on this stretch — set to 1 after an
// attempt, reset to 0 by applyJailSentence() whenever a fresh sentence
// is applied. Inline migration so we don't have to touch db.js.
try { db.exec('ALTER TABLE characters ADD COLUMN jail_escape_attempted INTEGER NOT NULL DEFAULT 0'); } catch {}

function escapeAttempted(charId) {
  const row = db.prepare('SELECT jail_escape_attempted FROM characters WHERE id = ?').get(charId);
  return !!row?.jail_escape_attempted;
}
function markEscapeAttempted(charId) {
  db.prepare('UPDATE characters SET jail_escape_attempted = 1 WHERE id = ?').run(charId);
}

// On a failed escape we double the *original* sentence (the duration
// the player was first locked in for) — falling back to twice the
// remaining time if the row predates the jail_sentence_ms column.
function failedEscapePenalty(ch, now) {
  const original = ch.jail_sentence_ms;
  const remaining = ch.jail_until - now;
  const fresh = (typeof original === 'number' && original > 0)
    ? original * 2
    : remaining * 2;
  ch.jail_until = now + fresh;
  ch.jail_sentence_ms = fresh;
  return fresh;
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  const remaining = ch.jail_until && ch.jail_until > now ? ch.jail_until - now : 0;
  const lawyerCost = remaining > 0 ? Math.max(500, Math.floor(remaining / 1000) * 5) : 0;
  const bribeCost  = remaining > 0 ? Math.max(2000, Math.floor(remaining / 1000) * 25) : 0;
  const original = ch.jail_sentence_ms || remaining;
  const attempted = escapeAttempted(ch.id);
  res.json({
    inJail: remaining > 0,
    jail_until: ch.jail_until,
    jail_sentence_ms: ch.jail_sentence_ms || null,
    lawyerCost,
    bribeCost,
    escape: {
      successChance: ESCAPE_SUCCESS_CHANCE,
      penaltyMs: original * 2,
      attempted,
      available: remaining > 0 && !attempted,
    },
  });
});

router.post('/lawyer', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  if (!ch.jail_until || ch.jail_until <= now) return res.status(400).json({ error: 'Not in jail' });
  const remaining = ch.jail_until - now;
  const cost = Math.max(500, Math.floor(remaining / 1000) * 5);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  ch.cash -= cost;
  ch.jail_until = now + Math.floor(remaining / 2);
  writeLog(ch.id, 'jail', `Hired a lawyer for £${cost}, sentence cut in half.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/bribe', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  if (!ch.jail_until || ch.jail_until <= now) return res.status(400).json({ error: 'Not in jail' });
  const remaining = ch.jail_until - now;
  const cost = Math.max(2000, Math.floor(remaining / 1000) * 25);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  // 90% chance succeeds; on fail, lose cash and double the original sentence.
  if (Math.random() < 0.9) {
    ch.cash -= cost;
    ch.jail_until = null;
    ch.jail_reason = null;
    ch.jail_sentence_ms = null;
    writeLog(ch.id, 'jail', `Bribed your way out for £${cost}.`);
  } else {
    ch.cash -= cost;
    const newSentence = failedEscapePenalty(ch, now);
    writeLog(ch.id, 'jail', `Bribe rejected — sentence doubled to ${Math.round(newSentence/60000)}m and lost £${cost}.`);
  }
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// Make a run for it — 50/50 success, but you only get ONE shot per
// sentence. Win: walk out clean (no cash cost, just nerve). Lose:
// timer is set to twice the original sentence, so a 5-minute lag
// becomes a 10-minute one regardless of how close to release you were.
// The attempted flag is reset by applyJailSentence() so a fresh
// sentence (from a new conviction) gets a fresh chance to bolt.
router.post('/escape', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  if (!ch.jail_until || ch.jail_until <= now) return res.status(400).json({ error: 'Not in jail' });
  if (escapeAttempted(ch.id)) {
    return res.status(409).json({ error: 'You\'ve already made a run for it this sentence. Wait it out.' });
  }
  markEscapeAttempted(ch.id);
  if (Math.random() < ESCAPE_SUCCESS_CHANCE) {
    ch.jail_until = null;
    ch.jail_reason = null;
    ch.jail_sentence_ms = null;
    writeLog(ch.id, 'jail', `Slipped out through the laundry — escape successful.`);
    saveCharacter(ch);
    return res.json({ ok: true, success: true, character: publicCharacter(ch) });
  }
  const newSentence = failedEscapePenalty(ch, now);
  writeLog(ch.id, 'jail', `Escape attempt failed — sentence doubled to ${Math.round(newSentence/60000)}m. No second chance this stretch.`);
  saveCharacter(ch);
  res.json({ ok: true, success: false, sentenceMs: newSentence, character: publicCharacter(ch) });
});

export default router;
