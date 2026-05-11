import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import {
  WEAPONS, ARMOUR, AMMO,
  weaponById, armourById, ammoById, cityById,
} from '../data.js';
import { saveCharacter, publicCharacter, loadCharacterById, awardXp, isNewCharProtected, newCharProtectionHoursLeft, NEW_CHAR_PROTECTION_DAYS } from '../services/character.js';
import { effectiveStats } from '../services/buffs.js';
import { effectiveEquippedWeapon } from '../services/customize.js';
import { sendEvent } from '../services/events.js';
import { writeLog } from '../services/log.js';
import { bumpMission } from '../services/missions.js';
import { settleBountiesOnKill } from './bounties.js';
import { softDeath } from '../services/death.js';
import { debitTargetCash, hospitaliseTarget } from '../services/pvp-cash.js';

const router = Router();

//  Tunables 
const ATTEMPT_ENERGY_COST = 25;
const ATTACKER_COOLDOWN_MS = 24 * 60 * 60 * 1000;   // 24h between attempts
const TARGET_COOLDOWN_MS   = 24 * 60 * 60 * 1000;   // 24h immunity per target
const MAX_BULLETS_PER_ATTEMPT = 60;

// Cash transfer rates by outcome.
const CASH_PCT_KILL          = 1.00;   // killer takes everything on the body
const CASH_PCT_SEVERE_WOUND  = 0.10;
const CASH_PCT_WOUND         = 0.00;

// No jail time on any outcome. The attacker walks away clean (cooldowns
// + ammo + energy cost are the only friction).
//
// In-memory cooldown tables. Wiped on restart, which is fine — it just
// means a freshly-deployed server gives everyone a clean slate.
const attackerCooldowns = new Map();    // attackerId -> last attempt ms
const targetCooldowns   = new Map();    // targetId   -> last targeted ms

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

//  Hit + damage rolls 
function hitChance(attackerEff, targetEff) {
  const base = 0.35;
  const accFactor = (attackerEff.intelligence + attackerEff.speed) / 200;
  const defFactor = (targetEff.defence + targetEff.speed) / 200;
  return Math.max(0.05, Math.min(0.85, base + 0.4 * accFactor - 0.3 * defFactor));
}

function damageRoll(weapon, target, targetEff) {
  const baseDmg = weapon.dmg || 4;
  const variance = 0.7 + Math.random() * 0.6;   // 0.7-1.3
  const armourDef = (armourById(target.equipped_armour)?.def) || 0;
  const totalDef = (targetEff.defence || 0) + armourDef;
  const reduce = Math.floor(totalDef * 0.5);
  return Math.max(1, Math.floor(baseDmg * variance) - reduce);
}

//  Helpers 
function ammoOnHand(charId, ammoType) {
  if (!ammoType) return 0;
  return db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?")
    .get(charId, ammoType)?.qty || 0;
}

function eligibility(attacker, target, now) {
  if (!target) return 'Target not found.';
  if (attacker.id === target.id) return "You can't murder yourself.";
  if (attacker.city !== target.city) return `Not in your city — you'll have to find them.`;
  if (isNewCharProtected(target, now)) {
    const hrs = newCharProtectionHoursLeft(target, now);
    return `${target.name} is a new character — protected for the first ${NEW_CHAR_PROTECTION_DAYS} days (${hrs}h to go).`;
  }
  if (attacker.energy < ATTEMPT_ENERGY_COST) return `Need ${ATTEMPT_ENERGY_COST} energy.`;
  const myCd = attackerCooldowns.get(attacker.id) || 0;
  if (now - myCd < ATTACKER_COOLDOWN_MS) {
    const wait = Math.ceil((ATTACKER_COOLDOWN_MS - (now - myCd)) / 60000);
    return `You're laying low — try again in ${wait} min.`;
  }
  const tgtCd = targetCooldowns.get(target.id) || 0;
  if (now - tgtCd < TARGET_COOLDOWN_MS) {
    const wait = Math.ceil((TARGET_COOLDOWN_MS - (now - tgtCd)) / 60000);
    return `${target.name} is hyper-vigilant after a recent attempt — try again in ${wait} min.`;
  }
  return null;
}

//  GET /api/murder/info?target_id=X 
router.get('/info', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.query.target_id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad target.' });
  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Target not found.' });

  const weapon = effectiveEquippedWeapon(ch);
  const ammoType = weapon?.ammoType || null;
  const ammo = ammoOnHand(ch.id, ammoType);

  res.json({
    target: {
      id: target.id,
      name: target.name,
      avatar: target.avatar,
      level: target.level,
      // City deliberately omitted — locations are private. Same-city
      // status is implicit in eligibility_error (Not in your city → flight).
    },
    attacker: {
      city: ch.city,
      cityName: cityById(ch.city)?.name,
      energy: ch.energy,
    },
    weapon: weapon ? {
      id: weapon.id, name: weapon.name, maker: weapon.maker || null,
      category: weapon.category, dmg: weapon.dmg, ammoType,
      mods: weapon.mods || [], is_modified: !!weapon.is_modified,
      instance_id: weapon.instance_id || null,
    } : null,
    ammo: { type: ammoType, on_hand: ammo },
    cost: { energy: ATTEMPT_ENERGY_COST, max_bullets: MAX_BULLETS_PER_ATTEMPT },
    eligibility_error: eligibility(ch, target, Date.now()),
  });
});

//  POST /api/murder/attempt 
//
// Body: { target_id, bullets? } — bullets only used for ranged weapons.
// Melee/fists always make a single attack.
router.post('/attempt', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.body?.target_id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad target.' });
  const target = loadCharacterById(targetId);
  const now = Date.now();

  const elErr = eligibility(ch, target, now);
  if (elErr) return res.status(400).json({ error: elErr });

  // Effective weapon resolves modded instance stats if one is equipped.
  const weapon = effectiveEquippedWeapon(ch) || weaponById('fists');
  const ammoType = weapon.ammoType || null;
  let bulletsUsed = 0;
  let strikes = 1;

  if (ammoType) {
    bulletsUsed = Math.max(1, Math.min(MAX_BULLETS_PER_ATTEMPT, parseInt(req.body?.bullets, 10) || 0));
    const ammoRow = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?").get(ch.id, ammoType);
    if (!ammoRow || ammoRow.qty < bulletsUsed) {
      return res.status(400).json({ error: `Need ${bulletsUsed} rounds of ${ammoType}; you have ${ammoRow?.qty || 0}.` });
    }
    strikes = bulletsUsed;
  }

  // Compute roll outcomes with effective stats (incl. buffs).
  const aEff = effectiveStats(ch);
  const tEff = effectiveStats(target);
  const baseHit = hitChance(aEff, tEff);

  const roundLog = [];
  let totalDamage = 0;
  let hits = 0;
  for (let i = 0; i < strikes; i++) {
    const isHit = Math.random() < baseHit;
    if (isHit) {
      const dmg = damageRoll(weapon, target, tEff);
      totalDamage += dmg;
      hits++;
      roundLog.push({ kind: 'hit', dmg });
    } else {
      roundLog.push({ kind: 'miss' });
    }
  }

  // Spend bullets + energy regardless of outcome — you committed to it.
  if (ammoType) {
    const ammoRow = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?").get(ch.id, ammoType);
    if (ammoRow.qty === bulletsUsed) {
      db.prepare("DELETE FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?").run(ch.id, ammoType);
    } else {
      db.prepare("UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = 'ammo' AND item_id = ?").run(bulletsUsed, ch.id, ammoType);
    }
  }
  ch.energy -= ATTEMPT_ENERGY_COST;
  attackerCooldowns.set(ch.id, now);
  targetCooldowns.set(target.id, now);

  // Decide outcome from total damage vs target's max HP. Per-strike
  // damage doesn't compound during the engagement — it's all simultaneous
  // from the target's POV (an ambush, not a duel).
  const damageRatio = totalDamage / (target.max_health || 100);
  let outcome;
  if (totalDamage > 0 && damageRatio >= 1.0) outcome = 'kill';
  else if (damageRatio >= 0.5)               outcome = 'severe_wound';
  else if (damageRatio >= 0.2)               outcome = 'wound';
  else                                        outcome = 'miss';

  //  Apply target effects per outcome 
  let cashTaken = 0;
  let cashPct = 0;
  let succession = null;

  if (outcome === 'kill') {
    // Permadeath branch — same shape as PvP murder mode.
    cashPct = CASH_PCT_KILL;
    // Atomic debit: re-read target.cash inside a transaction so we credit
    // exactly what the target currently has, not the stale snapshot value.
    cashTaken = debitTargetCash(target.id, Math.floor((target.cash || 0) * cashPct));
    if (cashTaken > 0) ch.cash += cashTaken;

    const xp = 80 + (target.level || 1) * 6;
    awardXp(ch, xp);
    ch.reputation += 20 + (target.level || 1) * 2;
    bumpMission(ch, 'combat_win', 1, { enemy: `murder_${target.id}` });

    // Cash in any open bounties on the target.
    const bounty = settleBountiesOnKill(ch.id, target.id);

    writeLog(ch.id, 'pvp',
      bounty.total > 0
        ? ` You murdered ${target.name} — took £${cashTaken.toLocaleString()} + £${bounty.total.toLocaleString()} bounty (${bounty.count} on the wall).`
        : ` You murdered ${target.name} — took £${cashTaken.toLocaleString()}.`,
      { target: target.id, outcome, cashTaken, bounty }, true);
    writeLog(target.id, 'pvp', ` Murdered by ${ch.name} — lost everything, must roll a new character.`, { attacker: ch.id, outcome }, true);

    // Save attacker, then soft-death the target. The killer already
    // pulled their cut of cash above; softDeath wipes the rest.
    saveCharacter(ch);
    const { succession: softSuccession } = softDeath(target, ch.name);
    succession = softSuccession;
    return res.json({
      ok: true,
      outcome, hits, strikes, totalDamage, bulletsUsed,
      cashTaken, succession,
      character: publicCharacter(ch),
      log: roundLog,
    });
  }

  if (outcome === 'severe_wound' || outcome === 'wound') {
    cashPct = outcome === 'severe_wound' ? CASH_PCT_SEVERE_WOUND : CASH_PCT_WOUND;
    // Atomic debit + precise hospital UPDATE; avoids saveCharacter(target)
    // which would blow away any parallel writes the target made.
    cashTaken = debitTargetCash(target.id, Math.floor((target.cash || 0) * cashPct));
    if (cashTaken > 0) ch.cash += cashTaken;
    const hospitalMins = outcome === 'severe_wound' ? rng(60, 180) : rng(15, 45);
    hospitaliseTarget(target.id, now + hospitalMins * 60 * 1000,
      `Found bleeding out — attacker: ${ch.name}.`);

    // XP / rep on a non-fatal hit.
    const xp = outcome === 'severe_wound' ? 30 : 10;
    awardXp(ch, xp);
    ch.reputation += xp / 5;

    writeLog(ch.id, 'pvp',
      ` You ${outcome === 'severe_wound' ? 'critically ' : ''}wounded ${target.name} — took £${cashTaken.toLocaleString()}.`,
      { target: target.id, outcome, cashTaken }, true);
    writeLog(target.id, 'pvp',
      ` You were ${outcome === 'severe_wound' ? 'critically wounded' : 'wounded'} by ${ch.name}. Hospitalised ${hospitalMins}m.`,
      { attacker: ch.id, outcome }, true);

    saveCharacter(ch);
    sendEvent(target.id, 'pvp.attacked', { by: { id: ch.id, name: ch.name }, outcome, hospitalMins });
    return res.json({
      ok: true,
      outcome, hits, strikes, totalDamage, bulletsUsed,
      cashTaken,
      character: publicCharacter(ch),
      log: roundLog,
    });
  }

  // Miss / fail — no jail, just bullets and energy spent.
  writeLog(ch.id, 'pvp', ` Failed murder attempt on ${target.name} — they got away.`, { target: target.id, outcome }, true);
  writeLog(target.id, 'pvp', ` ${ch.name} tried to kill you and missed.`, { attacker: ch.id, outcome }, true);
  saveCharacter(ch);
  sendEvent(target.id, 'pvp.attacked', { by: { id: ch.id, name: ch.name }, outcome: 'miss' });
  return res.json({
    ok: true,
    outcome, hits, strikes, totalDamage, bulletsUsed,
    cashTaken: 0,
    character: publicCharacter(ch),
    log: roundLog,
  });
});

export default router;
