// Polygon-area capture mechanic — replaces the old named-territory
// system. Each city is split into Voronoi cells (see data-areas.js).
// Gangs combine the strength/defence of every member currently in the
// city to roll for control of an area; the loser eats casualties.
//
// Cooldown: an area that has flipped today is locked until next UTC
// midnight, so each area can change hands at most once per day.

import { db } from '../db.js';
import { areaById, areasInCity, ALL_AREAS } from '../data-areas.js';
import { writeLog } from './log.js';
import { sendEvent } from './events.js';

// Bonus per area held in the same city, per faction. Stacks linearly
// so a gang holding 6/9 of NY gets +30% on its faction's casino /
// business / crime payouts there.
const PER_AREA_BONUS = 0.05;

// Capture roll parameters. Every gang member in the city contributes
// — the gang-size cap elsewhere caps the pool naturally, so there's
// no per-attempt top-N filtering.
const MIN_WIN_CHANCE = 0.10;
const MAX_WIN_CHANCE = 0.90;

// Casualty parameters — per attempt, applied to BOTH sides regardless
// of outcome. Roughly 20% of contributors get hospitalised, 2% of
// those die. Per-contributor death rate ≈ 0.4%.
const HOSPITAL_RATE = 0.20;
const DEATH_RATE_GIVEN_HOSPITAL = 0.02;
const HOSP_MIN_MIN = 30;
const HOSP_MIN_MAX = 90;

function utcMidnightAfter(ts) {
  const d = new Date(ts);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}
function isLockedToday(area, now) {
  return area.flipped_at && area.flipped_at >= startOfUtcDay(now);
}
function startOfUtcDay(ts) {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

// Returns the gang currently controlling this area (or null).
function getAreaState(areaId) {
  const meta = areaById(areaId);
  if (!meta) return null;
  const row = db.prepare('SELECT * FROM city_areas WHERE area_id = ?').get(areaId);
  return {
    ...meta,
    gang_id: row?.gang_id || null,
    faction: row?.faction || null,
    captured_at: row?.captured_at || null,
    flipped_at: row?.flipped_at || null,
    last_attempt_at: row?.last_attempt_at || null,
  };
}

// Public — list of areas for a city with current control state.
export function listAreasInCity(city) {
  return areasInCity(city).map(a => getAreaState(a.id));
}

// Public — every area with state, used for global counts.
export function listAllAreas() {
  return ALL_AREAS.map(a => getAreaState(a.id));
}

// Count of areas a faction holds in a given city. Used by
// factionBonusMul to scale crime/business/casino bonuses linearly
// with control footprint.
export function factionAreaCount(faction, city) {
  if (!faction || !city) return 0;
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM city_areas WHERE city = ? AND faction = ?'
  ).get(city, faction);
  return row?.n || 0;
}

// Public — multiplier for the active player's faction in their city.
// Scales with how many areas their faction holds. Replaces the old
// named-slot factionBonusMul. The `kind` arg is kept in the signature
// for back-compat with callers (casino, businesses, drugs) but the
// new system is uniform across kinds.
export function factionBonusMul(faction, city, _kind) {
  const n = factionAreaCount(faction, city);
  return 1 + n * PER_AREA_BONUS;
}

// Global (all-cities) area count for a faction. Used by crimes.js to
// reward factions that dominate the world map, not just one city.
// 1% per area held globally, capped at +30%.
export function factionGlobalCrimeMul(faction) {
  if (!faction) return 1;
  const row = db.prepare('SELECT COUNT(*) AS n FROM city_areas WHERE faction = ?').get(faction);
  const n = row?.n || 0;
  return 1 + Math.min(0.30, n * 0.01);
}

// "Gang members in the city" — characters in this gang who are
// physically present, alive, and not jailed/hospitalised/in transit.
function gangMembersInCity(gangId, city) {
  return db.prepare(`
    SELECT c.id, c.name, c.strength, c.defence, c.speed
    FROM gang_members gm
    JOIN characters c ON c.id = gm.char_id
    WHERE gm.gang_id = ?
      AND c.city = ?
      AND c.status = 'alive'
      AND (c.hospital_until IS NULL OR c.hospital_until <= ?)
      AND (c.jail_until     IS NULL OR c.jail_until     <= ?)
      AND (c.travel_until   IS NULL OR c.travel_until   <= ?)
  `).all(gangId, city, Date.now(), Date.now(), Date.now());
}

// Public — capture attempt. Returns { ok, captured, ... } or { error }.
export function captureArea(attacker, gang, areaId) {
  const meta = areaById(areaId);
  if (!meta) return { error: 'No such area.' };
  if (attacker.city !== meta.city) return { error: "Be in the area's city to attempt capture." };
  if (!gang) return { error: 'Only gang members can capture areas.' };
  if (gang.faction !== attacker.faction) return { error: 'Faction mismatch — speak to your gang lead.' };

  const state = getAreaState(areaId);
  const now = Date.now();
  if (state.gang_id === gang.id) return { error: "Your gang already holds this area." };
  if (isLockedToday(state, now)) {
    return { error: 'This area has already changed hands today — try after UTC midnight.' };
  }

  // Same-faction (different gang) attempts blocked — keeps internal
  // faction politics out of the territory war for now.
  if (state.faction && state.faction === gang.faction) {
    return { error: "An allied gang already controls this area." };
  }

  const attackers = gangMembersInCity(gang.id, meta.city);
  if (attackers.length === 0) {
    return { error: 'No gang members are present in the city to lead the attack.' };
  }

  // Pull defender state. If the area is unclaimed, defenders = [], the
  // attacker rolls solo against a low fixed defence (50 base) so first
  // claim isn't a free walk-over.
  const defGang = state.gang_id;
  const defenders = defGang
    ? gangMembersInCity(defGang, meta.city)
    : [];

  // Combined power: every present gang member counts (the gang-size
  // cap elsewhere keeps the pool reasonable). Defenders against an
  // unclaimed area roll against a fixed 50 baseline so first claims
  // aren't completely free.
  const atkPower = attackers.reduce((s, m) => s + (m.strength || 1), 0);
  const defPower = defenders.reduce((s, m) => s + (m.defence  || 1), 0) || 50;

  // Win chance: 50/50 at parity, tilts with stats differential.
  let winChance = 0.5 + 0.5 * (atkPower - defPower) / Math.max(1, atkPower + defPower);
  winChance = Math.max(MIN_WIN_CHANCE, Math.min(MAX_WIN_CHANCE, winChance));
  // Unclaimed areas roll at a fixed 80% to encourage land-grabs.
  if (!defGang) winChance = 0.80;

  const captured = Math.random() < winChance;

  // Casualties — rolled against every member who took part.
  const atkCasualties = rollCasualties(attackers);
  const defCasualties = rollCasualties(defenders);

  // Apply casualties.
  applyCasualties(atkCasualties, `Wounded in turf battle for ${meta.name}.`);
  applyCasualties(defCasualties, `Wounded defending ${meta.name}.`);

  // Persist area state.
  db.prepare(`
    INSERT INTO city_areas (area_id, city, gang_id, faction, captured_at, flipped_at, last_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(area_id) DO UPDATE SET
      gang_id         = excluded.gang_id,
      faction         = excluded.faction,
      captured_at     = excluded.captured_at,
      flipped_at      = excluded.flipped_at,
      last_attempt_at = excluded.last_attempt_at
  `).run(
    areaId,
    meta.city,
    captured ? gang.id      : state.gang_id,
    captured ? gang.faction : state.faction,
    captured ? now          : state.captured_at,
    captured ? now          : state.flipped_at,
    now,
  );

  // Logs + events.
  const verb = captured ? 'TOOK' : 'failed to take';
  writeLog(attacker.id, 'turf', `Gang ${verb} ${meta.name} in ${meta.city}. Atk ${atkPower} vs Def ${defPower} (${Math.round(winChance * 100)}%).`);
  if (captured && defGang) {
    sendEvent(null, 'area.captured', { area: areaId, attacker_gang: gang.id, defender_gang: defGang });
  }

  return {
    ok: true,
    captured,
    winChance,
    atkPower,
    defPower,
    atkCasualties,
    defCasualties,
    area: getAreaState(areaId),
  };
}

function rollCasualties(roster) {
  const out = [];
  for (const m of roster) {
    if (Math.random() >= HOSPITAL_RATE) continue;
    const killed = Math.random() < DEATH_RATE_GIVEN_HOSPITAL;
    const hospital_min = HOSP_MIN_MIN + Math.floor(Math.random() * (HOSP_MIN_MAX - HOSP_MIN_MIN));
    out.push({ id: m.id, name: m.name, killed, hospital_min });
  }
  return out;
}

function applyCasualties(casualties, reason) {
  const now = Date.now();
  for (const c of casualties) {
    if (c.killed) {
      // Permadeath: same shape death.js uses elsewhere — flip status
      // so the player rolls a new character on next login.
      db.prepare(`
        UPDATE characters SET
          status = 'pending_new_character',
          health = 0,
          hospital_until = NULL,
          jail_until = NULL
        WHERE id = ?
      `).run(c.id);
      writeLog(c.id, 'turf', ` Killed in action — ${reason}`, null, true);
      sendEvent(c.id, 'character.killed', { reason });
    } else {
      const until = now + c.hospital_min * 60 * 1000;
      db.prepare(`
        UPDATE characters SET
          health = MAX(1, MIN(health, 20)),
          hospital_until = MAX(COALESCE(hospital_until, 0), ?),
          hospital_reason = ?
        WHERE id = ?
      `).run(until, reason, c.id);
      writeLog(c.id, 'turf', `Hospitalised ${c.hospital_min}m — ${reason}`, null, true);
    }
  }
}
