import { db } from '../db.js';
import { weaponById, applyMods, vehicleById, applyVehicleMods, isVehicleModified } from '../data.js';

// ── Weapon instance helpers ─────────────────────────────────────────

export function loadWeaponInstance(id) {
  if (id == null) return null;
  return db.prepare('SELECT * FROM weapon_instances WHERE id = ?').get(id);
}

export function loadCharWeaponInstances(charId) {
  return db.prepare('SELECT * FROM weapon_instances WHERE owner_id = ? ORDER BY id ASC').all(charId);
}

// What weapon does this character actually have equipped, with mods
// applied? Falls through to the stock catalogue lookup if no instance
// is set or the instance reference is stale (e.g. instance was deleted
// after the column was set).
//
// Returns: { id, name, maker?, category, dmg, accuracy, ammoType,
//            is_modified, mods, instance_id? } or null.
export function effectiveEquippedWeapon(ch) {
  if (ch.equipped_weapon_instance) {
    const inst = loadWeaponInstance(ch.equipped_weapon_instance);
    if (inst && inst.owner_id === ch.id) {
      const base = weaponById(inst.base_item_id);
      if (base) {
        const stats = applyMods(base, inst.mods_json);
        return { ...stats, instance_id: inst.id };
      }
    }
  }
  const w = weaponById(ch.equipped_weapon);
  if (!w) return null;
  return { ...w, accuracy: 0, is_modified: false, mods: [] };
}

// Decrement (or delete) one unit of `base_item_id` from a player's
// weapon inventory stack. Throws if the player has none. Used when
// promoting a stack item into a per-instance modded row.
export function takeOneFromWeaponStack(charId, baseItemId) {
  const row = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").get(charId, baseItemId);
  if (!row || row.qty < 1) throw new Error('No stock weapon of that type to promote.');
  if (row.qty === 1) {
    db.prepare("DELETE FROM inventory WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").run(charId, baseItemId);
  } else {
    db.prepare("UPDATE inventory SET qty = qty - 1 WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").run(charId, baseItemId);
  }
}

// Add one unit of `base_item_id` back to the player's weapon stack
// (used when a modded instance becomes empty and demotes back to stock).
export function returnOneToWeaponStack(charId, baseItemId) {
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty)
    VALUES (?, 'weapon', ?, 1)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + 1
  `).run(charId, baseItemId);
}

// ── Vehicle helpers ─────────────────────────────────────────────────

export function loadVehicleRow(id) {
  return db.prepare('SELECT * FROM vehicles_owned WHERE id = ?').get(id);
}

export function loadCharVehicles(charId) {
  return db.prepare('SELECT * FROM vehicles_owned WHERE char_id = ? ORDER BY id DESC').all(charId);
}

// Hydrate a vehicles_owned row with its catalogue base + mod-applied
// stats. Returns null if the catalogue entry has gone missing.
export function decorateVehicleRow(row) {
  const base = vehicleById(row.vehicle_id);
  if (!base) return null;
  const stats = applyVehicleMods(base, row.mods_json);
  return {
    id: row.id,
    vehicle_id: base.id,
    name: base.name,
    maker: base.maker,
    tier: base.tier,
    base_book_price: stats.base_book_price,
    book_price: stats.bookPrice,
    value_delta: stats.value_delta,
    power: stats.power,
    handling: stats.handling,
    is_modified: stats.is_modified,
    mods: stats.mods,
    mods_json: row.mods_json,
    acquired_via: row.acquired_via,
    city: row.city,
  };
}

export { isVehicleModified };
