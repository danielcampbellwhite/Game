import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CRIMES, crimeById, cityById, crimeCooldownSec, crimeRequirements, rollVehicleFromTier } from '../data.js';
import { saveCharacter, awardXp, publicCharacter } from '../services/character.js';
import { bumpMission } from '../services/missions.js';
import { holdsTurfPerk, TURF_CRIME_COOLDOWN_MUL } from '../services/gangs.js';
import { writeLog } from '../services/log.js';
import { checkRequirements, consumeRequirements, annotateRequirements } from '../services/items.js';
import { effectiveHeat, addHeat, HEAT_BY_RISK, HEAT_SUCCESS_PENALTY, HEAT_JAIL_MULTIPLIER } from '../services/heat.js';

const router = Router();

// "Punisher" tier — jail-on-fail dominates at high tiers. Escape-clean is
// nearly impossible for major scores, and sentences scale aggressively so
// jailbreaks (lawyer / bribe) become meaningful late game.
const RISK_TABLE = {
  tiny:    { jail: 0.15, hosp: 0.05, jailMin: 3,   hospMin: 2  },
  low:     { jail: 0.25, hosp: 0.12, jailMin: 8,   hospMin: 5  },
  med:     { jail: 0.40, hosp: 0.22, jailMin: 18,  hospMin: 12 },
  high:    { jail: 0.55, hosp: 0.30, jailMin: 45,  hospMin: 25 },
  extreme: { jail: 0.70, hosp: 0.25, jailMin: 120, hospMin: 50 },
};

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function cooldownKey(crimeId) { return `crime_${crimeId}`; }

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const rows = db.prepare("SELECT item_id, used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id LIKE 'crime_%'").all(ch.id);
  const cdMap = Object.fromEntries(rows.map(r => [r.item_id.replace(/^crime_/, ''), r.used_at]));
  // Turf perk: gangs holding the city give their members -20% crime cooldown
  // while operating in that city. Multiplier applies to the published cooldown.
  const turfPerk = holdsTurfPerk(ch.id, ch.city);
  res.json({
    turf_perk_active: turfPerk,
    crimes: CRIMES.map(c => {
      const baseCd = crimeCooldownSec(c);
      const cooldownSec = turfPerk ? Math.max(15, Math.floor(baseCd * TURF_CRIME_COOLDOWN_MUL)) : baseCd;
      const used = cdMap[c.id] || 0;
      const cooldownUntil = used + cooldownSec * 1000;
      // Requirements: annotate with current ownership counts so the client
      // can render "you have X / Y" chips and dim the Attempt button
      // without a second roundtrip.
      const requires = annotateRequirements(ch.id, crimeRequirements(c));
      const requirementsMet = requires.every(r => r.ok);
      return {
        ...c,
        locked: ch.level < c.level,
        city: cityById(ch.city)?.name,
        cooldownSec,
        cooldownUntil,
        ready: Date.now() >= cooldownUntil,
        requires,
        requirementsMet,
      };
    }),
  });
});

router.post('/commit', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const crime = crimeById(req.body?.crime_id);
  if (!crime) return res.status(400).json({ error: 'Unknown crime' });
  if (ch.level < crime.level) return res.status(403).json({ error: `Requires level ${crime.level}` });
  if (ch.energy < crime.energy) return res.status(400).json({ error: 'Not enough energy' });

  // Cooldown check (turf perk same as in GET above)
  const baseCd = crimeCooldownSec(crime);
  const cdSec = holdsTurfPerk(ch.id, ch.city)
    ? Math.max(15, Math.floor(baseCd * TURF_CRIME_COOLDOWN_MUL))
    : baseCd;
  const now = Date.now();
  const cd = db.prepare('SELECT used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id = ?').get(ch.id, cooldownKey(crime.id));
  if (cd) {
    const readyAt = cd.used_at + cdSec * 1000;
    if (now < readyAt) return res.status(429).json({ error: 'Crime is on cooldown', cooldownUntil: readyAt });
  }

  // Item requirements (e.g. ATM Skim needs an ATM Skimmer in inventory).
  // Checked before any state mutation; consumed after commit-point so the
  // tool is destroyed even if the crime fails.
  const requires = crimeRequirements(crime);
  const reqCheck = checkRequirements(ch.id, requires);
  if (!reqCheck.ok) {
    const m = reqCheck.missing[0];
    return res.status(400).json({
      error: `Missing required item: ${m.name} (have ${m.have}, need ${m.need})`,
      missing: reqCheck.missing,
    });
  }

  ch.energy -= crime.energy;
  // Consume crime tools — destroyed regardless of success/failure.
  const consumed = consumeRequirements(ch.id, requires);

  // Snapshot heat before this commit. Higher heat shaves the success
  // base and inflates jail risk on failure (see RISK_TABLE pull below).
  const heatNow = effectiveHeat(ch);
  const heatPenalty = heatNow * HEAT_SUCCESS_PENALTY;

  const intelBonus = (crime.intelBonus || 0) * (ch.intelligence * 0.3);
  const success = Math.max(5, Math.min(95, crime.base + ch.intelligence * 0.3 + ch.level * 0.4 + intelBonus - heatPenalty));
  const roll = Math.random() * 100;

  let result;
  if (roll < success) {
    const happyMul = 1 + (ch.happiness - 50) / 200;
    const xpGain = Math.floor(crime.xp * happyMul);
    const lvls = awardXp(ch, xpGain);
    ch.reputation += Math.floor(crime.xp / 4);
    ch.happiness = Math.min(100, ch.happiness + 1);
    bumpMission(ch, 'crime_success', 1, { tier: crime.tier, crime: crime.id });

    if (crime.tier === 'gta' && crime.vehicleTier) {
      // Reward = a random car from the matched tier in the player's garage.
      const v = rollVehicleFromTier(crime.vehicleTier);
      if (v) {
        db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at) VALUES (?, ?, ?, ?, ?)')
          .run(ch.id, v.id, 'stolen', ch.city, Date.now());
      }
      writeLog(ch.id, 'crime', `Pulled off "${crime.name}" — drove off in a ${v ? v.maker + ' ' + v.name : 'vehicle'} (+${xpGain}xp).`, { crime: crime.id, vehicle: v?.id, xp: xpGain });
      result = { ok: true, success: true, vehicle: v, xp: xpGain, levels: lvls };
    } else {
      const cityMul = cityById(ch.city)?.businessMul || 1.0;
      const payout = Math.floor(rng(crime.min, crime.max) * cityMul * happyMul);
      if (crime.dirty) ch.dirty_cash += payout;
      else ch.cash += payout;
      writeLog(ch.id, 'crime', `Pulled off "${crime.name}" — +£${payout}${crime.dirty ? ' (dirty)' : ''} +${xpGain}xp.`, { crime: crime.id, payout, xp: xpGain });
      result = { ok: true, success: true, payout, dirty: !!crime.dirty, xp: xpGain, levels: lvls };
    }
  } else {
    // failure: jail/hospital based on risk. Heat amplifies jail
    // probability — clamped so it can't push past `risk.jail + risk.hosp`
    // (otherwise an "escape clean" outcome could disappear entirely).
    const risk = RISK_TABLE[crime.risk] || RISK_TABLE.low;
    const jailFloor = risk.jail;
    const jailCeil  = Math.min(risk.jail + risk.hosp, jailFloor * (1 + heatNow * HEAT_JAIL_MULTIPLIER));
    const adjustedJail = Math.max(jailFloor, jailCeil);
    const consequence = Math.random();
    if (consequence < adjustedJail) {
      const mins = Math.floor(risk.jailMin * (1 + Math.random() * 0.6));
      ch.jail_until = Date.now() + mins * 60 * 1000;
      ch.jail_reason = `Caught red-handed attempting "${crime.name}" — sentenced to ${mins} minutes.`;
      writeLog(ch.id, 'crime', `Caught attempting "${crime.name}". Jailed for ${mins} min.`, { crime: crime.id, jail_min: mins }, true);
      result = { ok: true, success: false, jailed: true, jail_min: mins };
    } else if (consequence < adjustedJail + risk.hosp) {
      const mins = Math.floor(risk.hospMin * (1 + Math.random() * 0.7));
      ch.hospital_until = Date.now() + mins * 60 * 1000;
      ch.health = Math.max(1, Math.floor(ch.health * 0.3));
      ch.hospital_reason = `Botched "${crime.name}" and got your ass handed to you — admitted for ${mins} minutes.`;
      writeLog(ch.id, 'crime', `Botched "${crime.name}" and got hurt. Hospital ${mins} min.`, { crime: crime.id, hosp_min: mins }, true);
      result = { ok: true, success: false, hospital: true, hosp_min: mins };
    } else {
      ch.happiness = Math.max(0, ch.happiness - 2);
      writeLog(ch.id, 'crime', `Failed "${crime.name}" — got away clean but empty-handed.`);
      result = { ok: true, success: false, escaped: true };
    }
  }

  // Record cooldown — applies whether you succeeded or got nicked.
  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(ch.id, cooldownKey(crime.id), now);
  const cooldownUntil = now + cdSec * 1000;

  // Bump heat after the outcome is decided. The amount is risk-tier
  // based; heat increment is the same whether you succeeded or failed
  // (the cops know what you tried).
  const heatBefore = heatNow;
  const heatAfter  = addHeat(ch, HEAT_BY_RISK[crime.risk] || 5);

  saveCharacter(ch);
  res.json({
    ...result,
    consumed,
    cooldownUntil,
    heat: { before: Math.round(heatBefore), after: Math.round(heatAfter) },
    character: publicCharacter(ch),
  });
});

export default router;
