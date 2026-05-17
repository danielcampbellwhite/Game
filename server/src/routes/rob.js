import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { cityById, weaponById, miscItemById, armourById } from '../data.js';
import { saveCharacter, publicCharacter, loadCharacterById, awardXp, isNewCharProtected, newCharProtectionHoursLeft, NEW_CHAR_PROTECTION_DAYS, applyJailSentence } from '../services/character.js';
import { effectiveStats } from '../services/buffs.js';
import { sendEvent } from '../services/events.js';
import { writeLog } from '../services/log.js';
import { bumpMission } from '../services/missions.js';
import { debitTargetCash, hospitaliseTarget } from '../services/pvp-cash.js';

const router = Router();

//  Tunables 
const ENERGY_COST = 10;
const ATTACKER_COOLDOWN_MS = 5 * 60 * 1000;         // 5m between robberies (per attacker)
const TARGET_COOLDOWN_MS   = 30 * 60 * 1000;       // 30m immunity (per target)

// Hospital time on win (target).
const HOSPITAL_MIN = [10, 30];
// Cash steal range — random share of target's cash on hand.
const CASH_PCT_MIN = 0.50;
const CASH_PCT_MAX = 1.00;
// Probability the victim sees who robbed them. The attacker is never
// told the outcome — they don't know if they got away clean.
const REVEAL_PCT = 0.50;
// Chance, on a successful mug, of also lifting a single item off the
// victim. Anything on their person is up for grabs — but they don't
// always have time to rifle through pockets, so this is a coin-flip-ish
// roll rather than guaranteed.
const ITEM_GRAB_CHANCE = 0.30;
// If the victim has a usable weapon (melee, or a ranged with ammo),
// they get a chance to wound the attacker on a fight-off. Roll inside
// the lose branch and, on a hit, hospitalise the attacker for a few
// minutes — they took a beating.
const FIGHT_BACK_HOSPITAL_MIN = 5;
const FIGHT_BACK_HOSPITAL_MAX = 18;
const FIGHT_BACK_HIT_CHANCE   = 0.6;

// In-memory cooldown tables. Wiped on restart.
const attackerCooldowns = new Map();
const targetCooldowns   = new Map();

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// "Does this target have something they could swing back with?" —
// equipped melee weapon, or an equipped ranged weapon with at least
// one round of matching ammo in their bag. Mirrors what they could
// realistically pull during a mugging attempt.
function targetHasUsableWeapon(target) {
  const equipped = target.equipped_weapon || 'fists';
  if (!equipped || equipped === 'fists') return false;
  const w = weaponById(equipped);
  if (!w) return false;
  if (w.category === 'melee') return true;
  if (!w.ammoType) return false;
  const ammoRow = db.prepare(
    "SELECT qty FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?"
  ).get(target.id, w.ammoType);
  return !!(ammoRow && ammoRow.qty > 0);
}

// Picks one liftable item off the victim's person — single qty,
// random row from their inventory (weapons / armour / misc). Ammo
// is excluded; a bag of bullets isn't a satisfying steal. Returns
// { kind, item_id, name } or null when there's nothing to grab.
function pickStealableItem(targetId) {
  const row = db.prepare(`
    SELECT kind, item_id, qty FROM inventory
    WHERE char_id = ? AND kind IN ('weapon', 'armour', 'misc') AND qty > 0
    ORDER BY RANDOM()
    LIMIT 1
  `).get(targetId);
  if (!row) return null;
  const def = row.kind === 'weapon' ? weaponById(row.item_id)
            : row.kind === 'armour' ? armourById(row.item_id)
            : miscItemById(row.item_id);
  return { kind: row.kind, item_id: row.item_id, name: def?.name || row.item_id };
}

// Move one unit of (kind, item_id) from victim to attacker — atomic
// decrement on the victim side, ON-CONFLICT upsert on the attacker.
function transferOneItem(attackerId, targetId, kind, itemId) {
  // Decrement target's row, deleting it when it hits zero.
  db.prepare(`
    UPDATE inventory SET qty = qty - 1
    WHERE char_id = ? AND kind = ? AND item_id = ? AND qty > 0
  `).run(targetId, kind, itemId);
  db.prepare(`
    DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ? AND qty <= 0
  `).run(targetId, kind, itemId);
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, ?, ?, 1)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + 1
  `).run(attackerId, kind, itemId);
}

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
  if (attacker.city !== target.city) return `Not in your city — you'll have to find them.`;
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

//  GET /api/rob/info?target_id=X 
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
      level: target.level,
      // City deliberately omitted — locations are private.
    },
    attacker: { city: ch.city, energy: ch.energy },
    cost: { energy: ENERGY_COST },
    win_chance: winChance(aEff, tEff),
    eligibility_error: eligibility(ch, target, Date.now()),
  });
});

//  POST /api/rob/attempt 
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
    // Atomic debit so the credit matches whatever the target currently has,
    // not the snapshot. Stops a parallel target deposit being clobbered.
    const robPct = CASH_PCT_MIN + Math.random() * (CASH_PCT_MAX - CASH_PCT_MIN);
    const cashTaken = debitTargetCash(target.id, Math.floor((target.cash || 0) * robPct));
    ch.cash += cashTaken;

    // Item grab — chance to also lift one thing off the victim. Decided
    // here so the response can describe it; transfer is atomic.
    let stolenItem = null;
    if (Math.random() < ITEM_GRAB_CHANCE) {
      const pick = pickStealableItem(target.id);
      if (pick) {
        transferOneItem(ch.id, target.id, pick.kind, pick.item_id);
        stolenItem = pick;
      }
    }

    // Reveal coin-flip. Result is stored only in the victim's log /
    // notification — attacker is never told either way.
    const hospitalMins = rng(HOSPITAL_MIN[0], HOSPITAL_MIN[1]);
    const revealed = Math.random() < REVEAL_PCT;
    const robberLabel = revealed ? ch.name : 'an unknown assailant';
    hospitaliseTarget(target.id, now + hospitalMins * 60 * 1000,
      `Mugged in the alley by ${robberLabel}.`);

    const xp = 25 + Math.floor(target.level / 2);
    awardXp(ch, xp);
    ch.reputation += xp / 5;
    bumpMission(ch, 'rob_player', 1);

    // Attacker log: never mentions reveal status, never mentions jail.
    const itemLogSuffix = stolenItem ? ` and lifted their ${stolenItem.name}` : '';
    const victimItemSuffix = stolenItem ? ` and your ${stolenItem.name}` : '';
    writeLog(ch.id, 'pvp',
      ` You robbed ${target.name} for £${cashTaken.toLocaleString()}${itemLogSuffix}.`,
      { target: target.id, cashTaken, item: stolenItem }, true);
    writeLog(target.id, 'pvp',
      ` You were robbed by ${robberLabel} — lost £${cashTaken.toLocaleString()}${victimItemSuffix}, hospitalised ${hospitalMins}m.`,
      { attacker_id: revealed ? ch.id : null, cashTaken, revealed, item: stolenItem }, true);

    saveCharacter(ch);
    sendEvent(target.id, 'pvp.attacked', {
      by: revealed ? { id: ch.id, name: ch.name } : null,
      outcome: 'robbed', cashTaken, hospitalMins, item: stolenItem,
    });
    // Attacker response: deliberately omits the `revealed` flag.
    return res.json({
      ok: true, win: true,
      cashTaken, hospitalMins, stolenItem,
      character: publicCharacter(ch),
    });
  }

  // Lose: target gets alerted (with same reveal coin-flip). 50%
  // of the time the player also gets pinched on the spot — sirens,
  // 15m inside. The other half they slip away clean (just no
  // payout). Reflects the "Lose → caught" blurb on the Crimes
  // page which previously was empty marketing.
  const revealed = Math.random() < REVEAL_PCT;
  const robberLabel = revealed ? ch.name : 'an unknown assailant';
  const caught = Math.random() < 0.5;
  const jailMin = 15;

  // Weapon fight-back. If the victim had something to swing back
  // with — a melee piece, or a ranged weapon they had ammo for — they
  // get a chance to wound the attacker on the way out. A connecting
  // blow puts the mugger in hospital, on top of whatever the cops
  // already had planned for them.
  let wounded = false;
  let woundedMins = 0;
  let woundedWeapon = null;
  if (targetHasUsableWeapon(target) && Math.random() < FIGHT_BACK_HIT_CHANCE) {
    wounded = true;
    woundedMins = rng(FIGHT_BACK_HOSPITAL_MIN, FIGHT_BACK_HOSPITAL_MAX);
    woundedWeapon = weaponById(target.equipped_weapon)?.name || 'their weapon';
    hospitaliseTarget(ch.id, now + woundedMins * 60 * 1000,
      `Fought back during a mugging — caught a hit from ${target.name}'s ${woundedWeapon}.`);
  }

  if (caught) {
    applyJailSentence(ch, jailMin * 60 * 1000, `Caught trying to rob ${target.name} — ${jailMin}m inside.`);
    writeLog(ch.id, 'pvp', ` ${target.name} fought you off and the cops bagged you — ${jailMin}m inside.`,
      { target: target.id, jail_min: jailMin }, true);
  } else {
    const woundSuffix = wounded ? ` — and caught a ${woundedWeapon} for ${woundedMins}m in hospital` : '';
    writeLog(ch.id, 'pvp', ` ${target.name} fought you off${woundSuffix}.`,
      { target: target.id, wounded, woundedMins }, true);
  }
  const woundedNote = wounded ? ' You drew a hit on them — they are nursing it in hospital.' : '';
  writeLog(target.id, 'pvp',
    caught
      ? ` You fought off a robbery attempt by ${robberLabel} — the cops bagged them.${woundedNote}`
      : ` You fought off a robbery attempt by ${robberLabel}.${woundedNote}`,
    { attacker_id: revealed ? ch.id : null, revealed, attacker_jailed: caught, attacker_wounded: wounded, wound_minutes: woundedMins }, true);

  saveCharacter(ch);
  sendEvent(target.id, 'pvp.attacked', {
    by: revealed ? { id: ch.id, name: ch.name } : null,
    outcome: 'rob_failed',
    attacker_wounded: wounded,
  });
  res.json({
    ok: true, win: false,
    jailed: caught,
    jail_min: caught ? jailMin : 0,
    wounded,
    wounded_min: woundedMins,
    character: publicCharacter(ch),
  });
});

export default router;
