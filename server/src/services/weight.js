// Per-item weights + container caps for the weighted-inventory system.
//
// Weights are derived from item category, NOT a per-row field on every
// catalog entry. Keeps the catalogues in data.js untouched and lets
// game design tune carry weights from one place. Reasonable real-world
// approximations in kg:
//
//   pistol      ≈ 1 kg          rifle  ≈ 4 kg
//   revolver    ≈ 1.2 kg        sniper ≈ 7 kg
//   smg         ≈ 3 kg          shotgun≈ 3.5 kg
//   melee       ≈ 1 kg (fists 0)
//   armour      from a small per-id table
//   ammo        per-round, by calibre
//   drug        per dose (effectively grams)
//   misc        flat 0.2 kg unless overridden
//
// Container caps:
//   personal — flat 30 kg. Strength is reserved for future scaling.
//   house    — flat 5000 kg per city.
//
// Vehicle cargo will land in a follow-up commit; not modelled here yet.

import { db } from '../db.js';

export const PERSONAL_CAP_KG = 30;
export const HOUSE_CAP_KG    = 5000;

// Vehicle cargo cap by tier. SUVs / luxury get the biggest boots;
// supercars and hypercars are sportier and carry less. The active
// vehicle's cap is what counts — premium / Gold-Bar cars have no
// cargo for now (treated as no-cap when active).
const VEHICLE_CARGO_KG_BY_TIER = {
  1:  80,   // beater / subcompact
  2: 120,   // compact sedan
  3: 200,   // hot hatch / mid SUV
  4: 150,   // premium / performance
  5: 250,   // luxury
  6:  80,   // exotic / supercar
  7: 100,   // hypercar / ultra-lux
};
export function vehicleCargoCapKg(tier) {
  return VEHICLE_CARGO_KG_BY_TIER[tier] || 100;
}

const WEAPON_WEIGHT_BY_CATEGORY = {
  melee:   1.0,
  pistol:  1.0,
  revolver:1.2,
  smg:     3.0,
  rifle:   4.0,
  shotgun: 3.5,
  sniper:  7.0,
};

// Fists is the no-weapon default; carry weight 0 by design.
const WEAPON_WEIGHT_OVERRIDES = {
  fists: 0,
};

const ARMOUR_WEIGHT = {
  none:      0,
  leather:   3,
  kevlar:    6,
  tactical: 10,
  composite:15,
};

const AMMO_WEIGHT_PER_ROUND = {
  '9mm':    0.012,
  '45acp':  0.015,
  '357':    0.018,
  'shells': 0.045,
  '556':    0.013,
  '762':    0.025,
  '308':    0.026,
  '50cal':  0.115,
};

// Drug "weight" is the practical street dose. Players are carrying
// pre-cut grams and the heaviest things (heroin, meth) are slightly
// bulkier per dose.
const DRUG_WEIGHT_PER_UNIT = {
  weed:    0.003,
  mdma:    0.0005,
  cocaine: 0.002,
  meth:    0.002,
  heroin:  0.002,
};

const MISC_WEIGHT_DEFAULT = 0.2;
// A few obvious overrides keep mundane consumables sensible — feel
// free to add per-id tweaks here as needed.
const MISC_WEIGHT_OVERRIDES = {
  flowers:        0.3,
  chocolate_box:  0.3,
  coffee:         0.1,
  energy_drink:   0.3,
  cigar:          0.05,
  whisky:         0.7,
  sandwich:       0.3,
  painkillers:    0.05,
  lottery_ticket: 0.01,
  burner_phone:   0.15,
  smartphone:     0.2,
  laptop:         1.6,
};

// Lookup imports — done lazily inside the function to dodge any cyclic
// import risk with data.js / character.js.
import { weaponById, ammoById } from '../data.js';

// Returns kg for one unit of (kind, item_id). Unknown rows fall back
// to MISC_WEIGHT_DEFAULT so a misconfigured catalogue can't crash the
// inventory page.
export function itemWeight(kind, itemId) {
  switch (kind) {
    case 'weapon': {
      if (itemId in WEAPON_WEIGHT_OVERRIDES) return WEAPON_WEIGHT_OVERRIDES[itemId];
      const w = weaponById(itemId);
      const cat = w?.category;
      return WEAPON_WEIGHT_BY_CATEGORY[cat] ?? 1.5;
    }
    case 'armour':
      return ARMOUR_WEIGHT[itemId] ?? 5;
    case 'ammo': {
      // AMMO_WEIGHT keyed by ammo id directly (matches AMMO[].id).
      return AMMO_WEIGHT_PER_ROUND[itemId] ?? 0.02;
    }
    case 'drug':
      return DRUG_WEIGHT_PER_UNIT[itemId] ?? 0.002;
    case 'misc':
      return MISC_WEIGHT_OVERRIDES[itemId] ?? MISC_WEIGHT_DEFAULT;
    default:
      return MISC_WEIGHT_DEFAULT;
  }
}

// Sum of weights of every row in personal inventory.
export function personalWeight(charId) {
  const rows = db.prepare(
    'SELECT kind, item_id, qty FROM inventory WHERE char_id = ?'
  ).all(charId);
  let total = 0;
  for (const r of rows) total += itemWeight(r.kind, r.item_id) * r.qty;
  return total;
}

// Sum of weights of every row in a specific house stash (city-scoped).
// Total weight in a specific property's stash. Each property gets
// its own cap; callers pass the property_owned_id, not the city.
export function houseStashWeight(charId, propertyOwnedId) {
  if (!propertyOwnedId) return 0;
  const rows = db.prepare(
    "SELECT kind, item_id, qty FROM stash WHERE char_id = ? AND container = 'house' AND property_owned_id = ?"
  ).all(charId, propertyOwnedId);
  let total = 0;
  for (const r of rows) total += itemWeight(r.kind, r.item_id) * r.qty;
  return total;
}

// True iff the character owns at least one property in the given city.
export function hasHouseIn(charId, city) {
  if (!city) return false;
  const r = db.prepare(
    'SELECT 1 FROM properties_owned WHERE char_id = ? AND city = ? LIMIT 1'
  ).get(charId, city);
  return !!r;
}

// Personal inventory rows annotated with per-unit weight for the
// Inventory UI. Used by routes/inventory.js.
export function listPersonal(charId) {
  const rows = db.prepare(
    'SELECT kind, item_id, qty, ammo FROM inventory WHERE char_id = ? ORDER BY kind, item_id'
  ).all(charId);
  return rows.map(r => ({ ...r, unit_kg: itemWeight(r.kind, r.item_id) }));
}

// Lists the stash held INSIDE a specific property (not a city-wide
// pool). Caller resolves which property to query from
// current_location ('home_<row_id>') when the player is at home.
export function listHouseStash(charId, propertyOwnedId) {
  if (!propertyOwnedId) return [];
  const rows = db.prepare(
    "SELECT kind, item_id, qty, ammo FROM stash WHERE char_id = ? AND container = 'house' AND property_owned_id = ? ORDER BY kind, item_id"
  ).all(charId, propertyOwnedId);
  return rows.map(r => ({ ...r, unit_kg: itemWeight(r.kind, r.item_id) }));
}

// Manual upsert — see comment on upsertVehicleStash for the
// NULL-aware reasoning.
function upsertHouseStash(charId, propertyOwnedId, city, kind, itemId, addQty) {
  const r = db.prepare(
    "SELECT id FROM stash WHERE char_id = ? AND container = 'house' AND property_owned_id = ? AND kind = ? AND item_id = ?"
  ).get(charId, propertyOwnedId, kind, itemId);
  if (r) {
    db.prepare('UPDATE stash SET qty = qty + ? WHERE id = ?').run(addQty, r.id);
  } else {
    db.prepare(
      "INSERT INTO stash (char_id, container, city, property_owned_id, vehicle_id, kind, item_id, qty, ammo) VALUES (?, 'house', ?, ?, NULL, ?, ?, ?, 0)"
    ).run(charId, city, propertyOwnedId, kind, itemId, addQty);
  }
}
function upsertVehicleStash(charId, vehicleId, kind, itemId, addQty) {
  const r = db.prepare(
    "SELECT id FROM stash WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ? AND kind = ? AND item_id = ?"
  ).get(charId, vehicleId, kind, itemId);
  if (r) {
    db.prepare('UPDATE stash SET qty = qty + ? WHERE id = ?').run(addQty, r.id);
  } else {
    db.prepare(
      "INSERT INTO stash (char_id, container, city, vehicle_id, kind, item_id, qty, ammo) VALUES (?, 'vehicle', NULL, ?, ?, ?, ?, 0)"
    ).run(charId, vehicleId, kind, itemId, addQty);
  }
}

export function vehicleStashWeight(charId, vehicleRowId) {
  if (!vehicleRowId) return 0;
  const rows = db.prepare(
    "SELECT kind, item_id, qty FROM stash WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ?"
  ).all(charId, vehicleRowId);
  let total = 0;
  for (const r of rows) total += itemWeight(r.kind, r.item_id) * r.qty;
  return total;
}

export function listVehicleStash(charId, vehicleRowId) {
  if (!vehicleRowId) return [];
  const rows = db.prepare(
    "SELECT kind, item_id, qty, ammo FROM stash WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ? ORDER BY kind, item_id"
  ).all(charId, vehicleRowId);
  return rows.map(r => ({ ...r, unit_kg: itemWeight(r.kind, r.item_id) }));
}

// Returns extra kg this purchase would add. Used by the buy gates so
// they can reject before the row hits the DB.
export function purchaseWeight(kind, itemId, qty) {
  return itemWeight(kind, itemId) * qty;
}

// True iff adding `extraKg` to personal would still fit under the cap.
export function personalHasRoomFor(charId, extraKg) {
  return personalWeight(charId) + extraKg <= PERSONAL_CAP_KG + 1e-6;
}

// Move qty of (kind, item_id) between personal / house / vehicle.
// Caller passes `city` for house-side operations and `vehicleId` (a
// vehicles_owned.id) for vehicle-side operations. The caller is
// responsible for the higher-level "you must be in this city / this
// is your active vehicle" checks; this is the SQL-level mover.
// Move items between containers. House stash is scoped per property
// (propertyOwnedId) rather than city — multiple homes in the same
// city no longer share one bucket. `city` is still passed through so
// the stash row carries the city tag for indexing / display.
export function transfer(charId, kind, itemId, qty, ammo, from, to, city, vehicleId, vehicleTier, propertyOwnedId) {
  if (qty <= 0) return { error: 'Quantity must be positive.' };
  if (from === to) return { error: 'Source and destination are the same.' };

  const isPersonal = (loc) => loc === 'personal';
  const isHouse    = (loc) => loc === 'house';
  const isVehicle  = (loc) => loc === 'vehicle';

  // SRC read
  let have = 0;
  if (isPersonal(from)) {
    const r = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(charId, kind, itemId);
    have = r?.qty || 0;
  } else if (isHouse(from)) {
    if (!propertyOwnedId) return { error: 'House requires a specific property.' };
    const r = db.prepare("SELECT qty FROM stash WHERE char_id = ? AND container = 'house' AND property_owned_id = ? AND kind = ? AND item_id = ?").get(charId, propertyOwnedId, kind, itemId);
    have = r?.qty || 0;
  } else if (isVehicle(from)) {
    if (!vehicleId) return { error: 'Vehicle required.' };
    const r = db.prepare("SELECT qty FROM stash WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ? AND kind = ? AND item_id = ?").get(charId, vehicleId, kind, itemId);
    have = r?.qty || 0;
  } else {
    return { error: 'Unknown source container.' };
  }
  if (have < qty) return { error: `You only have ${have} to move.` };

  // DST cap check
  const extra = itemWeight(kind, itemId) * qty;
  if (isPersonal(to)) {
    if (!personalHasRoomFor(charId, extra)) {
      return { error: 'No room in your personal carry — drop weight first.' };
    }
  } else if (isHouse(to)) {
    if (!propertyOwnedId) return { error: 'House requires a specific property.' };
    if (houseStashWeight(charId, propertyOwnedId) + extra > HOUSE_CAP_KG + 1e-6) {
      return { error: 'This property\'s storage is full.' };
    }
  } else if (isVehicle(to)) {
    if (!vehicleId) return { error: 'Vehicle required.' };
    const cap = vehicleCargoCapKg(vehicleTier);
    if (vehicleStashWeight(charId, vehicleId) + extra > cap + 1e-6) {
      return { error: `Vehicle cargo full (${cap}kg cap).` };
    }
  } else {
    return { error: 'Unknown destination container.' };
  }

  db.exec('BEGIN');
  try {
    if (isPersonal(from)) {
      db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?')
        .run(qty, charId, kind, itemId);
      db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ? AND qty <= 0')
        .run(charId, kind, itemId);
    } else if (isHouse(from)) {
      db.prepare("UPDATE stash SET qty = qty - ? WHERE char_id = ? AND container = 'house' AND property_owned_id = ? AND kind = ? AND item_id = ?")
        .run(qty, charId, propertyOwnedId, kind, itemId);
      db.prepare("DELETE FROM stash WHERE char_id = ? AND container = 'house' AND property_owned_id = ? AND kind = ? AND item_id = ? AND qty <= 0")
        .run(charId, propertyOwnedId, kind, itemId);
    } else if (isVehicle(from)) {
      db.prepare("UPDATE stash SET qty = qty - ? WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ? AND kind = ? AND item_id = ?")
        .run(qty, charId, vehicleId, kind, itemId);
      db.prepare("DELETE FROM stash WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ? AND kind = ? AND item_id = ? AND qty <= 0")
        .run(charId, vehicleId, kind, itemId);
    }
    if (isPersonal(to)) {
      db.prepare(`
        INSERT INTO inventory (char_id, kind, item_id, qty, ammo) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
      `).run(charId, kind, itemId, qty);
    } else if (isHouse(to)) {
      upsertHouseStash(charId, propertyOwnedId, city, kind, itemId, qty);
    } else if (isVehicle(to)) {
      upsertVehicleStash(charId, vehicleId, kind, itemId, qty);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return { error: e.message || 'Transfer failed.' };
  }

  return { ok: true };
}

// One-time migration. Walks every character whose weight_migrated_at
// is NULL, snaps their personal carry to the cap, and overflows the
// heaviest items into the house stash in their current city. If no
// house exists in that city, overflow VANISHES (per the player's call
// on the snap-or-vanish choice). Idempotent: stamps the timestamp
// when done so re-runs are no-ops.
export function migrateCharacterWeights(ch) {
  if (ch.weight_migrated_at) return;

  const charId = ch.id;
  const total = personalWeight(charId);
  if (total <= PERSONAL_CAP_KG + 1e-6) {
    db.prepare('UPDATE characters SET weight_migrated_at = ? WHERE id = ?').run(Date.now(), charId);
    ch.weight_migrated_at = Date.now();
    return;
  }

  // Need to shed (total - cap) kg. Sort items by unit weight DESC so
  // the chunkiest items leave first — frees the most weight fastest.
  const rows = db.prepare(
    'SELECT kind, item_id, qty, ammo FROM inventory WHERE char_id = ?'
  ).all(charId);
  rows.sort((a, b) => itemWeight(b.kind, b.item_id) - itemWeight(a.kind, a.item_id));

  const targetCity = ch.city;
  // Pick the first property in the target city as the dump
  // destination — house stash is per-property now, so we have to
  // commit to a specific row rather than the city pool.
  const firstHome = db.prepare(
    'SELECT id FROM properties_owned WHERE char_id = ? AND city = ? ORDER BY id ASC LIMIT 1'
  ).get(charId, targetCity);
  const sendHome = !!firstHome;
  const homePropertyId = firstHome?.id || null;

  let kept = total;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      if (kept <= PERSONAL_CAP_KG + 1e-6) break;
      const unit = itemWeight(r.kind, r.item_id);
      if (unit <= 0) continue;

      const excessKg = kept - PERSONAL_CAP_KG;
      const moveQty  = Math.min(r.qty, Math.ceil(excessKg / unit));
      if (moveQty <= 0) continue;

      db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?')
        .run(moveQty, charId, r.kind, r.item_id);
      db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ? AND qty <= 0')
        .run(charId, r.kind, r.item_id);

      if (sendHome) upsertHouseStash(charId, homePropertyId, targetCity, r.kind, r.item_id, moveQty);
      kept -= unit * moveQty;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  db.prepare('UPDATE characters SET weight_migrated_at = ? WHERE id = ?').run(Date.now(), charId);
  ch.weight_migrated_at = Date.now();
}
