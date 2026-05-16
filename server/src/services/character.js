import { db } from '../db.js';
import { PROPERTIES, propertyById, xpForNext, rankFor, businessById, computeBusiness, vehicleById, STAT_CAPS } from '../data.js';
import { getStockPrice } from './market.js';
import { buffSnapshot } from './buffs.js';
import { effectiveHeat } from './heat.js';
import { writeLog } from './log.js';
import { getPremiumPropertyBonusesForUser, userIdForChar } from './premium.js';
import { maybeArrive, forceLocation, locationMeta } from './locations.js';
import { migrateCharacterWeights } from './weight.js';
import { internetStatus } from './online.js';
import { materializeReadyDeliveries } from './deliveries.js';

// Pending-trial flag is surfaced on publicCharacter so App.jsx's
// Protected wrapper can redirect into /trial the moment charges
// are filed. Done with a direct SQL query (rather than importing
// from investigations.js) to dodge the cyclic import that would
// otherwise form: character ↔ investigations.
function hasPendingTrial(charId) {
  try {
    const row = db.prepare('SELECT 1 FROM pending_trials WHERE char_id = ?').get(charId);
    return !!row;
  } catch {
    return false;
  }
}

const ENERGY_REGEN_MS = 5 * 60 * 1000;   // 1 energy per 5 min
const NERVE_REGEN_MS  = 5 * 60 * 1000;   // 1 nerve per 5 min
const HEALTH_REGEN_MS = 60 * 1000;       // 1 hp per minute (out of hospital)
// 1% per day, compounded hourly: (1 + r)^24 = 1.01 → r ≈ 0.0004146.
const BANK_INTEREST_PER_HOUR = 0.0004146;

export function loadCharacter(userId) {
  // Stamp the owning user's is_admin flag onto the row so callers can
  // expose it in publicCharacter without a second query. The flag never
  // belongs in the characters table itself — it's a per-user attribute.
  // premium_points (Gold Bars) is also user-level; loaded here so the
  // top-bar widget can show it without a separate /api/premium fetch
  // on every page render.
  const row = db.prepare(`
    SELECT c.*, u.is_admin AS is_admin, u.premium_points AS premium_points
    FROM characters c
    JOIN users u ON u.id = c.user_id
    WHERE c.user_id = ?
  `).get(userId);
  return row;
}

export function loadCharacterById(id) {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
}

// Property bonuses are city-locked — you only enjoy the perks of properties
// you own in the city you're currently in. Fly elsewhere and they go quiet.
// Premium properties (account-bound) layer in here too: their stat lift
// applies whenever the active character is in the matching city, even if
// the previous character was the one who unlocked them.
export function getPropertyBonuses(charId, city) {
  const totals = { max_energy: 0, max_nerve: 0, happiness: 0 };
  if (!city) return totals;
  const rows = db.prepare(
    'SELECT property_id FROM properties_owned WHERE char_id = ? AND city = ?'
  ).all(charId, city);
  for (const r of rows) {
    const p = propertyById(r.property_id);
    if (!p) continue;
    totals.max_energy += p.bonuses.max_energy || 0;
    totals.max_nerve  += p.bonuses.max_nerve  || 0;
    totals.happiness  += p.bonuses.happiness  || 0;
  }
  const userId = userIdForChar(charId);
  const premium = getPremiumPropertyBonusesForUser(userId, city);
  totals.max_energy += premium.max_energy;
  totals.max_nerve  += premium.max_nerve;
  totals.happiness  += premium.happiness;
  return totals;
}

// Apply lazy regen / interest / bonuses to a character row in memory and persist.
//
// Critical: each periodic resource has its OWN tick timestamp that only
// advances by full periods consumed. The wrong-and-easy version is to set
// `last_tick = now` every call — that eats the sub-period delta and the
// timer never accumulates if any other call (e.g. the 30s client poll)
// fires sooner than the period.

// Per-drive chance the player's active stolen vehicle gets flagged
// on the next ANPR camera. 2% = roughly one bust every ~50 drives,
// which keeps the threat real without making stolen rides
// unusable. Jail term scales with the vehicle's tier — beaters get
// a slap on the wrist, premium / luxury rides earn proper time.
const STOLEN_BUST_CHANCE_PER_DRIVE = 0.02;
const STOLEN_BUST_JAIL_BY_TIER = {
  1: 6 * 60 * 1000,
  2: 10 * 60 * 1000,
  3: 15 * 60 * 1000,
  4: 25 * 60 * 1000,
  5: 40 * 60 * 1000,
};

// Called at the top of applyTick when the player has a drive-mode
// arrival pending (intra-city or inter-city). If the active vehicle
// was stolen and the roll lands, impound the car (cascade-deletes
// the in-car stash via the schema FK), clear the active link,
// scrub the travel state so the player doesn't also arrive at the
// destination, and jail them. Pure no-op otherwise.
function bustStolenDriverIfRolled(ch, now) {
  // Only matters if a drive arrival is due NOW. Intra-city uses
  // intra_travel_*; inter-city uses travel_*. We check both.
  const intraDriveDue = ch.intra_travel_until && ch.intra_travel_until <= now
                     && ch.intra_travel_to && ch.intra_travel_mode === 'drive';
  const interTravelDue = ch.travel_until && ch.travel_until <= now && ch.travel_to;
  // Inter-city drives don't store a separate "mode" field — if the
  // player has an active vehicle and a travel arrival is due, they
  // drove. (Flights null out active_vehicle_id at boarding.)
  const interDriveDue  = interTravelDue && !!ch.active_vehicle_id;
  if (!intraDriveDue && !interDriveDue) return false;
  if (!ch.active_vehicle_id) return false;

  const veh = db.prepare(`
    SELECT vo.id, vo.vehicle_id, vo.acquired_via
    FROM vehicles_owned vo
    WHERE vo.id = ?
  `).get(ch.active_vehicle_id);
  if (!veh || veh.acquired_via !== 'stolen') return false;
  if (Math.random() >= STOLEN_BUST_CHANCE_PER_DRIVE) return false;

  // Bust. Look up the vehicle catalog row for tier + display name.
  const catalogVeh = vehicleById(veh.vehicle_id);
  const tier = catalogVeh?.tier || 1;
  const jailMs = STOLEN_BUST_JAIL_BY_TIER[tier] || STOLEN_BUST_JAIL_BY_TIER[3];
  const niceName = catalogVeh ? `${catalogVeh.maker} ${catalogVeh.name}` : 'stolen car';

  // Drop the vehicle row — ON DELETE CASCADE wipes the stash rows
  // scoped to vehicle_id (anything stored in the boot/glovebox).
  db.prepare('DELETE FROM vehicles_owned WHERE id = ?').run(veh.id);
  ch.active_vehicle_id = null;

  // Tear down the in-flight travel so applyTick's arrival blocks
  // don't ALSO move the player to the destination this tick.
  ch.intra_travel_until = null;
  ch.intra_travel_to    = null;
  ch.intra_travel_mode  = null;
  ch.travel_until       = null;
  ch.travel_to          = null;

  const jailMin = Math.round(jailMs / 60000);
  applyJailSentence(ch, jailMs, `Pulled over driving a stolen ${niceName} — plates ran, car impounded.`);
  writeLog(ch.id, 'crime',
    ` Pulled over — stolen plates flagged on the ${niceName}. Car impounded, anything inside is gone. ${jailMin}m inside.`,
    { stolen_bust: true, vehicle_id: veh.vehicle_id, tier, jail_min: jailMin }, true);
  return true;
}

export function applyTick(ch) {
  const now = Date.now();
  if (!ch.last_tick) ch.last_tick = now;
  if (!ch.last_health_tick) ch.last_health_tick = now;
  if (!ch.bank_last_interest) ch.bank_last_interest = now;

  // Property bonuses inflate caps — only properties in the current city
  const bonuses = getPropertyBonuses(ch.id, ch.city);
  const baseMaxEnergy = 100 + (ch.level - 1);
  const baseMaxNerve  = 10 + Math.floor(ch.level / 9);
  const prestigeMul   = 1 + (ch.prestige || 0) * 0.02;
  ch.max_energy = Math.floor((baseMaxEnergy + bonuses.max_energy) * prestigeMul);
  ch.max_nerve  = Math.floor((baseMaxNerve  + bonuses.max_nerve)  * prestigeMul);
  ch.max_health = 100 + 5 * (ch.level - 1);

  // Energy + nerve share a 5-minute rhythm. Advance the tick timestamp only
  // by the multiple of the period actually consumed; the leftover carries
  // over to the next call.
  const energyTicks = Math.floor((now - ch.last_tick) / ENERGY_REGEN_MS);
  if (energyTicks > 0) {
    if (ch.energy < ch.max_energy) ch.energy = Math.min(ch.max_energy, ch.energy + energyTicks);
    if (ch.nerve  < ch.max_nerve)  ch.nerve  = Math.min(ch.max_nerve,  ch.nerve + energyTicks);
    ch.last_tick += energyTicks * ENERGY_REGEN_MS;
  }

  // Health uses its own 1-minute rhythm. Pause regen while in hospital.
  const inHospital = !!(ch.hospital_until && ch.hospital_until > now);
  if (inHospital) {
    // Don't accumulate health time while in hospital; resume on discharge.
    ch.last_health_tick = now;
  } else {
    const healthTicks = Math.floor((now - ch.last_health_tick) / HEALTH_REGEN_MS);
    if (healthTicks > 0) {
      if (ch.health < ch.max_health) ch.health = Math.min(ch.max_health, ch.health + healthTicks);
      ch.last_health_tick += healthTicks * HEALTH_REGEN_MS;
    }
  }

  // Hospital expired? full heal + step out onto the street. The
  // discharge transition is the only time we forcibly relocate
  // out of 'hospital' — players can voluntarily travel to the
  // building (to pay for early discharge for a friend, etc.) and
  // we don't want a passing tick to nuke that.
  if (ch.hospital_until && ch.hospital_until <= now) {
    ch.health = ch.max_health;
    ch.hospital_until = null;
    ch.hospital_reason = null;
    ch.last_health_tick = now;
    if (ch.current_location === 'hospital') forceLocation(ch, 'streets');
    writeLog(ch.id, 'hospital', ' Discharged from hospital — full health.', null, true);
  }
  // Jail expired — same: step out onto the street as part of the
  // release transition, but don't snap voluntary visits.
  if (ch.jail_until && ch.jail_until <= now) {
    ch.jail_until = null;
    ch.jail_reason = null;
    ch.jail_sentence_ms = null;
    if (ch.current_location === 'jail') forceLocation(ch, 'streets');
    writeLog(ch.id, 'jail', ' Released from jail — sentence served.', null, true);
  }
  // Stolen-car bust check — every drive arrival rolls a small
  // chance of being pulled over if the player's active vehicle was
  // boosted (acquired_via='stolen'). Hit = car impounded (cascades
  // the in-car stash), all-purpose jail term, and the travel
  // arrival is skipped (you don't land where you were going, you
  // land in a cell).
  bustStolenDriverIfRolled(ch, now);

  // Online-ordered vehicles that have reached their ETA — drop them
  // into the destination garage now. Stays in 'pending' if the garage
  // is full at delivery time; the next tick will retry.
  materializeReadyDeliveries(ch.id, now);

  // Travel arrival
  if (ch.travel_until && ch.travel_until <= now && ch.travel_to) {
    const arrivedCity = ch.travel_to;
    ch.city = arrivedCity;
    ch.travel_until = null;
    ch.travel_to = null;
    ch.travel_started_at = null;
    ch.travel_mode = null;
    // Landing in a new city dumps you on the streets — buildings
    // reset; you walk in fresh. Also wipes any stale intra-city
    // travel state from the previous city.
    forceLocation(ch, 'streets');
    writeLog(ch.id, 'travel', ` Landed in ${arrivedCity.replace(/_/g, ' ')}.`, null, true);
  }

  // Intra-city travel arrival — flips current_location to the destination.
  maybeArrive(ch, now);

  // Sync the location slug with forced states so admitted/jailed
  // characters aren't locked out of /api/hospital or /api/jail.
  // The transition OUT of either state is handled inside the
  // hospital/jail-expired blocks above (snap to streets only when
  // we're actually discharging). Voluntarily standing at either
  // building is fine and gets left alone.
  if (ch.hospital_until && ch.hospital_until > now) forceLocation(ch, 'hospital');
  else if (ch.jail_until && ch.jail_until > now)    forceLocation(ch, 'jail');
  if (!ch.current_location) ch.current_location = 'streets';

  // One-time weight migration — snaps personal carry down to the cap
  // and overflows the heaviest items into the current-city house. Safe
  // to call every tick: it bails out as soon as weight_migrated_at is
  // stamped on the row.
  if (!ch.weight_migrated_at) migrateCharacterWeights(ch);

  // Happiness floor + ceiling shifted by property bonus
  const happinessFloor = 50 + bonuses.happiness;
  if (ch.happiness < happinessFloor) ch.happiness = happinessFloor;
  if (ch.happiness > 100 + bonuses.happiness) ch.happiness = 100 + bonuses.happiness;

  // Bank interest — same leftover-preserving pattern, hourly
  const hoursElapsed = Math.floor((now - ch.bank_last_interest) / (60 * 60 * 1000));
  if (hoursElapsed >= 1 && ch.bank > 0) {
    const factor = Math.pow(1 + BANK_INTEREST_PER_HOUR, hoursElapsed);
    ch.bank = Math.floor(ch.bank * factor);
    ch.bank_last_interest += hoursElapsed * 60 * 60 * 1000;
  }

  // Overdue loan auto-default. If the due date has passed, the bank
  // compounds the principal at 5% per overdue day and tries to recover
  // from cash + bank. Players can no longer take a loan and ghost it.
  settleOverdueLoans(ch, now);

  saveCharacter(ch);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function settleOverdueLoans(ch, now) {
  const overdue = db.prepare('SELECT * FROM loans WHERE char_id = ? AND due_at <= ?').all(ch.id, now);
  for (const loan of overdue) {
    let owed = loan.principal;
    const daysOverdue = Math.floor((now - loan.due_at) / DAY_MS);
    if (daysOverdue > 0) {
      const grown = Math.floor(loan.principal * Math.pow(1.05, daysOverdue));
      if (grown > loan.principal) {
        owed = grown;
        // Roll the new due date forward and write back the swollen principal.
        db.prepare('UPDATE loans SET principal = ?, due_at = ? WHERE id = ?')
          .run(owed, now, loan.id);
        writeLog(ch.id, 'bank', `Overdue loan compounded: principal grew to £${owed.toLocaleString()} (+5%/day penalty).`);
      }
    }
    // Try to recover from cash, then bank
    if (ch.cash >= owed) {
      ch.cash -= owed;
      db.prepare('DELETE FROM loans WHERE id = ?').run(loan.id);
      writeLog(ch.id, 'bank', `Auto-paid overdue loan £${owed.toLocaleString()} from cash.`);
    } else if (ch.cash + ch.bank >= owed) {
      const fromBank = owed - ch.cash;
      ch.bank -= fromBank;
      ch.cash = 0;
      db.prepare('DELETE FROM loans WHERE id = ?').run(loan.id);
      writeLog(ch.id, 'bank', `Auto-paid overdue loan £${owed.toLocaleString()} from cash + bank.`);
    }
    // Otherwise the loan stays and keeps compounding next tick.
  }
}

const SAVE_STMT = `
  UPDATE characters SET
    name = ?, avatar = ?, avatar_image = ?, specialisation = ?, city = ?, faction = ?, gender = ?,
    level = ?, xp = ?,
    energy = ?, max_energy = ?,
    nerve = ?, max_nerve = ?,
    health = ?, max_health = ?,
    happiness = ?,
    strength = ?, defence = ?, speed = ?, intelligence = ?, driving = ?,
    reputation = ?,
    cash = ?, bank = ?, dirty_cash = ?,
    jail_until = ?, jail_reason = ?, jail_sentence_ms = ?, hospital_until = ?, hospital_reason = ?,
    travel_until = ?, travel_to = ?, travel_started_at = ?, travel_mode = ?,
    current_location = ?, intra_travel_until = ?, intra_travel_to = ?, intra_travel_mode = ?,
    last_tick = ?, last_health_tick = ?, last_daily = ?, login_streak = ?,
    bank_last_interest = ?,
    equipped_weapon = ?, equipped_armour = ?, equipped_weapon_instance = ?,
    active_vehicle_id = ?,
    prestige = ?,
    strength_buff = ?, strength_buff_at = ?,
    defence_buff = ?, defence_buff_at = ?,
    speed_buff = ?, speed_buff_at = ?,
    accuracy_buff = ?, accuracy_buff_at = ?,
    strength_progress = ?, defence_progress = ?, speed_progress = ?,
    heat = ?, heat_updated_at = ?
  WHERE id = ?
`;

// Apply a fresh jail sentence — sets jail_until, jail_reason and
// jail_sentence_ms together. Always go through this so the failed-
// escape penalty has the original sentence to double. Also resets the
// per-sentence escape-attempted gate so the player gets one fresh
// run-for-it chance on every new sentence.
export function applyJailSentence(ch, durationMs, reason) {
  const dur = Math.max(0, Math.floor(durationMs));
  ch.jail_until = Date.now() + dur;
  ch.jail_sentence_ms = dur;
  if (reason !== undefined) ch.jail_reason = reason;
  // Direct UPDATE — jail_escape_attempted isn't in SAVE_STMT so this
  // persists separately. Guarded for the brief window after deploy
  // before the inline migration in routes/jail.js has run.
  try {
    db.prepare('UPDATE characters SET jail_escape_attempted = 0 WHERE id = ?').run(ch.id);
  } catch { /* column may not exist yet on first deploy */ }
}

export function saveCharacter(ch) {
  db.prepare(SAVE_STMT).run(
    ch.name, ch.avatar, ch.avatar_image || null, ch.specialisation || null, ch.city, ch.faction || null, ch.gender || null,
    ch.level, ch.xp,
    ch.energy, ch.max_energy,
    ch.nerve, ch.max_nerve,
    ch.health, ch.max_health,
    ch.happiness,
    ch.strength, ch.defence, ch.speed, ch.intelligence, ch.driving ?? 1,
    ch.reputation,
    ch.cash, ch.bank, ch.dirty_cash,
    ch.jail_until, ch.jail_reason || null, ch.jail_sentence_ms || null,
    ch.hospital_until, ch.hospital_reason || null,
    ch.travel_until, ch.travel_to, ch.travel_started_at || null, ch.travel_mode || null,
    ch.current_location || 'streets', ch.intra_travel_until || null, ch.intra_travel_to || null, ch.intra_travel_mode || null,
    ch.last_tick, ch.last_health_tick, ch.last_daily, ch.login_streak,
    ch.bank_last_interest,
    ch.equipped_weapon, ch.equipped_armour, ch.equipped_weapon_instance ?? null,
    ch.active_vehicle_id ?? null,
    ch.prestige,
    ch.strength_buff || 0, ch.strength_buff_at || null,
    ch.defence_buff  || 0, ch.defence_buff_at  || null,
    ch.speed_buff    || 0, ch.speed_buff_at    || null,
    ch.accuracy_buff || 0, ch.accuracy_buff_at || null,
    ch.strength_progress || 0, ch.defence_progress || 0, ch.speed_progress || 0,
    ch.heat || 0, ch.heat_updated_at || null,
    ch.id,
  );
}

// Hard level cap — once reached, the player can Retire to start a
// new prestige cycle (see /api/character/retire). Five prestiges max
// stacks at +5% energy/nerve cap each.
export const MAX_LEVEL = 100;
export const MAX_PRESTIGE = 5;

// Newly-created characters are immune to PvP attacks (rob, async murder,
// live PvP) for this long. Resets when a player rolls a new character
// after a death.
export const NEW_CHAR_PROTECTION_MS = 3 * 24 * 60 * 60 * 1000;
export const NEW_CHAR_PROTECTION_DAYS = 3;
export function isNewCharProtected(ch, now = Date.now()) {
  if (!ch?.created_at) return false;
  return (now - ch.created_at) < NEW_CHAR_PROTECTION_MS;
}
// Hours until the protection lifts (rounded up). Returns 0 if expired.
export function newCharProtectionHoursLeft(ch, now = Date.now()) {
  const remaining = NEW_CHAR_PROTECTION_MS - (now - (ch?.created_at || 0));
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (60 * 60 * 1000));
}

export function awardXp(ch, xp) {
  if (ch.level >= MAX_LEVEL) { ch.xp = 0; return 0; }
  ch.xp += xp;
  let lvls = 0;
  while (ch.level < MAX_LEVEL && ch.xp >= xpForNext(ch.level)) {
    ch.xp -= xpForNext(ch.level);
    ch.level += 1;
    lvls += 1;
    // small free vital boost on level up
    ch.energy = Math.min(ch.max_energy + 5, ch.energy + 20);
    ch.health = Math.min(ch.max_health + 5, ch.health + 30);
  }
  if (ch.level >= MAX_LEVEL) ch.xp = 0;
  return lvls;
}

// Sum of all legal assets at fair value. Excludes dirty_cash by design.
// - cash + bank: face value
// - stocks: live market price × shares
// - properties: full sticker price (no depreciation)
// - businesses: 70% of computed cost (resale haircut)
export function computeNetWorth(ch) {
  let total = (ch.cash || 0) + (ch.bank || 0);

  const stocks = db.prepare('SELECT stock_id, shares FROM stocks_owned WHERE char_id = ?').all(ch.id);
  for (const s of stocks) total += Math.floor(getStockPrice(s.stock_id) * s.shares);

  const props = db.prepare('SELECT property_id FROM properties_owned WHERE char_id = ?').all(ch.id);
  for (const p of props) total += propertyById(p.property_id)?.cost || 0;

  const bizes = db.prepare('SELECT business_id, city, scale, risk, quality, level FROM businesses_owned WHERE char_id = ?').all(ch.id);
  for (const b of bizes) {
    const t = businessById(b.business_id);
    if (!t) continue;
    const stats = computeBusiness(t, b.scale, b.risk, b.quality, b.city);
    // Resale 70% of build cost + small kicker per upgrade level beyond 1
    total += Math.floor(stats.cost * 0.7 * (1 + 0.05 * (b.level - 1)));
  }

  // Vehicles: stolen cars only count at their black-market dealer rate (40%
  // of book) since you can't legally sell them; legally-owned cars use the
  // dealer trade-in rate of ~60% of book.
  const vehicles = db.prepare('SELECT vehicle_id, acquired_via FROM vehicles_owned WHERE char_id = ?').all(ch.id);
  for (const v of vehicles) {
    const def = vehicleById(v.vehicle_id);
    if (!def) continue;
    const rate = v.acquired_via === 'stolen' ? 0.40 : 0.60;
    total += Math.floor(def.bookPrice * rate);
  }
  return total;
}

// What other players are allowed to see about this character. Strictly a
// subset of publicCharacter — never returns cash/bank/equipment/buffs.
// "online" reflects the SSE stream; "active" is a coarser last-seen window
// for players idling on pages without an open EventSource.
//
// Gang badge is attached lazily to avoid a circular import — the resolver
// is supplied by routes that have services/gangs.js loaded. Pages that
// don't pass one (e.g. the rare path that doesn't care) will simply omit
// the gang field.
// Public-safe view of another character. The player's actual city is
// deliberately hidden — players have to fly somewhere and search the
// city's listings to find each other. We surface a `same_city` boolean
// so callers can render an "in your city" hint and gate same-city
// actions (rob / murder / fight / trade) without leaking location.
export function publicProfileFor(ch, viewerId = null, gangBadgeResolver = null, viewerCity = null) {
  const atMax = ch.level >= MAX_LEVEL;
  const lastActive = ch.last_active_at || 0;
  const ACTIVE_WINDOW_MS = 60 * 1000;
  const now = Date.now();
  return {
    id: ch.id,
    name: ch.name,
    avatar: ch.avatar,
    avatar_image: ch.avatar_image || null,
    same_city: viewerCity != null ? viewerCity === ch.city : null,
    level: ch.level,
    at_max_level: atMax,
    rank: rankFor(ch.reputation).name,
    reputation: ch.reputation,
    driving: ch.driving ?? 1,
    prestige: ch.prestige || 0,
    faction: ch.faction || null,
    last_active_at: lastActive || null,
    online: now - lastActive < ACTIVE_WINDOW_MS,
    is_self: viewerId != null && viewerId === ch.id,
    gang: gangBadgeResolver ? gangBadgeResolver(ch.id) : undefined,
  };
}

// Read-side gang lookup, JOINs gangs to gang_members. Returns null
// when the character isn't in a gang. Used by publicCharacter so the
// client can light up gang-only UI without a separate /gangs/me call.
function gangBadgeFor(charId) {
  const row = db.prepare(`
    SELECT g.id, g.name, g.tag, g.faction, gm.role
    FROM gang_members gm JOIN gangs g ON g.id = gm.gang_id
    WHERE gm.char_id = ?
  `).get(charId);
  if (!row) return null;
  return { id: row.id, name: row.name, tag: row.tag, faction: row.faction, role: row.role };
}

export function publicCharacter(ch) {
  const atMax = ch.level >= MAX_LEVEL;
  return {
    id: ch.id,
    name: ch.name, avatar: ch.avatar, avatar_image: ch.avatar_image || null, city: ch.city,
    level: ch.level, xp: atMax ? 0 : ch.xp, xp_to_next: atMax ? 0 : xpForNext(ch.level),
    at_max_level: atMax,
    energy: ch.energy, max_energy: ch.max_energy,
    nerve: ch.nerve, max_nerve: ch.max_nerve,
    health: ch.health, max_health: ch.max_health,
    happiness: ch.happiness,
    strength: ch.strength, defence: ch.defence, speed: ch.speed, intelligence: ch.intelligence,
    driving: ch.driving ?? 1,
    specialisation: ch.specialisation || null,
    stat_caps: STAT_CAPS,
    buffs: buffSnapshot(ch),
    reputation: ch.reputation, rank: rankFor(ch.reputation).name,
    cash: ch.cash, bank: ch.bank, dirty_cash: ch.dirty_cash,
    net_worth: computeNetWorth(ch),
    jail_until: ch.jail_until, jail_reason: ch.jail_reason || null,
    hospital_until: ch.hospital_until, hospital_reason: ch.hospital_reason || null,
    travel_until: ch.travel_until, travel_to: ch.travel_to,
    travel_started_at: ch.travel_started_at || null,
    travel_mode: ch.travel_mode || null,
    current_location:   ch.current_location || 'streets',
    // Looked-up name + route + gated flag for the current slug so
    // the nav can render a one-tap "go to where I'm standing"
    // chip without round-tripping /api/locations.
    current_location_meta: (() => {
      const slug = ch.current_location || 'streets';
      const m = locationMeta(slug);
      return m ? { slug, name: m.name, route: m.route, gated: !!m.gated } : null;
    })(),
    intra_travel_until: ch.intra_travel_until || null,
    intra_travel_to:    ch.intra_travel_to    || null,
    intra_travel_mode:  ch.intra_travel_mode  || null,
    equipped_weapon: ch.equipped_weapon, equipped_armour: ch.equipped_armour,
    equipped_weapon_instance: ch.equipped_weapon_instance ?? null,
    active_vehicle_id: ch.active_vehicle_id ?? null,
    // Premium car the character is currently driving (premium catalogue
    // id, e.g. 'premium_koenigsegg_jesko'). Mutually exclusive with
    // active_vehicle_id at the equip layer; both can be NULL when on foot.
    active_premium_vehicle_id: ch.active_premium_vehicle_id ?? null,
    status: ch.status || 'alive',
    login_streak: ch.login_streak, last_daily: ch.last_daily,
    prestige: ch.prestige,
    faction: ch.faction || null,
    gender: ch.gender || null,
    // Lightweight gang badge — id/name/tag/role — so the client can
    // gate gang-only actions (territory capture, gang chat, etc.)
    // without an extra round-trip on every page.
    gang: gangBadgeFor(ch.id),
    // Live, decayed heat — computed fresh from the stored snapshot so
    // the dashboard ticks down as the player idles.
    heat: Math.round(effectiveHeat(ch)),
    // Pending-trial lockout flag — App.jsx redirects into /trial when
    // this is true so the player can't carry on with crime while a
    // case is filed against them. Cleared automatically when the trial
    // resolves (plead / acquitted / convicted).
    pending_trial: hasPendingTrial(ch.id),
    // Gold Bars — premium currency, lives on the user account. Surfaced
    // here so the Nav top-bar widget reads it from the same refresh
    // cycle as cash / energy / etc.
    premium_points: ch.premium_points || 0,
    is_admin: !!ch.is_admin,
    // Equipped clothing — parsed JSON map of slot → item_id. The
    // wardrobe page / dashboard / player profile uses this to render
    // the cosmetic outfit. Empty {} when nothing is on.
    equipped_clothing: (() => {
      if (!ch.equipped_clothing) return {};
      try { return JSON.parse(ch.equipped_clothing) || {}; }
      catch { return {}; }
    })(),
    // Internet status — { online, reason } where reason is 'phone' /
    // 'laptop_home' / 'laptop_car' / null. The client uses this to
    // unlock the Online page and gate things like the bank app.
    internet: internetStatus(ch),
  };
}
