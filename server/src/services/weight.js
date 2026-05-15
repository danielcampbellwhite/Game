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
export function houseStashWeight(charId, city) {
  const rows = db.prepare(
    "SELECT kind, item_id, qty FROM stash WHERE char_id = ? AND container = 'house' AND city = ?"
  ).all(charId, city);
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

export function listHouseStash(charId, city) {
  const rows = db.prepare(
    "SELECT kind, item_id, qty, ammo FROM stash WHERE char_id = ? AND container = 'house' AND city = ? ORDER BY kind, item_id"
  ).all(charId, city);
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

// Move qty of (kind, item_id) between personal and house. Returns
// { ok, error? }. Caller is responsible for the higher-level "you must
// be in this city" check; this is the SQL-level mover.
export function transfer(charId, kind, itemId, qty, ammo, from, to, city) {
  if (qty <= 0) return { error: 'Quantity must be positive.' };
  if (from === to) return { error: 'Source and destination are the same.' };

  const isPersonal = (loc) => loc === 'personal';
  const isHouse    = (loc) => loc === 'house';

  // SRC read
  let have = 0;
  let haveAmmo = 0;
  if (isPersonal(from)) {
    const r = db.prepare('SELECT qty, ammo FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(charId, kind, itemId);
    have = r?.qty || 0; haveAmmo = r?.ammo || 0;
  } else if (isHouse(from)) {
    if (!city) return { error: 'House requires a city.' };
    const r = db.prepare("SELECT qty, ammo FROM stash WHERE char_id = ? AND container = 'house' AND city = ? AND kind = ? AND item_id = ?").get(charId, city, kind, itemId);
    have = r?.qty || 0; haveAmmo = r?.ammo || 0;
  } else {
    return { error: 'Unknown source container.' };
  }
  if (have < qty) return { error: `You only have ${have} to move.` };

  // DST cap check
  if (isPersonal(to)) {
    const extra = itemWeight(kind, itemId) * qty;
    if (!personalHasRoomFor(charId, extra)) {
      return { error: 'No room in your personal carry — drop weight first.' };
    }
  } else if (isHouse(to)) {
    if (!city) return { error: 'House requires a city.' };
    const extra = itemWeight(kind, itemId) * qty;
    if (houseStashWeight(charId, city) + extra > HOUSE_CAP_KG + 1e-6) {
      return { error: 'House storage is full.' };
    }
  } else {
    return { error: 'Unknown destination container.' };
  }

  // node:sqlite doesn't expose better-sqlite3's `db.transaction(fn)`
  // helper, so a manual BEGIN/COMMIT/ROLLBACK pair gives us atomicity.
  db.exec('BEGIN');
  try {
    // SRC decrement
    if (isPersonal(from)) {
      db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?')
        .run(qty, charId, kind, itemId);
      db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ? AND qty <= 0')
        .run(charId, kind, itemId);
    } else {
      db.prepare("UPDATE stash SET qty = qty - ? WHERE char_id = ? AND container = 'house' AND city = ? AND kind = ? AND item_id = ?")
        .run(qty, charId, city, kind, itemId);
      db.prepare("DELETE FROM stash WHERE char_id = ? AND container = 'house' AND city = ? AND kind = ? AND item_id = ? AND qty <= 0")
        .run(charId, city, kind, itemId);
    }
    // DST insert / increment
    if (isPersonal(to)) {
      db.prepare(`
        INSERT INTO inventory (char_id, kind, item_id, qty, ammo) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
      `).run(charId, kind, itemId, qty);
    } else {
      db.prepare(`
        INSERT INTO stash (char_id, container, city, kind, item_id, qty, ammo) VALUES (?, 'house', ?, ?, ?, ?, 0)
        ON CONFLICT(char_id, container, city, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
      `).run(charId, city, kind, itemId, qty);
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
  const sendHome = hasHouseIn(charId, targetCity);

  let kept = total;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      if (kept <= PERSONAL_CAP_KG + 1e-6) break;
      const unit = itemWeight(r.kind, r.item_id);
      if (unit <= 0) continue;

      // Move as many units as needed to fall under the cap, capped at
      // qty in this row. Then either deposit to house or void.
      const excessKg = kept - PERSONAL_CAP_KG;
      const moveQty  = Math.min(r.qty, Math.ceil(excessKg / unit));
      if (moveQty <= 0) continue;

      db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?')
        .run(moveQty, charId, r.kind, r.item_id);
      db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ? AND qty <= 0')
        .run(charId, r.kind, r.item_id);

      if (sendHome) {
        db.prepare(`
          INSERT INTO stash (char_id, container, city, kind, item_id, qty, ammo) VALUES (?, 'house', ?, ?, ?, ?, 0)
          ON CONFLICT(char_id, container, city, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
        `).run(charId, targetCity, r.kind, r.item_id, moveQty);
      }
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
