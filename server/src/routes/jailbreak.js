// Jail Escape mini-game. Replaces the previous flat 50/50 roll on
// POST /api/jail/escape with a 3-stage arrow-sequence QTE — pick the
// lock, sneak past guards, sprint the fence. Outcome scales with how
// many arrows you nailed; failing doubles the original sentence
// (preserving the old penalty). Each sentence still gives you ONE
// shot; the jail_escape_attempted flag carries forward unchanged.
//
// Architecture mirrors routes/chases.js — active_jailbreaks table
// keyed by char_id, tutorial flag for first-time players, /begin
// endpoint to acknowledge the tutorial and start the real timer.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

// Inline migration. Shipping it next to the routes that own it keeps
// the schema diff colocated with the feature.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_jailbreaks (
      char_id            INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      sequence_json      TEXT    NOT NULL,
      original_jail_ms   INTEGER NOT NULL,
      created_at         INTEGER NOT NULL,
      expires_at         INTEGER NOT NULL,
      is_tutorial        INTEGER NOT NULL DEFAULT 0
    );
  `);
} catch {}

const router = Router();

export const JAILBREAK_DURATION_MS  = 7_000;
export const JAILBREAK_SEQUENCE_LEN = 8;
const TUTORIAL_HOLD_MS = 60 * 60 * 1000;
const ARROW_POOL = ['up', 'down', 'left', 'right'];

function randomSequence(n = JAILBREAK_SEQUENCE_LEN) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ARROW_POOL[Math.floor(Math.random() * ARROW_POOL.length)]);
  return out;
}

function loadJailbreak(charId) {
  const row = db.prepare('SELECT * FROM active_jailbreaks WHERE char_id = ?').get(charId);
  if (!row) return null;
  return {
    sequence:        JSON.parse(row.sequence_json),
    originalJailMs:  row.original_jail_ms,
    createdAt:       row.created_at,
    expiresAt:       row.expires_at,
    isTutorial:      !!row.is_tutorial,
  };
}
function clearJailbreak(charId) {
  db.prepare('DELETE FROM active_jailbreaks WHERE char_id = ?').run(charId);
}

function escapeAttempted(charId) {
  const row = db.prepare('SELECT jail_escape_attempted FROM characters WHERE id = ?').get(charId);
  return !!row?.jail_escape_attempted;
}
function markEscapeAttempted(charId) {
  db.prepare('UPDATE characters SET jail_escape_attempted = 1 WHERE id = ?').run(charId);
}

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

// Live state — used by the client to recover an in-progress jailbreak
// after a refresh. Returns null when none active.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const j = loadJailbreak(req.character.id);
  if (!j) return res.json({ jailbreak: null });
  res.json({
    jailbreak: {
      sequence: j.sequence,
      expiresAt: j.expiresAt,
      durationMs: JAILBREAK_DURATION_MS,
      tutorial: j.isTutorial,
    },
  });
});

// Start — replaces the old POST /api/jail/escape semantics. Triggers
// the QTE rather than rolling immediately. Marks the escape attempt
// flag up front so the player can't bail out of the QTE and retry.
router.post('/start', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  if (!ch.jail_until || ch.jail_until <= now) return res.status(400).json({ error: 'Not in jail.' });
  if (escapeAttempted(ch.id)) {
    return res.status(409).json({ error: 'You\'ve already made a run for it this sentence. Wait it out.' });
  }
  // If a previous jailbreak row somehow lingers (e.g., the player
  // navigated away mid-QTE on a prior sentence and never resolved),
  // wipe it — fresh attempt, fresh table.
  const existing = loadJailbreak(ch.id);
  if (existing) clearJailbreak(ch.id);

  markEscapeAttempted(ch.id);
  const sequence = randomSequence();
  const isTutorial = !ch.jailbreak_tutorial_seen ? 1 : 0;
  const expiresAt = isTutorial ? now + TUTORIAL_HOLD_MS : now + JAILBREAK_DURATION_MS;
  const originalJailMs = ch.jail_sentence_ms || (ch.jail_until - now);
  db.prepare(`
    INSERT INTO active_jailbreaks (char_id, sequence_json, original_jail_ms, created_at, expires_at, is_tutorial)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ch.id, JSON.stringify(sequence), originalJailMs, now, expiresAt, isTutorial);
  res.json({
    ok: true,
    jailbreak: {
      sequence,
      expiresAt,
      durationMs: JAILBREAK_DURATION_MS,
      tutorial: !!isTutorial,
    },
    character: publicCharacter(ch),
  });
});

// Tutorial acknowledgement. Flips is_tutorial=0, writes the real
// expires_at, and marks the character as having seen the explainer
// so future jailbreaks skip the overlay.
router.post('/begin', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const j = loadJailbreak(ch.id);
  if (!j) return res.status(404).json({ error: 'No active jailbreak.' });
  if (!j.isTutorial) {
    return res.json({ ok: true, jailbreak: {
      sequence: j.sequence, expiresAt: j.expiresAt, durationMs: JAILBREAK_DURATION_MS, tutorial: false,
    }});
  }
  const now = Date.now();
  const expiresAt = now + JAILBREAK_DURATION_MS;
  db.prepare('UPDATE active_jailbreaks SET is_tutorial = 0, expires_at = ?, created_at = ? WHERE char_id = ?')
    .run(expiresAt, now, ch.id);
  ch.jailbreak_tutorial_seen = 1;
  db.prepare('UPDATE characters SET jailbreak_tutorial_seen = 1 WHERE id = ?').run(ch.id);
  res.json({
    ok: true,
    jailbreak: { sequence: j.sequence, expiresAt, durationMs: JAILBREAK_DURATION_MS, tutorial: false },
  });
});

// Resolve. Scores in-order matches; success chance scales with the
// hit count and the player's speed/dex stats (lock-pick / sneak feel).
// 8/8 + decent SPD effectively guarantees an escape; missing every
// arrow still gives a tiny hail-mary roll.
router.post('/resolve', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const j = loadJailbreak(ch.id);
  if (!j) return res.status(404).json({ error: 'No active jailbreak.' });
  if (j.isTutorial) return res.status(409).json({ error: 'Hit Continue first to start the attempt.' });

  const now = Date.now();
  if (now > j.expiresAt) {
    const newSentence = failedEscapePenalty(ch, now);
    writeLog(ch.id, 'jail', ` Jailbreak timed out — sentence doubled to ${Math.round(newSentence/60000)}m.`, null, true);
    clearJailbreak(ch.id);
    saveCharacter(ch);
    return res.json({ ok: true, escaped: false, expired: true, sentenceMs: newSentence, character: publicCharacter(ch) });
  }

  const inputs = Array.isArray(req.body?.inputs) ? req.body.inputs.slice(0, j.sequence.length) : [];
  let correct = 0;
  for (let i = 0; i < j.sequence.length; i++) {
    if (inputs[i] === j.sequence[i]) correct++;
  }
  // Speed + dex bonus, capped at +15%. Reuses the same flavour as the
  // chase's driving bonus — high stats turn a near-perfect run into
  // a near-certain escape.
  const statBonus = Math.min(0.15, ((ch.speed || 1) + (ch.dexterity || 1)) * 0.001);
  // 5% baseline + 10% per correct arrow. 8/8 + bonus tops out at the
  // 0.95 cap; 0/8 with no stats is a 5% hail-mary.
  const escapeChance = Math.min(0.95, 0.05 + correct * 0.10 + statBonus);
  const escaped = Math.random() < escapeChance;

  clearJailbreak(ch.id);

  if (escaped) {
    ch.jail_until = null;
    ch.jail_reason = null;
    ch.jail_sentence_ms = null;
    writeLog(ch.id, 'jail',
      ` Slipped out — ${correct}/${j.sequence.length} clean (${Math.round(escapeChance * 100)}% odds).`,
      { correct, escapeChance, escaped: true }, true);
    saveCharacter(ch);
    return res.json({
      ok: true, escaped: true, correct, length: j.sequence.length, escapeChance,
      sequence: j.sequence, character: publicCharacter(ch),
    });
  }
  const newSentence = failedEscapePenalty(ch, now);
  writeLog(ch.id, 'jail',
    ` Caught in the yard — sentence doubled to ${Math.round(newSentence/60000)}m (${correct}/${j.sequence.length}, ${Math.round(escapeChance * 100)}% odds).`,
    { correct, escapeChance, escaped: false }, true);
  saveCharacter(ch);
  res.json({
    ok: true, escaped: false, correct, length: j.sequence.length, escapeChance,
    sequence: j.sequence, sentenceMs: newSentence, character: publicCharacter(ch),
  });
});

// Give up — abort the QTE. The escape-attempted flag was already set
// at /start, so this just clears the row and serves out the time.
router.post('/give-up', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const j = loadJailbreak(ch.id);
  if (!j) return res.status(404).json({ error: 'No active jailbreak.' });
  // First-time tutorial counts as "seen" even on give-up.
  if (!ch.jailbreak_tutorial_seen) {
    ch.jailbreak_tutorial_seen = 1;
    db.prepare('UPDATE characters SET jailbreak_tutorial_seen = 1 WHERE id = ?').run(ch.id);
  }
  clearJailbreak(ch.id);
  writeLog(ch.id, 'jail', 'Backed out of the jailbreak attempt — staying put.');
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
