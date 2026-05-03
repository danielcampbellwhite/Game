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

export const ENERGY_COST            = 8;
export const CAPTURE_COOLDOWN_MS    = 60 * 60 * 1000;   // 1h between attempts vs the same location
export const DEFENDER_BONUS         = 1.25;             // defender's POWER multiplier

// Faction-wide aggregate: each unique city where the faction holds at
// least one location contributes this much to a global crime-cash
// multiplier. With 14 cities → up to +7% on top of any local bonus.
export const FACTION_GLOBAL_PER_CITY = 0.005;

// Per-gang power: sum of member levels. Empty gangs have power = 0.
// We could include reputation / online presence; keeping it level-only
// makes the math transparent for the first cut.
export function gangPower(gangId) {
  if (!gangId) return 0;
  const r = db.prepare(`
    SELECT COALESCE(SUM(c.level), 0) AS p
    FROM gang_members m JOIN characters c ON c.id = m.char_id
    WHERE m.gang_id = ?
  `).get(gangId);
  return r?.p || 0;
}

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
  const attackerPower = gangPower(gang.id) + 1; // +1 so a brand-new gang can still try
  let captured = false;
  let detail = '';
  if (!current.gang_id) {
    // Unclaimed — instant takeover.
    captured = true;
    detail = 'Took unclaimed turf.';
  } else {
    const defenderPower = (gangPower(current.gang_id) + 1) * DEFENDER_BONUS;
    const winChance = attackerPower / (attackerPower + defenderPower);
    const roll = Math.random();
    captured = roll < winChance;
    detail = `Power ${attackerPower.toFixed(0)} vs ${defenderPower.toFixed(0)} (defender bonus). Roll ${(roll * 100).toFixed(1)} vs ${(winChance * 100).toFixed(1)}%.`;
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

  attacker.energy = Math.max(0, attacker.energy - ENERGY_COST);
  return {
    captured,
    detail,
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
