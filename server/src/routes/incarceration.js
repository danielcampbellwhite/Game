import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter, loadCharacterById } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { sendEvent } from '../services/events.js';
import { gangBadgeFor } from '../services/gangs.js';
import { rankFor } from '../data.js';

const router = Router();

// ── Pricing ────────────────────────────────────────────────────────────
//
// Mirrors the solo formulas in routes/jail.js + routes/hospital.js so
// helping a friend lines up with what they'd pay themselves. Bail uses
// the bribe formula (full release), pay-hospital uses the fast-track
// formula (full discharge + heal). The minimums match too.
const FAVOUR_MULT = 1.25;  // small premium when bailing/paying for someone else

function bailCostFor(target, now) {
  const remaining = target.jail_until - now;
  const base = Math.max(2000, Math.floor(remaining / 1000) * 25);
  return Math.floor(base * FAVOUR_MULT);
}
function hospitalCostFor(target, now) {
  const remaining = target.hospital_until - now;
  const base = Math.max(1000, Math.floor(remaining / 1000) * 10);
  return Math.floor(base * FAVOUR_MULT);
}

// Bust-out chance scales with intelligence so brains beat brawn here.
// Range: 30%..60%. Failed busts land the rescuer in jail.
const BUST_BASE_PCT = 0.30;
const BUST_INT_PCT  = 0.30;   // full +30% at intelligence 100+
const BUST_FAIL_JAIL_MIN_S = 180;
const BUST_FAIL_JAIL_MAX_S = 600;
const BUST_COOLDOWN_MS = 5 * 60 * 1000;  // 5m between bust attempts (per buster)

function bustChanceFor(rescuer) {
  const intBoost = Math.min(1, (rescuer.intelligence || 0) / 100) * BUST_INT_PCT;
  return Math.min(0.95, BUST_BASE_PCT + intBoost);
}

// In-memory cooldown map: rescuer_id -> last-attempt timestamp. Bust is
// throwaway state — it's fine to lose on restart, and we don't want a
// table just for this.
const bustAttempts = new Map();

// ── Helpers ────────────────────────────────────────────────────────────
function callerLockedOut(ch) {
  const now = Date.now();
  if (ch.jail_until && ch.jail_until > now) return "You're in jail.";
  if (ch.hospital_until && ch.hospital_until > now) return "You're in hospital.";
  if (ch.travel_until && ch.travel_until > now) return "You're travelling.";
  return null;
}

function rowFor(target, now, mode) {
  const base = {
    id: target.id,
    name: target.name,
    avatar: target.avatar,
    level: target.level,
    rank: rankFor(target.reputation).name,
    gang: gangBadgeFor(target.id),
  };
  if (mode === 'jail') {
    return {
      ...base,
      jail_until: target.jail_until,
      jail_reason: target.jail_reason || null,
      bail_cost: bailCostFor(target, now),
    };
  }
  return {
    ...base,
    hospital_until: target.hospital_until,
    hospital_reason: target.hospital_reason || null,
    pay_cost: hospitalCostFor(target, now),
  };
}

// ── List ───────────────────────────────────────────────────────────────
//
// City-scoped: only players physically in the caller's current city.
// You can't bail / bust / pay for someone halfway around the world.
// Excludes the caller. Sorted by time-remaining ascending. Returns both
// jail + hospital lists in one round-trip so a single page can drive two
// sections without a second fetch.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();

  const jailRows = db.prepare(`
    SELECT * FROM characters
    WHERE id != ? AND city = ? AND jail_until IS NOT NULL AND jail_until > ?
    ORDER BY jail_until ASC
    LIMIT 100
  `).all(ch.id, ch.city, now);

  const hospitalRows = db.prepare(`
    SELECT * FROM characters
    WHERE id != ? AND city = ? AND hospital_until IS NOT NULL AND hospital_until > ?
    ORDER BY hospital_until ASC
    LIMIT 100
  `).all(ch.id, ch.city, now);

  res.json({
    city: ch.city,
    jail:     jailRows.map(t => rowFor(t, now, 'jail')),
    hospital: hospitalRows.map(t => rowFor(t, now, 'hospital')),
    bust_chance_pct: Math.round(bustChanceFor(ch) * 100),
  });
});

// ── Bail (jail) ────────────────────────────────────────────────────────
router.post('/:id/bail', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad id' });
  if (targetId === ch.id) return res.status(400).json({ error: "You can't bail yourself — try the Jail page." });
  const lockMsg = callerLockedOut(ch);
  if (lockMsg) return res.status(400).json({ error: lockMsg });

  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Player not found.' });
  if (target.city !== ch.city) return res.status(400).json({ error: 'They are held in another city — fly there to post bail.' });
  const now = Date.now();
  if (!target.jail_until || target.jail_until <= now) {
    return res.status(400).json({ error: 'That player is no longer in jail.' });
  }
  const cost = bailCostFor(target, now);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()}.` });

  ch.cash -= cost;
  target.jail_until = null;
  target.jail_reason = null;

  writeLog(ch.id, 'jail', `Posted bail for ${target.name} — £${cost.toLocaleString()}.`);
  writeLog(target.id, 'jail', `🤝 ${ch.name} posted bail for you — you walk free.`, null, true);

  saveCharacter(ch);
  saveCharacter(target);
  sendEvent(target.id, 'incarceration.released', { by: ch.name, kind: 'bail' });

  res.json({ ok: true, character: publicCharacter(ch), cost });
});

// ── Bust (jail) ────────────────────────────────────────────────────────
router.post('/:id/bust', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad id' });
  if (targetId === ch.id) return res.status(400).json({ error: "You can't bust yourself out." });
  const lockMsg = callerLockedOut(ch);
  if (lockMsg) return res.status(400).json({ error: lockMsg });

  const last = bustAttempts.get(ch.id) || 0;
  const now = Date.now();
  if (now - last < BUST_COOLDOWN_MS) {
    const wait = Math.ceil((BUST_COOLDOWN_MS - (now - last)) / 1000);
    return res.status(429).json({ error: `Lay low for ${wait}s before another bust attempt.` });
  }

  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Player not found.' });
  if (target.city !== ch.city) return res.status(400).json({ error: 'They are held in another city — fly there to bust them.' });
  if (!target.jail_until || target.jail_until <= now) {
    return res.status(400).json({ error: 'That player is no longer in jail.' });
  }

  bustAttempts.set(ch.id, now);
  const chance = bustChanceFor(ch);
  const success = Math.random() < chance;

  if (success) {
    target.jail_until = null;
    target.jail_reason = null;
    writeLog(ch.id, 'jail', `🪓 Busted ${target.name} out of jail.`);
    writeLog(target.id, 'jail', `🪓 ${ch.name} busted you out of jail — get gone.`, null, true);
    saveCharacter(target);
    sendEvent(target.id, 'incarceration.released', { by: ch.name, kind: 'bust' });
    return res.json({ ok: true, success: true, chance, character: publicCharacter(ch) });
  }

  // Caught. Land the rescuer in jail.
  const sentenceS = BUST_FAIL_JAIL_MIN_S + Math.floor(Math.random() * (BUST_FAIL_JAIL_MAX_S - BUST_FAIL_JAIL_MIN_S + 1));
  ch.jail_until = now + sentenceS * 1000;
  ch.jail_reason = `Caught trying to bust ${target.name} out of jail.`;
  writeLog(ch.id, 'jail', `🚓 Caught trying to bust ${target.name} out — jailed for ${sentenceS}s.`, null, true);
  writeLog(target.id, 'jail', `${ch.name} tried to bust you out and got nicked.`, null, true);
  saveCharacter(ch);
  sendEvent(target.id, 'incarceration.bust_failed', { by: ch.name });

  res.json({ ok: true, success: false, chance, character: publicCharacter(ch) });
});

// ── Pay hospital bill ──────────────────────────────────────────────────
router.post('/:id/pay-hospital', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad id' });
  if (targetId === ch.id) return res.status(400).json({ error: "You can't pay your own bill — try the Hospital page." });
  const lockMsg = callerLockedOut(ch);
  if (lockMsg) return res.status(400).json({ error: lockMsg });

  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Player not found.' });
  if (target.city !== ch.city) return res.status(400).json({ error: 'They are admitted in another city — fly there to pay the bill.' });
  const now = Date.now();
  if (!target.hospital_until || target.hospital_until <= now) {
    return res.status(400).json({ error: 'That player is no longer in hospital.' });
  }
  const cost = hospitalCostFor(target, now);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()}.` });

  ch.cash -= cost;
  target.hospital_until = null;
  target.hospital_reason = null;
  target.health = target.max_health;

  writeLog(ch.id, 'hospital', `Paid ${target.name}'s hospital bill — £${cost.toLocaleString()}.`);
  writeLog(target.id, 'hospital', `🤝 ${ch.name} paid your hospital bill — discharged & patched up.`, null, true);

  saveCharacter(ch);
  saveCharacter(target);
  sendEvent(target.id, 'incarceration.released', { by: ch.name, kind: 'hospital' });

  res.json({ ok: true, character: publicCharacter(ch), cost });
});

export default router;
