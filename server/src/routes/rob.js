import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { cityById } from '../data.js';
import { saveCharacter, publicCharacter, loadCharacterById, awardXp, isNewCharProtected, newCharProtectionHoursLeft, NEW_CHAR_PROTECTION_DAYS } from '../services/character.js';
import { effectiveStats } from '../services/buffs.js';
import { sendEvent } from '../services/events.js';
import { writeLog } from '../services/log.js';
import { bumpMission } from '../services/missions.js';

const router = Router();

// ── Tunables ────────────────────────────────────────────────────────
const ENERGY_COST = 10;
const ATTACKER_COOLDOWN_MS = 60 * 60 * 1000;       // 1h between robberies (per attacker)
const TARGET_COOLDOWN_MS   = 30 * 60 * 1000;       // 30m immunity (per target)

// Hospital time on win (target).
const HOSPITAL_MIN = [10, 30];
// Cash steal range — random share of target's cash on hand.
const CASH_PCT_MIN = 0.50;
const CASH_PCT_MAX = 1.00;
// Probability the victim sees who robbed them. The attacker is never
// told the outcome — they don't know if they got away clean.
const REVEAL_PCT = 0.50;

// In-memory cooldown tables. Wiped on restart.
const attackerCooldowns = new Map();
const targetCooldowns   = new Map();

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Win chance: each 10-stat advantage shifts by 10 percentage points
// from the 50% baseline, clamped to [10%, 90%]. Stats include any
// active buffs.
function winChance(aEff, tEff) {
  const aScore = aEff.strength + aEff.speed;
  const tScore = tEff.defence + tEff.speed;
  const diff = aScore - tScore;
  return Math.max(0.1, Math.min(0.9, 0.5 + diff / 100));
}

function eligibility(attacker, target, now) {
  if (!target) return 'Target not found.';
  if (attacker.id === target.id) return "You can't rob yourself.";
  if (attacker.city !== target.city) return `You must be in ${cityById(target.city)?.name} to attempt this.`;
  if (isNewCharProtected(target, now)) {
    const hrs = newCharProtectionHoursLeft(target, now);
    return `${target.name} is a new character — protected for the first ${NEW_CHAR_PROTECTION_DAYS} days (${hrs}h to go).`;
  }
  if (attacker.energy < ENERGY_COST) return `Need ${ENERGY_COST} energy.`;
  const myCd = attackerCooldowns.get(attacker.id) || 0;
  if (now - myCd < ATTACKER_COOLDOWN_MS) {
    const wait = Math.ceil((ATTACKER_COOLDOWN_MS - (now - myCd)) / 60000);
    return `You're keeping a low profile — try again in ${wait} min.`;
  }
  const tgtCd = targetCooldowns.get(target.id) || 0;
  if (now - tgtCd < TARGET_COOLDOWN_MS) {
    const wait = Math.ceil((TARGET_COOLDOWN_MS - (now - tgtCd)) / 60000);
    return `${target.name} just got mugged — try again in ${wait} min.`;
  }
  return null;
}

// ── GET /api/rob/info?target_id=X ───────────────────────────────────
router.get('/info', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.query.target_id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad target.' });
  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Target not found.' });

  const aEff = effectiveStats(ch);
  const tEff = effectiveStats(target);

  res.json({
    target: {
      id: target.id, name: target.name, avatar: target.avatar,
      level: target.level, city: target.city, cityName: cityById(target.city)?.name,
    },
    attacker: { city: ch.city, energy: ch.energy },
    cost: { energy: ENERGY_COST },
    win_chance: winChance(aEff, tEff),
    eligibility_error: eligibility(ch, target, Date.now()),
  });
});

// ── POST /api/rob/attempt ──────────────────────────────────────────
router.post('/attempt', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.body?.target_id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad target.' });
  const target = loadCharacterById(targetId);
  const now = Date.now();

  const elErr = eligibility(ch, target, now);
  if (elErr) return res.status(400).json({ error: elErr });

  const aEff = effectiveStats(ch);
  const tEff = effectiveStats(target);
  const win = Math.random() < winChance(aEff, tEff);

  ch.energy -= ENERGY_COST;
  attackerCooldowns.set(ch.id, now);
  targetCooldowns.set(target.id, now);

  if (win) {
    // Random share of cash on hand — keeps marginal robberies thrilling.
    const robPct = CASH_PCT_MIN + Math.random() * (CASH_PCT_MAX - CASH_PCT_MIN);
    const cashTaken = Math.floor((target.cash || 0) * robPct);
    target.cash = (target.cash || 0) - cashTaken;
    ch.cash += cashTaken;

    const hospitalMins = rng(HOSPITAL_MIN[0], HOSPITAL_MIN[1]);
    target.health = 1;
    target.hospital_until = now + hospitalMins * 60 * 1000;

    // Reveal coin-flip. Result is stored only in the victim's log /
    // notification — attacker is never told either way.
    const revealed = Math.random() < REVEAL_PCT;
    const robberLabel = revealed ? ch.name : 'an unknown assailant';
    target.hospital_reason = `Mugged in the alley by ${robberLabel}.`;

    const xp = 25 + Math.floor(target.level / 2);
    awardXp(ch, xp);
    ch.reputation += xp / 5;
    bumpMission(ch, 'rob_player', 1);

    // Attacker log: never mentions reveal status, never mentions jail.
    writeLog(ch.id, 'pvp', `🤜 You robbed ${target.name} for £${cashTaken.toLocaleString()}.`,
      { target: target.id, cashTaken }, true);
    writeLog(target.id, 'pvp',
      `🤜 You were robbed by ${robberLabel} — lost £${cashTaken.toLocaleString()}, hospitalised ${hospitalMins}m.`,
      { attacker_id: revealed ? ch.id : null, cashTaken, revealed }, true);

    saveCharacter(ch);
    saveCharacter(target);
    sendEvent(target.id, 'pvp.attacked', {
      by: revealed ? { id: ch.id, name: ch.name } : null,
      outcome: 'robbed', cashTaken, hospitalMins,
    });
    // Attacker response: deliberately omits the `revealed` flag.
    return res.json({
      ok: true, win: true,
      cashTaken, hospitalMins,
      character: publicCharacter(ch),
    });
  }

  // Lose: target gets alerted (with same reveal coin-flip), no jail.
  const revealed = Math.random() < REVEAL_PCT;
  const robberLabel = revealed ? ch.name : 'an unknown assailant';

  writeLog(ch.id, 'pvp', `❌ ${target.name} fought you off — got away with nothing.`,
    { target: target.id }, true);
  writeLog(target.id, 'pvp',
    `🛡 You fought off a robbery attempt by ${robberLabel}.`,
    { attacker_id: revealed ? ch.id : null, revealed }, true);

  saveCharacter(ch);
  sendEvent(target.id, 'pvp.attacked', {
    by: revealed ? { id: ch.id, name: ch.name } : null,
    outcome: 'rob_failed',
  });
  res.json({
    ok: true, win: false,
    character: publicCharacter(ch),
  });
});

export default router;
