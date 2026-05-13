// Police chase mini-game. Triggered when a GTA crime rolls into the
// 'jail' failure outcome — instead of applying the jail sentence
// immediately, the player gets a brief reaction game: a 5-arrow
// sequence to tap in order against a 12-second timer. Score 5/5 and
// you slip the chase clean; flub it and the original sentence lands.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter, applyJailSentence } from '../services/character.js';
import { writeLog } from '../services/log.js';

// Inline migration — add the active_chases table without touching db.js.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_chases (
      char_id           INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      sequence_json     TEXT    NOT NULL,
      intended_jail_min INTEGER NOT NULL,
      crime_id          TEXT    NOT NULL,
      crime_name        TEXT    NOT NULL,
      created_at        INTEGER NOT NULL,
      expires_at        INTEGER NOT NULL
    );
  `);
} catch {}

const router = Router();

export const CHASE_DURATION_MS = 5_000;
export const CHASE_SEQUENCE_LEN = 5;
const ARROW_POOL = ['up', 'down', 'left', 'right'];

function randomSequence(len = CHASE_SEQUENCE_LEN) {
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(ARROW_POOL[Math.floor(Math.random() * ARROW_POOL.length)]);
  }
  return out;
}

// Public — called from routes/crimes.js when a GTA crime would have
// jailed the player. Creates the active chase row and returns the
// payload the route should send back to the client (instead of the
// usual jail outcome).
export function startChase(ch, { crimeId, crimeName, jailMin }) {
  const now = Date.now();
  const sequence = randomSequence();
  const expiresAt = now + CHASE_DURATION_MS;
  db.prepare(`
    INSERT INTO active_chases (char_id, sequence_json, intended_jail_min, crime_id, crime_name, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(char_id) DO UPDATE SET
      sequence_json     = excluded.sequence_json,
      intended_jail_min = excluded.intended_jail_min,
      crime_id          = excluded.crime_id,
      crime_name        = excluded.crime_name,
      created_at        = excluded.created_at,
      expires_at        = excluded.expires_at
  `).run(ch.id, JSON.stringify(sequence), jailMin, crimeId, crimeName, now, expiresAt);
  return {
    chase: {
      sequence,
      expiresAt,
      durationMs: CHASE_DURATION_MS,
      crimeName,
      jailMin, // the price of giving up / failing
    },
  };
}

function loadChase(charId) {
  const row = db.prepare('SELECT * FROM active_chases WHERE char_id = ?').get(charId);
  if (!row) return null;
  return {
    sequence:        JSON.parse(row.sequence_json),
    intendedJailMin: row.intended_jail_min,
    crimeId:         row.crime_id,
    crimeName:       row.crime_name,
    createdAt:       row.created_at,
    expiresAt:       row.expires_at,
  };
}
function clearChase(charId) {
  db.prepare('DELETE FROM active_chases WHERE char_id = ?').run(charId);
}

// Public — lazy resolver. Crimes route calls this on every commit to
// catch any chase the player walked away from. If a chase has
// expired, apply the jail sentence so the player can't dodge
// indefinitely by ignoring the prompt.
export function resolveExpiredChase(ch) {
  const c = loadChase(ch.id);
  if (!c) return null;
  if (Date.now() < c.expiresAt) return null;
  applyJailSentence(
    ch,
    c.intendedJailMin * 60 * 1000,
    `Ditched the chase but the cruisers caught you a block over (${c.crimeName}). ${c.intendedJailMin}m inside.`
  );
  writeLog(ch.id, 'crime', ` Police chase elapsed — caught + jailed ${c.intendedJailMin}m.`, { crime: c.crimeId }, true);
  clearChase(ch.id);
  return { expired: true, jailMin: c.intendedJailMin };
}

// Live chase state (used by client to recover after refresh / load).
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const c = loadChase(req.character.id);
  if (!c) return res.json({ chase: null });
  res.json({
    chase: {
      sequence: c.sequence,
      expiresAt: c.expiresAt,
      durationMs: CHASE_DURATION_MS,
      crimeName: c.crimeName,
      jailMin: c.intendedJailMin,
    },
  });
});

// Resolve — client posts { inputs: ['up','left',...] }. Server scores
// in-order matches, factors in driving stat for a bonus, and either
// frees the player or applies the original jail sentence. No half-
// measures: it's all or nothing, but a partial sequence still gets
// you a roll.
router.post('/resolve', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const c = loadChase(ch.id);
  if (!c) return res.status(404).json({ error: 'No active chase.' });

  const now = Date.now();
  if (now > c.expiresAt) {
    // Lazy-resolve an expired chase as a failure.
    applyJailSentence(ch, c.intendedJailMin * 60 * 1000,
      `Lost the chase on the clock (${c.crimeName}). ${c.intendedJailMin}m inside.`);
    writeLog(ch.id, 'crime', ` Chase timed out — caught + jailed ${c.intendedJailMin}m.`, { crime: c.crimeId }, true);
    clearChase(ch.id);
    saveCharacter(ch);
    return res.json({ ok: true, escaped: false, expired: true, jailMin: c.intendedJailMin, character: publicCharacter(ch) });
  }

  const inputs = Array.isArray(req.body?.inputs) ? req.body.inputs.slice(0, c.sequence.length) : [];
  let correct = 0;
  for (let i = 0; i < c.sequence.length; i++) {
    if (inputs[i] === c.sequence[i]) correct++;
  }

  // Escape chance: 10% baseline, +16% per correct arrow, plus a flat
  // bonus from driving stat (capped at +20%). 5/5 + decent driving
  // basically guarantees an escape; 0/5 still gives you a 10–30%
  // hail-mary roll.
  const drivingBonus = Math.min(0.20, (ch.driving || 1) * 0.003);
  const escapeChance = Math.min(0.95, 0.10 + correct * 0.16 + drivingBonus);
  const escaped = Math.random() < escapeChance;

  clearChase(ch.id);

  if (escaped) {
    ch.happiness = Math.min(100, ch.happiness + 2);
    writeLog(ch.id, 'crime',
      ` Outran the cruisers from "${c.crimeName}" (${correct}/${c.sequence.length} clean, ${Math.round(escapeChance * 100)}% odds).`,
      { crime: c.crimeId, correct, escapeChance, escaped: true });
    saveCharacter(ch);
    return res.json({
      ok: true, escaped: true, correct, length: c.sequence.length, escapeChance,
      sequence: c.sequence, character: publicCharacter(ch),
    });
  }

  // Caught — apply the original jail sentence. No extra time for the
  // attempt; trying and failing is the same as giving up.
  applyJailSentence(ch, c.intendedJailMin * 60 * 1000,
    `Roadblock caught you (${c.crimeName}, ${correct}/${c.sequence.length}). ${c.intendedJailMin}m inside.`);
  writeLog(ch.id, 'crime',
    ` Caught at the end of the chase (${c.crimeName}, ${correct}/${c.sequence.length}). Jailed ${c.intendedJailMin}m.`,
    { crime: c.crimeId, correct, escapeChance, escaped: false }, true);
  saveCharacter(ch);
  res.json({
    ok: true, escaped: false, correct, length: c.sequence.length, escapeChance,
    sequence: c.sequence, jailMin: c.intendedJailMin, character: publicCharacter(ch),
  });
});

// Give up — voluntarily skip the mini-game, apply the original jail.
router.post('/give-up', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const c = loadChase(ch.id);
  if (!c) return res.status(404).json({ error: 'No active chase.' });
  applyJailSentence(ch, c.intendedJailMin * 60 * 1000,
    `Pulled over without a fight (${c.crimeName}). ${c.intendedJailMin}m inside.`);
  writeLog(ch.id, 'crime', `Ditched the wheel for the cuffs (${c.crimeName}). Jailed ${c.intendedJailMin}m.`,
    { crime: c.crimeId }, true);
  clearChase(ch.id);
  saveCharacter(ch);
  res.json({ ok: true, jailMin: c.intendedJailMin, character: publicCharacter(ch) });
});

export default router;
