// Territory control — fine-grained gang ownership of named locations
// inside cities. Distinct from the whole-city turf_holds table that
// gang wars award; this is a finer dial that any aligned gang can
// fight over independently.
//
// Capture model (v1, async):
// - Officers / leader of an aligned gang trigger an attempt.
// - The gang's POWER (sum of member levels) is rolled against the
//   defender's POWER × DEFENDER_BONUS. Random outcome with bias.
// - Win → take the location, stamp gang_id + faction + captured_at.
// - Lose → defender keeps it. Either way, last_attempt_at advances.
// - Capture cost: ENERGY_COST off the attacker; CAPTURE_COOLDOWN_MS
//   per location per attacker so the same player can't spam.
//
// No live "siege" window in v1. We can layer that on top later by
// introducing a "contested_until" column and timed defence pings.

import { db } from '../db.js';
import { TERRITORIES, territoryById, territoriesInCity } from '../data.js';
import { writeLog } from './log.js';
import { sendEvent } from './events.js';

export const ENERGY_COST            = 8;
export const CAPTURE_COOLDOWN_MS    = 60 * 60 * 1000;   // 1h between attempts vs the same location
export const DEFENDER_BONUS         = 1.25;             // defender's STRENGTH multiplier

// Consequences of losing the assault (rolled when the capture fails).
// Order matters: we roll once and check the cumulative thresholds.
// Anything past JAIL_THRESHOLD + HOSP_THRESHOLD is "just lost" — you
// walk away with nothing but the cooldown and energy cost.
export const FAIL_HOSP_CHANCE  = 0.25;   // 25% — got beat up by defenders
export const FAIL_JAIL_CHANCE  = 0.05;   // 5%  — caught at the scene
export const FAIL_HOSP_MIN     = 8;      // base hospital minutes (×1–1.7 random)
export const FAIL_JAIL_MIN     = 15;     // base jail minutes (×1–1.6 random)

// Faction-wide aggregate: each unique city where the faction holds at
// least one location contributes this much to a global crime-cash
// multiplier. With 14 cities → up to +7% on top of any local bonus.
export const FACTION_GLOBAL_PER_CITY = 0.005;

// Gang strength — the multiplier rolled in capture attempts. Each
// member contributes a score that combines level, combat stats,
// reputation, and recent activity:
//
//   member_score = level
//                + (strength + defence + speed + intelligence) / 4
//                + reputation / 200
//   weight       = 1.0  if active in last 24h
//                  0.5  if active in last 7d
//                  0.2  otherwise (long-dormant)
//   gang_strength = sum(member_score × weight)
//
// Rationale: a fresh-but-active gang of mid-level pros should be
// competitive with a sprawl of high-level dormants. Average stats
// matter so leveled-up but unspecced characters don't carry the
// whole gang on raw level alone.
export function gangStrength(gangId) {
  if (!gangId) return 0;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT c.level, c.strength, c.defence, c.speed, c.intelligence,
           c.reputation, c.last_active_at
    FROM gang_members m JOIN characters c ON c.id = m.char_id
    WHERE m.gang_id = ?
  `).all(gangId);
  let total = 0;
  for (const r of rows) {
    const score = (r.level || 0)
      + ((r.strength || 0) + (r.defence || 0) + (r.speed || 0) + (r.intelligence || 0)) / 4
      + (r.reputation || 0) / 200;
    const sinceActive = now - (r.last_active_at || 0);
    const weight = sinceActive < day      ? 1.0
                 : sinceActive < 7 * day  ? 0.5
                 :                          0.2;
    total += score * weight;
  }
  return total;
}

// Backwards-compat alias — older code that imported gangPower keeps
// working without modification.
export const gangPower = gangStrength;

// Read the live state of a location, joining the gang for display.
// Returns null if the location id doesn't exist in the catalogue.
export function getTerritory(city, locationId) {
  const meta = territoryById(locationId);
  if (!meta || meta.city !== city) return null;
  const row = db.prepare('SELECT * FROM territories WHERE city = ? AND location_id = ?')
    .get(city, locationId);
  return decorate(meta, row);
}

// All territories with current state. Optional city filter.
export function listTerritories(city = null) {
  const metas = city ? territoriesInCity(city) : TERRITORIES;
  return metas.map(meta => {
    const row = db.prepare('SELECT * FROM territories WHERE city = ? AND location_id = ?')
      .get(meta.city, meta.id);
    return decorate(meta, row);
  });
}

function decorate(meta, row) {
  if (!row) {
    return {
      ...meta,
      gang_id: null, gang: null, faction: null,
      captured_at: null, last_attempt_at: null,
    };
  }
  let gang = null;
  if (row.gang_id) {
    gang = db.prepare('SELECT id, name, tag FROM gangs WHERE id = ?').get(row.gang_id);
  }
  return {
    ...meta,
    gang_id: row.gang_id,
    gang,
    faction: row.faction,
    captured_at: row.captured_at,
    last_attempt_at: row.last_attempt_at,
  };
}

// Returns null on success or a string error.
export function capture(attacker, gang, locationId) {
  const meta = territoryById(locationId);
  if (!meta) return { error: 'Unknown location.' };
  if (attacker.city !== meta.city) return { error: 'Be in the location\'s city to attempt capture.' };
  if (!gang) return { error: 'Only gang members can capture territory.' };
  if (!gang.faction) return { error: 'Your gang has no faction allegiance.' };
  if (attacker.energy < ENERGY_COST) return { error: `Need ${ENERGY_COST} energy.` };

  const now = Date.now();
  const current = getTerritory(meta.city, locationId);

  // Per-attacker cooldown — track via consumable_cooldowns so it
  // persists across server restarts.
  const cdKey = `terr_${meta.city}_${locationId}`;
  const cd = db.prepare('SELECT used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id = ?')
    .get(attacker.id, cdKey);
  if (cd && now - cd.used_at < CAPTURE_COOLDOWN_MS) {
    const wait = Math.ceil((CAPTURE_COOLDOWN_MS - (now - cd.used_at)) / 60000);
    return { error: `Cooling off — try again in ${wait} min.` };
  }

  // Same-faction territory is off-limits — we can iterate later if
  // factions want internal scuffles.
  if (current.gang_id && current.faction === gang.faction && current.gang_id !== gang.id) {
    return { error: 'A gang of your own faction holds this. No internal warfare.' };
  }
  if (current.gang_id === gang.id) {
    return { error: 'Your gang already holds this location.' };
  }

  // Resolve outcome.
  const attackerStrength = gangStrength(gang.id) + 1; // +1 so a brand-new gang can still try
  let captured = false;
  let detail = '';
  let failOutcome = null;   // null | 'hospital' | 'jail' | 'escaped'
  let consequenceMins = 0;
  if (!current.gang_id) {
    captured = true;
    detail = 'Took unclaimed turf.';
  } else {
    const defenderStrength = (gangStrength(current.gang_id) + 1) * DEFENDER_BONUS;
    const winChance = attackerStrength / (attackerStrength + defenderStrength);
    const roll = Math.random();
    captured = roll < winChance;
    detail = `Strength ${attackerStrength.toFixed(0)} vs ${defenderStrength.toFixed(0)} (defender bonus). Roll ${(roll * 100).toFixed(1)} vs ${(winChance * 100).toFixed(1)}%.`;
    // On a loss, roll for an additional consequence — defenders fight
    // back, sometimes the cops show up. Walking away clean is still
    // the most likely outcome.
    if (!captured) {
      const cRoll = Math.random();
      if (cRoll < FAIL_HOSP_CHANCE) {
        consequenceMins = Math.floor(FAIL_HOSP_MIN * (1 + Math.random() * 0.7));
        attacker.hospital_until = now + consequenceMins * 60 * 1000;
        attacker.health = Math.max(1, Math.floor(attacker.health * 0.3));
        attacker.hospital_reason = `Beaten back trying to take "${meta.name}" — admitted for ${consequenceMins} minutes.`;
        failOutcome = 'hospital';
      } else if (cRoll < FAIL_HOSP_CHANCE + FAIL_JAIL_CHANCE) {
        consequenceMins = Math.floor(FAIL_JAIL_MIN * (1 + Math.random() * 0.6));
        attacker.jail_until = now + consequenceMins * 60 * 1000;
        attacker.jail_reason = `Caught attacking "${meta.name}" — sentenced to ${consequenceMins} minutes.`;
        failOutcome = 'jail';
      } else {
        failOutcome = 'escaped';
      }
    }
  }

  // Persist outcome.
  db.prepare(`
    INSERT INTO territories (city, location_id, gang_id, faction, captured_at, last_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(city, location_id) DO UPDATE SET
      gang_id         = excluded.gang_id,
      faction         = excluded.faction,
      captured_at     = excluded.captured_at,
      last_attempt_at = excluded.last_attempt_at
  `).run(
    meta.city,
    locationId,
    captured ? gang.id : current.gang_id,
    captured ? gang.faction : current.faction,
    captured ? now : current.captured_at,
    now,
  );

  // Per-attacker cooldown.
  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(attacker.id, cdKey, now);

  // ── Notify the losing gang ─────────────────────────────────────
  // Only fires when a successful capture flipped ownership — taking
  // unclaimed turf has no defender to ping.
  if (captured && current.gang_id && current.gang_id !== gang.id) {
    const losingMembers = db.prepare(
      'SELECT char_id FROM gang_members WHERE gang_id = ?'
    ).all(current.gang_id);
    const cityLabel = meta.city.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const message = `${gang.name} [${gang.tag}] just took "${meta.name}" in ${cityLabel} from your gang.`;
    for (const m of losingMembers) {
      writeLog(
        m.char_id,
        'gang',
        message,
        {
          location_id: locationId,
          city: meta.city,
          attacker_gang_id: gang.id,
          attacker_gang_name: gang.name,
          attacker_gang_tag: gang.tag,
          attacker_char_id: attacker.id,
        },
        true,   // notify=true → shows in the bell
      );
      sendEvent(m.char_id, 'territory.lost', {
        location_id: locationId,
        location_name: meta.name,
        city: meta.city,
        attacker: { id: gang.id, name: gang.name, tag: gang.tag },
      });
    }
  }

  attacker.energy = Math.max(0, attacker.energy - ENERGY_COST);
  return {
    captured,
    detail,
    failOutcome,
    consequenceMins,
    territory: getTerritory(meta.city, locationId),
  };
}

// Sum of bonuses of `type` across all territories the given faction
// holds in the given city. Returns a multiplier ≥ 1.0 ready to drop
// into a payout formula. e.g. factionBonusMul('mafia', 'new_york',
// 'crime_cash') → 1.05 if Mafia holds the Docks, 1.0 otherwise.
export function factionBonusMul(faction, city, type) {
  if (!faction) return 1.0;
  const rows = db.prepare(`
    SELECT t.location_id FROM territories t WHERE t.city = ? AND t.faction = ?
  `).all(city, faction);
  let pct = 0;
  for (const r of rows) {
    const meta = territoryById(r.location_id);
    if (meta?.bonus?.type === type) pct += meta.bonus.pct || 0;
  }
  return 1 + pct;
}

// Faction-wide aggregate crime-cash bonus. Counts unique cities the
// faction holds at least one location in and grants
// FACTION_GLOBAL_PER_CITY per city. Returns a multiplier ≥ 1.0.
export function factionGlobalCrimeMul(faction) {
  if (!faction) return 1.0;
  const r = db.prepare(`
    SELECT COUNT(DISTINCT city) AS n FROM territories WHERE faction = ?
  `).get(faction);
  const n = r?.n || 0;
  return 1 + (n * FACTION_GLOBAL_PER_CITY);
}

// Backwards-compat wrapper used by older call sites — kept until the
// crime payout site is fully on factionBonusMul + factionGlobalCrimeMul.
export function factionHoldsTerritoryInCity(faction, city) {
  if (!faction) return false;
  const r = db.prepare(
    'SELECT 1 AS x FROM territories WHERE city = ? AND faction = ? LIMIT 1'
  ).get(city, faction);
  return !!r;
}

// Snapshot — list which cities a faction holds at least one location
// in. Used for client-side display of "your faction's empire".
export function factionEmpire(faction) {
  if (!faction) return { cities: [], total_locations: 0 };
  const rows = db.prepare(
    'SELECT city, COUNT(*) AS n FROM territories WHERE faction = ? GROUP BY city'
  ).all(faction);
  return {
    cities: rows.map(r => ({ city: r.city, locations: r.n })),
    total_locations: rows.reduce((s, r) => s + r.n, 0),
  };
}
