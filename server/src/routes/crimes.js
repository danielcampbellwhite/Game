import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CRIMES, crimeById, cityById, crimeCooldownSec, crimeRequirements, rollVehicleFromTier, specPerk, VEHICLE_TIER_DRIVING_GATE } from '../data.js';
import { saveCharacter, awardXp, publicCharacter, applyJailSentence } from '../services/character.js';
import { bumpMission } from '../services/missions.js';
import { holdsTurfPerk, TURF_CRIME_COOLDOWN_MUL, applyGangCrimeCut } from '../services/gangs.js';
import { writeLog } from '../services/log.js';
import { checkRequirements, consumeRequirements, annotateRequirements } from '../services/items.js';
import { effectiveHeat, addHeat, HEAT_BY_RISK, HEAT_SUCCESS_PENALTY, HEAT_JAIL_MULTIPLIER } from '../services/heat.js';
import { freeGarageSpace } from '../services/garage.js';
import { sendEvent } from '../services/events.js';
import { crimeHourMul, hourBucket, BUCKET_LABEL } from '../services/clock.js';
import { startChase, resolveExpiredChase } from './chases.js';
import {
  deferCrimeQte, loadPendingCrimeQte, beginCrimeQte, scoreCrimeQte, clearPendingCrimeQte, TIER_QTE,
} from '../services/crime-qte.js';
import {
  startHotwire, loadHotwire, beginHotwire, scoreHotwire, clearHotwire, HOTWIRE_DURATION_MS,
} from '../services/hotwire.js';
import {
  recordCrimeForInvestigation,
  getPendingTrial,
  jailMultiplier,
} from '../services/investigations.js';

function pickRandomPlayerInCity(attackerId, city) {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT id, name, cash FROM characters
    WHERE city = ? AND id != ?
      AND (jail_until IS NULL OR jail_until <= ?)
      AND (hospital_until IS NULL OR hospital_until <= ?)
      AND (travel_until IS NULL OR travel_until <= ?)
      AND COALESCE(status, 'alive') = 'alive'
    ORDER BY RANDOM() LIMIT 1
  `).all(city, attackerId, now, now, now);
  return rows[0] || null;
}
import { factionBonusMul, factionGlobalCrimeMul } from '../services/areas.js';

const router = Router();

const RISK_TABLE = {
  tiny:    { jail: 0.05, hosp: 0.02, jailMin: 3,   hospMin: 2  },
  low:     { jail: 0.10, hosp: 0.05, jailMin: 8,   hospMin: 5  },
  med:     { jail: 0.18, hosp: 0.10, jailMin: 18,  hospMin: 12 },
  high:    { jail: 0.30, hosp: 0.15, jailMin: 45,  hospMin: 25 },
  extreme: { jail: 0.45, hosp: 0.20, jailMin: 120, hospMin: 50 },
};

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
  const turfPerk = holdsTurfPerk(ch.id, ch.city);
  const localBucket = hourBucket(ch.city);
  const localBucketLabel = BUCKET_LABEL[localBucket];
  res.json({
    turf_perk_active: turfPerk,
    hourBucket: localBucket,
    hourLabel: localBucketLabel,
    crimes: CRIMES.map(c => {
      const baseCd = crimeCooldownSec(c);
      const cooldownSec = turfPerk ? Math.max(15, Math.floor(baseCd * TURF_CRIME_COOLDOWN_MUL)) : baseCd;
      const used = cdMap[c.id] || 0;
      const cooldownUntil = used + cooldownSec * 1000;
      const requires = annotateRequirements(ch.id, crimeRequirements(c));
      const requirementsMet = requires.every(r => r.ok);
      const hourMul = crimeHourMul(c.id, ch.city);
      return {
        ...c,
        locked: ch.level < c.level,
        city: cityById(ch.city)?.name,
        cooldownSec,
        cooldownUntil,
        ready: Date.now() >= cooldownUntil,
        requires,
        requirementsMet,
        hourMul,
        hourBonusPct: Math.round((hourMul - 1) * 100),
      };
    }),
  });
});

router.post('/commit', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;

  // Resolve any expired police chase first.
  const expired = resolveExpiredChase(ch);
  if (expired) {
    return res.status(409).json({
      error: 'A chase you ignored timed out — caught and jailed.',
      chaseExpired: true,
      jailMin: expired.jailMin,
      character: publicCharacter(ch),
    });
  }
  const activeChase = db.prepare('SELECT char_id FROM active_chases WHERE char_id = ?').get(ch.id);
  if (activeChase) {
    return res.status(409).json({
      error: 'You\'re mid-chase — resolve it before pulling another job.',
      chaseActive: true,
    });
  }

  // Pending trial gate — until the player pleads, hires, bribes, or
  // takes their day in court, no new crimes (real-life logic: you're
  // on bail, lying low).
  const pendingTrial = getPendingTrial(ch.id);
  if (pendingTrial) {
    return res.status(409).json({
      error: 'You\'re facing charges. Resolve your trial before pulling another job.',
      trialPending: true,
    });
  }

  const crime = crimeById(req.body?.crime_id);
  if (!crime) return res.status(400).json({ error: 'Unknown crime' });
  if (ch.level < crime.level) return res.status(403).json({ error: `Requires level ${crime.level}` });
  if (ch.energy < crime.energy) return res.status(400).json({ error: 'Not enough energy' });
  if (crime.tier === 'gta' && ch.active_vehicle_id) {
    return res.status(400).json({ error: 'Can\'t boost a car while you\'re already driving one — sell or store your current ride first.' });
  }

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
  const consumed = consumeRequirements(ch.id, requires);

  // Tick the misc_use daily missions for every prop the crime burned
  // (one event per qty so "Use 2 burner phones" counts both). Mirrors
  // what the General Store's /use endpoint does, so dailies like
  // "Ghost Caller" still complete when the prop is consumed by a
  // crime instead of by a manual /use.
  for (const r of (consumed || [])) {
    if (r.kind !== 'misc') continue;
    const n = r.qty || 1;
    for (let i = 0; i < n; i++) {
      bumpMission(ch, 'misc_use_any', 1);
      bumpMission(ch, 'misc_use', 1, { item: r.item_id });
    }
  }

  const heatNow = effectiveHeat(ch);
  const heatPenalty = heatNow * HEAT_SUCCESS_PENALTY;

  const intelBonus = (crime.intelBonus || 0) * (ch.intelligence * 0.3);
  const hourMul = crimeHourMul(crime.id, ch.city, now);
  const success = Math.max(5, Math.min(95, (crime.base + ch.intelligence * 0.3 + ch.level * 0.4 + intelBonus - heatPenalty) * hourMul));

  // GTA crimes are deferred behind a hot-wire QTE. Persist the
  // precomputed crime-resolution context (success rate, heat,
  // hour-mul, intel-bonus) on the pending row so /hotwire/resolve
  // can run the actual resolution with the QTE bonus applied,
  // immune to any heat decay or hour-bucket flip in the seconds
  // between commit and resolve.
  if (crime.tier === 'gta') {
    const hotwire = startHotwire(ch, {
      crime,
      baseSuccessPct: success,
      heatAtCommit:   heatNow,
      hourMul,
      intelBonus,
    });
    saveCharacter(ch);
    // Record cooldown so the player can't spam /commit to refresh
    // the QTE seed.
    db.prepare(`
      INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
      ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
    `).run(ch.id, cooldownKey(crime.id), now);
    return res.json({
      ok: true,
      hotwire,
      cooldownUntil: now + cdSec * 1000,
      character: publicCharacter(ch),
    });
  }

  const roll = Math.random() * 100;
  const succeeded = roll < success;

  let result;
  if (succeeded) {
    const happyMul = 1 + (ch.happiness - 50) / 200;
    const xpGain = Math.floor(crime.xp * happyMul);
    const lvls = awardXp(ch, xpGain);
    ch.reputation += Math.floor(crime.xp / 4);
    ch.happiness = Math.min(100, ch.happiness + 1);
    bumpMission(ch, 'crime_success', 1, { tier: crime.tier, crime: crime.id });
    if (ch.faction) {
      db.prepare(`
        INSERT INTO faction_stats (faction_id, crimes_committed) VALUES (?, 1)
        ON CONFLICT(faction_id) DO UPDATE SET crimes_committed = crimes_committed + 1
      `).run(ch.faction);
    }

    if (crime.tier === 'gta' && crime.vehicleTier) {
      const v = rollVehicleFromTier(crime.vehicleTier);
      let stolenCondition = 100;
      let stolenActive = false;
      let chopped = false;
      let chopPayout = 0;
      if (v) {
        stolenCondition = Math.round(75 + Math.random() * 25);
        const drivingGate = VEHICLE_TIER_DRIVING_GATE[v.tier] || 0;
        const canDrive = (ch.driving || 1) >= drivingGate;
        // If the player is already driving a premium car, don't silently
        // displace it with a stolen one — fall through to the garage /
        // chop-shop branches like a tier-locked car.
        if (canDrive && !ch.active_premium_vehicle_id) {
          const info = db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, condition) VALUES (?, ?, ?, ?, ?, ?)')
            .run(ch.id, v.id, 'stolen', ch.city, Date.now(), stolenCondition);
          ch.active_vehicle_id = info.lastInsertRowid;
          stolenActive = true;
        } else if (freeGarageSpace(ch.id, ch.city) > 0) {
          db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, condition) VALUES (?, ?, ?, ?, ?, ?)')
            .run(ch.id, v.id, 'stolen', ch.city, Date.now(), stolenCondition);
        } else {
          chopPayout = Math.floor(v.bookPrice * 0.15);
          ch.cash += chopPayout;
          chopped = true;
        }
      }
      const summary = !v
        ? `Pulled off "${crime.name}" (+${xpGain}xp).`
        : chopped
          ? `Pulled off "${crime.name}" — chopped the ${v.maker} ${v.name} for £${chopPayout.toLocaleString()} (no garage, no licence) (+${xpGain}xp).`
          : stolenActive
            ? `Pulled off "${crime.name}" — drove off in a ${v.maker} ${v.name} (${stolenCondition}% cond, +${xpGain}xp).`
            : `Pulled off "${crime.name}" — stashed the ${v.maker} ${v.name} in the garage (need driving ${VEHICLE_TIER_DRIVING_GATE[v.tier]} to drive it). +${xpGain}xp.`;
      writeLog(ch.id, 'crime', summary, { crime: crime.id, vehicle: v?.id, xp: xpGain, condition: stolenCondition, stashed: !stolenActive && !chopped, chopped, chopPayout });
      result = { ok: true, success: true, vehicle: v, condition: stolenCondition, xp: xpGain, levels: lvls, active: stolenActive, chopped, chopPayout };
    } else {
      const cityMul = cityById(ch.city)?.businessMul || 1.0;
      const localTerrMul  = factionBonusMul(ch.faction, ch.city, 'crime_cash');
      const globalTerrMul = factionGlobalCrimeMul(ch.faction);
      const territoryBonus = localTerrMul * globalTerrMul;
      const cyberMul = crime.tier === 'cyber' ? (1 + specPerk(ch, 'cyber_payout_pct')) : 1;
      const grossPayout = Math.floor(rng(crime.min, crime.max) * cityMul * happyMul * territoryBonus * cyberMul);

      if (crime.id === 'mugging' && Math.random() < 0.12) {
        const target = pickRandomPlayerInCity(ch.id, ch.city);
        if (target && (target.cash || 0) >= 200) {
          const taken = Math.max(100, Math.floor((target.cash || 0) * (0.20 + Math.random() * 0.10)));
          db.prepare('UPDATE characters SET cash = MAX(0, cash - ?) WHERE id = ?').run(taken, target.id);
          ch.cash += taken;
          const informed = Math.random() < 0.30;
          const skim = applyGangCrimeCut(ch, taken);
          ch.cash -= skim;
          const skimNote = skim > 0 ? ` (-£${skim.toLocaleString()} gang)` : '';
          writeLog(ch.id, 'crime', `Mugged ${target.name} on the street — took £${taken.toLocaleString()}${skimNote} (+${xpGain}xp).`, { crime: crime.id, payout: taken, victim: target.id, informed, gangSkim: skim });
          if (informed) {
            writeLog(target.id, 'crime', `Mugged on the street — ${ch.name} grabbed £${taken.toLocaleString()} and bolted.`, { attacker: ch.id, taken }, true);
            sendEvent(target.id, 'mugged', { by: ch.name, amount: taken });
          } else {
            writeLog(target.id, 'crime', `You're £${taken.toLocaleString()} lighter — somebody clipped your wallet in the city.`, { taken }, true);
          }
          result = { ok: true, success: true, payout: taken, gangSkim: skim, victim: { id: target.id, name: target.name }, informed, dirty: !!crime.dirty, xp: xpGain, levels: lvls };
        } else {
          const skim = applyGangCrimeCut(ch, grossPayout);
          const payout = grossPayout - skim;
          if (crime.dirty) ch.dirty_cash += payout;
          else ch.cash += payout;
          const skimNote = skim > 0 ? ` (-£${skim.toLocaleString()} gang)` : '';
          writeLog(ch.id, 'crime', `Pulled off "${crime.name}" — +£${payout}${skimNote} +${xpGain}xp.`, { crime: crime.id, payout, gross: grossPayout, gangSkim: skim, xp: xpGain });
          result = { ok: true, success: true, payout, gangSkim: skim, dirty: !!crime.dirty, xp: xpGain, levels: lvls };
        }
      } else {
        const skim = applyGangCrimeCut(ch, grossPayout);
        const payout = grossPayout - skim;
        // Cyber / major crimes route into a payout-scaling QTE. The
        // gang-skim is already deducted (the gang got its cut up
        // front); the mini-game scales the player's net take from
        // 0.25x to 1.0x of the post-skim figure.
        if (crime.tier === 'cyber' || crime.tier === 'major') {
          const qte = deferCrimeQte(ch, {
            crime, payout, skim, dirty: !!crime.dirty, xpGain, levels: lvls,
          });
          if (qte) {
            writeLog(ch.id, 'crime', `In on "${crime.name}" — now make it count. +${xpGain}xp banked.`, { crime: crime.id, qte: true, xp: xpGain });
            // Persist energy / xp / rep / faction-stats updates
            // already mutated above; the actual cash drop waits for
            // the QTE resolution.
            saveCharacter(ch);
            // Cooldown still records here so spamming commit doesn't
            // double-dip even if the player abandons the QTE.
            db.prepare(`
              INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
              ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
            `).run(ch.id, cooldownKey(crime.id), now);
            return res.json({
              ok: true, success: true, qte, xp: xpGain, levels: lvls,
              cooldownUntil: now + cdSec * 1000,
              character: publicCharacter(ch),
            });
          }
        }
        if (crime.dirty) ch.dirty_cash += payout;
        else ch.cash += payout;
        const skimNote = skim > 0 ? ` (-£${skim.toLocaleString()} gang)` : '';
        writeLog(ch.id, 'crime', `Pulled off "${crime.name}" — +£${payout}${crime.dirty ? ' (illegal)' : ''}${skimNote} +${xpGain}xp${territoryBonus > 1 ? ` (turf +${Math.round((territoryBonus - 1) * 100)}%)` : ''}.`, { crime: crime.id, payout, gross: grossPayout, gangSkim: skim, xp: xpGain, territoryBonus });
        result = { ok: true, success: true, payout, gangSkim: skim, dirty: !!crime.dirty, xp: xpGain, levels: lvls };
      }
    }
  } else {
    const risk = RISK_TABLE[crime.risk] || RISK_TABLE.low;
    const jailFloor = risk.jail;
    const jailCeil  = Math.min(risk.jail + risk.hosp, jailFloor * (1 + heatNow * HEAT_JAIL_MULTIPLIER));
    const adjustedJail = Math.max(jailFloor, jailCeil);
    const consequence = Math.random();
    if (consequence < adjustedJail) {
      // Record-weight multiplier — repeat offenders eat longer time
      // on the same flubbed crime. Phase 6 wiring.
      const recMul = jailMultiplier(ch.id);
      const baseMins = Math.floor(risk.jailMin * (1 + Math.random() * 0.6));
      const mins = Math.floor(baseMins * recMul);
      if (crime.tier === 'gta') {
        const payload = startChase(ch, { crimeId: crime.id, crimeName: crime.name, jailMin: mins });
        const msg = `🚨 Sirens behind you mid-getaway from "${crime.name}". Outrun them or it's ${mins}m inside.`;
        writeLog(ch.id, 'crime', msg, { crime: crime.id, chase: true, jail_min: mins }, true);
        result = { ok: true, success: false, chase: payload.chase };
      } else {
        const msg = failMessage(crime.tier, 'jail', crime.name, mins);
        applyJailSentence(ch, mins * 60 * 1000, msg);
        writeLog(ch.id, 'crime', msg, { crime: crime.id, jail_min: mins }, true);
        result = { ok: true, success: false, jailed: true, jail_min: mins };
      }
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

  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(ch.id, cooldownKey(crime.id), now);
  const cooldownUntil = now + cdSec * 1000;

  const heatBefore = heatNow;
  const heatAfter  = addHeat(ch, HEAT_BY_RISK[crime.risk] || 5);

  // Detective drip — every commit (success or failure) feeds the
  // investigation slot. Spawns one when heat crosses 50; auto-files
  // a trial once evidence hits 100. See services/investigations.js.
  const investigation = recordCrimeForInvestigation(ch, crime.tier, succeeded, heatAfter);

  saveCharacter(ch);
  res.json({
    ...result,
    consumed,
    cooldownUntil,
    heat: { before: Math.round(heatBefore), after: Math.round(heatAfter) },
    hourMul,
    hourBonusPct: Math.round((hourMul - 1) * 100),
    investigation,
    character: publicCharacter(ch),
  });
});

// ─── Cyber / Major QTE — payout scaler ──────────────────────────
// The crime succeeded at /commit; the player banked XP and rep
// already. These endpoints resolve the deferred payout via the
// mini-game.

router.get('/qte', requireAuth, requireCharacter, (req, res) => {
  const p = loadPendingCrimeQte(req.character.id);
  if (!p) return res.json({ qte: null });
  res.json({
    qte: {
      type: p.crimeTier,
      crimeName: p.crimeName,
      sequence: p.sequence,
      expiresAt: p.expiresAt,
      durationMs: TIER_QTE[p.crimeTier].durationMs,
      tutorial: p.isTutorial,
      basePayout: p.basePayout,
    },
  });
});

router.post('/qte/begin', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const next = beginCrimeQte(ch);
  if (!next) return res.status(404).json({ error: 'No pending crime QTE.' });
  res.json({
    ok: true,
    qte: {
      type: next.crimeTier,
      crimeName: next.crimeName,
      sequence: next.sequence,
      expiresAt: next.expiresAt,
      durationMs: TIER_QTE[next.crimeTier].durationMs,
      tutorial: next.isTutorial,
      basePayout: next.basePayout,
    },
  });
});

router.post('/qte/resolve', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const p = loadPendingCrimeQte(ch.id);
  if (!p) return res.status(404).json({ error: 'No pending crime QTE.' });
  if (p.isTutorial) return res.status(409).json({ error: 'Hit Continue first.' });

  const now = Date.now();
  const inputs = Array.isArray(req.body?.inputs) ? req.body.inputs.slice(0, p.sequence.length) : [];
  const expired = now > p.expiresAt;
  const { correct, length, multiplier } = expired
    ? { correct: 0, length: p.sequence.length, multiplier: 0.25 }
    : scoreCrimeQte(p, inputs);

  const finalPayout = Math.floor(p.basePayout * multiplier);
  if (p.dirty) ch.dirty_cash += finalPayout;
  else         ch.cash       += finalPayout;

  const tag = p.crimeTier === 'cyber' ? 'Cyber take' : 'Major Score';
  const pctText = Math.round(multiplier * 100);
  const skimNote = p.gangSkim > 0 ? ` (-£${p.gangSkim.toLocaleString()} gang)` : '';
  writeLog(
    ch.id, 'crime',
    `${tag} on "${p.crimeName}" — +£${finalPayout.toLocaleString()}${skimNote}${p.dirty ? ' (illegal)' : ''} · ${correct}/${length} (${pctText}% of £${p.basePayout.toLocaleString()}).`,
    { crime: p.crimeId, payout: finalPayout, base: p.basePayout, correct, length, multiplier },
  );
  clearPendingCrimeQte(ch.id);
  saveCharacter(ch);
  res.json({
    ok: true,
    correct, length, multiplier,
    basePayout: p.basePayout,
    payout: finalPayout,
    crimeName: p.crimeName,
    crimeTier: p.crimeTier,
    expired,
    character: publicCharacter(ch),
  });
});

// ─── Hot-wire QTE (GTA only) ────────────────────────────────────
// Fires on every tier='gta' commit. Inputs modify the success rate
// (+3% per correct, max +9%) and — if the crime fails into a jail
// consequence — the chase's escape chance (+5% per correct, max
// +15%). On jail-bound failure, the chase only fires 50% of the
// time; the other half goes straight to jail.

const HOTWIRE_CHASE_TRIGGER_CHANCE = 0.5;

router.get('/hotwire', requireAuth, requireCharacter, (req, res) => {
  const h = loadHotwire(req.character.id);
  if (!h) return res.json({ hotwire: null });
  res.json({
    hotwire: {
      crimeName:  h.crimeName,
      sequence:   h.sequence,
      expiresAt:  h.expiresAt,
      durationMs: HOTWIRE_DURATION_MS,
      tutorial:   h.isTutorial,
    },
  });
});

router.post('/hotwire/begin', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const h = beginHotwire(ch);
  if (!h) return res.status(404).json({ error: 'No active hot-wire.' });
  res.json({
    ok: true,
    hotwire: {
      crimeName: h.crimeName, sequence: h.sequence, expiresAt: h.expiresAt,
      durationMs: HOTWIRE_DURATION_MS, tutorial: h.isTutorial,
    },
  });
});

router.post('/hotwire/resolve', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const h = loadHotwire(ch.id);
  if (!h) return res.status(404).json({ error: 'No active hot-wire.' });
  if (h.isTutorial) return res.status(409).json({ error: 'Hit Continue first.' });
  const crime = crimeById(h.crimeId);
  if (!crime) {
    clearHotwire(ch.id);
    return res.status(400).json({ error: 'Crime no longer exists.' });
  }
  const now = Date.now();
  const inputs = Array.isArray(req.body?.inputs) ? req.body.inputs.slice(0, h.sequence.length) : [];
  const expired = now > h.expiresAt;
  const scored = scoreHotwire(h, inputs, { expired });

  // Apply hot-wire bonus, roll the crime, run the resolution. The
  // bonus is bounded — even 9 extra % can't push success past 95%.
  const finalSuccess = Math.max(5, Math.min(95, h.baseSuccessPct + scored.successBonusPct));
  const roll = Math.random() * 100;
  const succeeded = roll < finalSuccess;

  // Heat is applied unconditionally at commit time in the normal
  // path, but we deferred. Apply now so attribution lines up.
  if (typeof addHeat === 'function') {
    addHeat(ch, HEAT_BY_RISK[crime.risk] || 0);
  }

  let result;
  if (succeeded) {
    const happyMul = 1 + (ch.happiness - 50) / 200;
    const xpGain = Math.floor(crime.xp * happyMul);
    const lvls = awardXp(ch, xpGain);
    ch.reputation += Math.floor(crime.xp / 4);
    ch.happiness = Math.min(100, ch.happiness + 1);
    bumpMission(ch, 'crime_success', 1, { tier: crime.tier, crime: crime.id });
    if (ch.faction) {
      db.prepare(`
        INSERT INTO faction_stats (faction_id, crimes_committed) VALUES (?, 1)
        ON CONFLICT(faction_id) DO UPDATE SET crimes_committed = crimes_committed + 1
      `).run(ch.faction);
    }
    // Vehicle steal path — mirrors the /commit success branch for
    // crime.tier='gta'.
    const v = rollVehicleFromTier(crime.vehicleTier);
    let stolenCondition = 100;
    let stolenActive = false;
    let chopped = false;
    let chopPayout = 0;
    if (v) {
      stolenCondition = Math.round(75 + Math.random() * 25);
      const drivingGate = VEHICLE_TIER_DRIVING_GATE[v.tier] || 0;
      const canDrive = (ch.driving || 1) >= drivingGate;
      if (canDrive && !ch.active_premium_vehicle_id) {
        const info = db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, condition) VALUES (?, ?, ?, ?, ?, ?)')
          .run(ch.id, v.id, 'stolen', ch.city, Date.now(), stolenCondition);
        ch.active_vehicle_id = info.lastInsertRowid;
        stolenActive = true;
      } else if (freeGarageSpace(ch.id, ch.city) > 0) {
        db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, condition) VALUES (?, ?, ?, ?, ?, ?)')
          .run(ch.id, v.id, 'stolen', ch.city, Date.now(), stolenCondition);
      } else {
        chopPayout = Math.floor(v.bookPrice * 0.15);
        ch.cash += chopPayout;
        chopped = true;
      }
    }
    const summary = !v
      ? `Pulled off "${crime.name}" (+${xpGain}xp).`
      : chopped
        ? `Pulled off "${crime.name}" — chopped the ${v.maker} ${v.name} for £${chopPayout.toLocaleString()} (no garage, no licence) (+${xpGain}xp).`
        : stolenActive
          ? `Pulled off "${crime.name}" — drove off in a ${v.maker} ${v.name} (${stolenCondition}% cond, +${xpGain}xp).`
          : `Pulled off "${crime.name}" — stashed the ${v.maker} ${v.name} in the garage. +${xpGain}xp.`;
    writeLog(ch.id, 'crime', summary, { crime: crime.id, vehicle: v?.id, xp: xpGain, condition: stolenCondition, stashed: !stolenActive && !chopped, chopped, chopPayout, hotwire: scored });
    result = { ok: true, success: true, vehicle: v, condition: stolenCondition, xp: xpGain, levels: lvls, active: stolenActive, chopped, chopPayout, hotwire: scored };
  } else {
    // Failure path. Consequence roll mirrors the /commit failure
    // branch. The chase, if it would have fired, is now gated by
    // a 50% coinflip — half the time it's a chance to escape, half
    // the time it's straight to jail.
    const risk = RISK_TABLE[crime.risk] || RISK_TABLE.low;
    const jailFloor = risk.jail;
    const jailCeil  = Math.min(risk.jail + risk.hosp, jailFloor * (1 + h.heatAtCommit * HEAT_JAIL_MULTIPLIER));
    const adjustedJail = Math.max(jailFloor, jailCeil);
    const consequence = Math.random();
    if (consequence < adjustedJail) {
      const recMul = jailMultiplier(ch.id);
      const baseMins = Math.floor(risk.jailMin * (1 + Math.random() * 0.6));
      const mins = Math.floor(baseMins * recMul);
      if (Math.random() < HOTWIRE_CHASE_TRIGGER_CHANCE) {
        const payload = startChase(ch, {
          crimeId: crime.id, crimeName: crime.name, jailMin: mins,
          escapeBonusPct: scored.chaseBonusPct,
        });
        const msg = ` Sirens behind you mid-getaway from "${crime.name}". Outrun them or it's ${mins}m inside.`;
        writeLog(ch.id, 'crime', msg, { crime: crime.id, chase: true, jail_min: mins, hotwire: scored }, true);
        result = { ok: true, success: false, chase: payload.chase, hotwire: scored };
      } else {
        const msg = failMessage(crime.tier, 'jail', crime.name, mins);
        applyJailSentence(ch, mins * 60 * 1000, msg);
        writeLog(ch.id, 'crime', msg, { crime: crime.id, jail_min: mins, hotwire: scored }, true);
        result = { ok: true, success: false, jailed: true, jail_min: mins, hotwire: scored };
      }
    } else if (consequence < adjustedJail + risk.hosp) {
      const mins = Math.floor(risk.hospMin * (1 + Math.random() * 0.7));
      ch.hospital_until = Date.now() + mins * 60 * 1000;
      ch.health = Math.max(1, Math.floor(ch.health * 0.3));
      const msg = failMessage(crime.tier, 'hospital', crime.name, mins);
      ch.hospital_reason = msg;
      writeLog(ch.id, 'crime', msg, { crime: crime.id, hosp_min: mins, hotwire: scored }, true);
      result = { ok: true, success: false, hospital: true, hosp_min: mins, hotwire: scored };
    } else {
      ch.happiness = Math.max(0, ch.happiness - 2);
      const msg = failMessage(crime.tier, 'escape', crime.name);
      writeLog(ch.id, 'crime', msg, { crime: crime.id, hotwire: scored });
      result = { ok: true, success: false, escaped: true, hotwire: scored };
    }
  }
  clearHotwire(ch.id);
  saveCharacter(ch);
  res.json({ ...result, character: publicCharacter(ch), expired });
});

router.post('/hotwire/give-up', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const h = loadHotwire(ch.id);
  if (!h) return res.status(404).json({ error: 'No active hot-wire.' });
  // Mark tutorial seen even on give-up so the next attempt skips
  // the overlay.
  if (!ch.hotwire_tutorial_seen) {
    ch.hotwire_tutorial_seen = 1;
    db.prepare('UPDATE characters SET hotwire_tutorial_seen = 1 WHERE id = ?').run(ch.id);
  }
  // Give-up = 0/0 hits, no bonus, crime rolls with the base success
  // rate. This is equivalent to a 0-correct resolve.
  req.body = { inputs: [] };
  // Defer to /resolve by re-using its logic? Simpler: clear and apply
  // a baseline failure (you didn't even start). Skip the crime
  // entirely — refund energy as a courtesy.
  ch.energy = Math.min(ch.max_energy, ch.energy + (crimeById(h.crimeId)?.energy || 0));
  clearHotwire(ch.id);
  writeLog(ch.id, 'crime', `Walked away from "${h.crimeName}" before the engine turned. Energy refunded.`);
  saveCharacter(ch);
  res.json({ ok: true, gaveUp: true, character: publicCharacter(ch) });
});

export default router;
