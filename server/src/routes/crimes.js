import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CRIMES, crimeById, cityById, crimeCooldownSec, crimeRequirements, rollVehicleFromTier } from '../data.js';
import { saveCharacter, awardXp, publicCharacter, applyJailSentence } from '../services/character.js';
import { bumpMission } from '../services/missions.js';
import { holdsTurfPerk, TURF_CRIME_COOLDOWN_MUL } from '../services/gangs.js';
import { writeLog } from '../services/log.js';
import { checkRequirements, consumeRequirements, annotateRequirements } from '../services/items.js';
import { effectiveHeat, addHeat, HEAT_BY_RISK, HEAT_SUCCESS_PENALTY, HEAT_JAIL_MULTIPLIER } from '../services/heat.js';
import { factionBonusMul, factionGlobalCrimeMul } from '../services/territories.js';

const router = Router();

// Most failures should be "got away clean, just lost the take" — heat
// carries the long-term cost. Jail and hospital are the rare, expensive
// outcomes for unlucky rolls or already-hot players.
//
// (jail + hosp + escape) sums to <= 1; whatever is left is escape-clean.
const RISK_TABLE = {
  tiny:    { jail: 0.05, hosp: 0.02, jailMin: 3,   hospMin: 2  },
  low:     { jail: 0.10, hosp: 0.05, jailMin: 8,   hospMin: 5  },
  med:     { jail: 0.18, hosp: 0.10, jailMin: 18,  hospMin: 12 },
  high:    { jail: 0.30, hosp: 0.15, jailMin: 45,  hospMin: 25 },
  extreme: { jail: 0.45, hosp: 0.20, jailMin: 120, hospMin: 50 },
};

// Narrative failure messages, picked at random per attempt. Templates
// support {name} and {mins} interpolation. Tier-keyed so a phishing
// flop reads differently from a botched mugging.
const FAIL_MESSAGES = {
  street: {
    escape: [
      'Tried "{name}" — they fought you off. You fled empty-handed.',
      'Tried "{name}" — the mark was too alert. Slipped away with nothing.',
      'Tried "{name}" — bystanders started filming. Bailed before it got worse.',
      'Tried "{name}" — your nerve cracked at the wrong moment. Walked away clean.',
      'Tried "{name}" — cops rolled past at the worst time. Backed off.',
    ],
    hospital: [
      'Tried "{name}" — got the worst of the scrap. Hospital {mins} min.',
      'Tried "{name}" — the target had a friend with a bat. Hospital {mins} min.',
      'Tried "{name}" — slipped on the getaway and went down hard. Hospital {mins} min.',
    ],
    jail: [
      'Caught at "{name}" — undercover was watching. Jailed {mins} min.',
      'Caught at "{name}" — CCTV had your face cold. Jailed {mins} min.',
      'Caught at "{name}" — got chased down two blocks before backup arrived. Jailed {mins} min.',
    ],
  },
  cyber: {
    escape: [
      'Tried "{name}" — payload bounced. Wiped your logs and bailed.',
      'Tried "{name}" — IDS caught the probe. Killed the connection.',
      'Tried "{name}" — target rotated keys mid-run. Lost the take.',
      'Tried "{name}" — the rabbit hole led nowhere. Backed out clean.',
    ],
    hospital: [
      'Tried "{name}" — pulled an all-nighter and collapsed. Hospital {mins} min.',
      'Tried "{name}" — a stress migraine put you out cold. Hospital {mins} min.',
    ],
    jail: [
      'Caught at "{name}" — feds traced your VPN. Jailed {mins} min.',
      'Caught at "{name}" — an accomplice flipped. Jailed {mins} min.',
      'Caught at "{name}" — laptop got pinged at the door. Jailed {mins} min.',
    ],
  },
  gta: {
    escape: [
      'Tried "{name}" — couldn\'t hotwire it in time. Walked away.',
      'Tried "{name}" — alarm went off. Bailed before the owner arrived.',
      'Tried "{name}" — driver came back early. Slipped off into the crowd.',
    ],
    hospital: [
      'Tried "{name}" — crashed on the getaway. Hospital {mins} min.',
      'Tried "{name}" — owner caught you mid-job and laid into you. Hospital {mins} min.',
    ],
    jail: [
      'Caught at "{name}" — built-in GPS called the cops. Jailed {mins} min.',
      'Caught at "{name}" — pulled over at a checkpoint. Jailed {mins} min.',
    ],
  },
  major: {
    escape: [
      'Tried "{name}" — the take fell apart at the last moment. Bailed clean.',
      'Tried "{name}" — security tightened mid-job. Pulled out empty.',
      'Tried "{name}" — your inside man backed out. Walked away.',
    ],
    hospital: [
      'Tried "{name}" — gunfight on the way out. Hospital {mins} min.',
      'Tried "{name}" — getaway crashed at speed. Hospital {mins} min.',
    ],
    jail: [
      'Caught at "{name}" — feds were waiting at the door. Jailed {mins} min.',
      'Caught at "{name}" — an informant set you up. Jailed {mins} min.',
    ],
  },
};

function failMessage(tier, outcome, name, mins) {
  const pool = (FAIL_MESSAGES[tier] || FAIL_MESSAGES.street)[outcome] || [];
  if (!pool.length) return `Failed "${name}".`;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  return tpl.replace('{name}', name).replace('{mins}', mins ?? '');
}

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
  // GTA: can't lift a car when you've already got one warming the seat.
  // Drop your active ride first (sell or store).
  if (crime.tier === 'gta' && ch.active_vehicle_id) {
    return res.status(400).json({ error: 'Can\'t boost a car while you\'re already driving one — sell or store your current ride first.' });
  }

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
    // Tally a faction crime — drives the "faction reputation" share
    // surfaced on /api/factions/reputation. Skipped for unaligned chars.
    if (ch.faction) {
      db.prepare(`
        INSERT INTO faction_stats (faction_id, crimes_committed) VALUES (?, 1)
        ON CONFLICT(faction_id) DO UPDATE SET crimes_committed = crimes_committed + 1
      `).run(ch.faction);
    }

    if (crime.tier === 'gta' && crime.vehicleTier) {
      // Stolen car becomes the player's active ride. Earlier guard
      // already ensured they had no active vehicle before the heist.
      // Stolen cars roll 75-100% condition — they've been driven by
      // somebody before you, after all.
      const v = rollVehicleFromTier(crime.vehicleTier);
      let stolenCondition = 100;
      if (v) {
        stolenCondition = Math.round(75 + Math.random() * 25);
        const info = db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, condition) VALUES (?, ?, ?, ?, ?, ?)')
          .run(ch.id, v.id, 'stolen', ch.city, Date.now(), stolenCondition);
        ch.active_vehicle_id = info.lastInsertRowid;
      }
      writeLog(ch.id, 'crime', `Pulled off "${crime.name}" — drove off in a ${v ? v.maker + ' ' + v.name : 'vehicle'} (${stolenCondition}% cond, +${xpGain}xp).`, { crime: crime.id, vehicle: v?.id, xp: xpGain, condition: stolenCondition });
      result = { ok: true, success: true, vehicle: v, condition: stolenCondition, xp: xpGain, levels: lvls };
    } else {
      const cityMul = cityById(ch.city)?.businessMul || 1.0;
      // Territory-control bonuses:
      // - Local: per-city, sum of crime_cash pcts the player's faction
      //   holds in this city (1.0 = no holdings, up to ~1.05 today).
      // - Global: faction-wide, scales with unique cities held (up to
      //   ~1.07 with all 14 cities).
      const localTerrMul  = factionBonusMul(ch.faction, ch.city, 'crime_cash');
      const globalTerrMul = factionGlobalCrimeMul(ch.faction);
      const territoryBonus = localTerrMul * globalTerrMul;
      const payout = Math.floor(rng(crime.min, crime.max) * cityMul * happyMul * territoryBonus);
      if (crime.dirty) ch.dirty_cash += payout;
      else ch.cash += payout;
      writeLog(ch.id, 'crime', `Pulled off "${crime.name}" — +£${payout}${crime.dirty ? ' (dirty)' : ''} +${xpGain}xp${territoryBonus > 1 ? ` (turf +${Math.round((territoryBonus - 1) * 100)}%)` : ''}.`, { crime: crime.id, payout, xp: xpGain, territoryBonus });
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
      const msg = failMessage(crime.tier, 'jail', crime.name, mins);
      applyJailSentence(ch, mins * 60 * 1000, msg);
      writeLog(ch.id, 'crime', msg, { crime: crime.id, jail_min: mins }, true);
      result = { ok: true, success: false, jailed: true, jail_min: mins };
    } else if (consequence < adjustedJail + risk.hosp) {
      const mins = Math.floor(risk.hospMin * (1 + Math.random() * 0.7));
      ch.hospital_until = Date.now() + mins * 60 * 1000;
      ch.health = Math.max(1, Math.floor(ch.health * 0.3));
      const msg = failMessage(crime.tier, 'hospital', crime.name, mins);
      ch.hospital_reason = msg;
      writeLog(ch.id, 'crime', msg, { crime: crime.id, hosp_min: mins }, true);
      result = { ok: true, success: false, hospital: true, hosp_min: mins };
    } else {
      ch.happiness = Math.max(0, ch.happiness - 2);
      const msg = failMessage(crime.tier, 'escape', crime.name);
      writeLog(ch.id, 'crime', msg);
      result = { ok: true, success: false, escaped: true };
    }
  }

  // Record cooldown — applies whether you succeeded or got nicked.
  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(ch.id, cooldownKey(crime.id), now);
  const cooldownUntil = now + cdSec * 1000;

  // Heat applies to every outcome — success, escape, hospital, AND
  // jail. Each crime adds to the trail; jail bumps it harder because
  // the cops now have your face on file (and you're sketchy on
  // release).
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
