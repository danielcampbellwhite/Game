// Loadouts — named gear snapshots. Save the player's current
// equipment / vehicle / personal-inventory state under a name; apply
// it later to re-equip whatever's still owned. Inventory snapshot is
// informational — apply doesn't auto-gather from house/vehicle stash.
// Players can do that manually via /api/inventory/transfer.

import { db } from '../db.js';
import { weaponById, armourById, ammoById, drugById, miscItemById, vehicleById } from '../data.js';

const MAX_LOADOUTS_PER_CHAR = 10;

function ownsWeapon(charId, itemId) {
  if (itemId === 'fists') return true;
  const r = db.prepare("SELECT 1 FROM inventory WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").get(charId, itemId);
  return !!r;
}
function ownsArmour(charId, itemId) {
  if (itemId === 'none') return true;
  const r = db.prepare("SELECT 1 FROM inventory WHERE char_id = ? AND kind = 'armour' AND item_id = ?").get(charId, itemId);
  return !!r;
}
function vehicleRow(charId, vehicleRowId) {
  return db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(vehicleRowId, charId);
}

function resolveItemName(kind, itemId) {
  if (kind === 'weapon') return weaponById(itemId)?.name || itemId;
  if (kind === 'armour') return armourById(itemId)?.name || itemId;
  if (kind === 'ammo')   return ammoById(itemId)?.name   || itemId;
  if (kind === 'drug')   return drugById(itemId)?.name   || itemId;
  if (kind === 'misc')   return miscItemById(itemId)?.name || itemId;
  return itemId;
}

// Snapshot the character's current state under `name`. Overwrites a
// loadout with the same name on the same character (so re-saving with
// the same name is "update"). Returns { ok, loadout } or { error }.
export function saveLoadout(ch, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { error: 'Loadout name required.' };
  if (trimmed.length > 32) return { error: 'Loadout name too long (max 32 chars).' };

  // Cap headcount per character so the list stays manageable. Only
  // counts NEW saves — overwriting an existing name is always fine.
  const existing = db.prepare('SELECT id FROM loadouts WHERE char_id = ? AND name = ?').get(ch.id, trimmed);
  if (!existing) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM loadouts WHERE char_id = ?').get(ch.id).n;
    if (total >= MAX_LOADOUTS_PER_CHAR) {
      return { error: `Loadout cap reached (${MAX_LOADOUTS_PER_CHAR}). Delete one first.` };
    }
  }

  const inv = db.prepare("SELECT kind, item_id, qty FROM inventory WHERE char_id = ? ORDER BY kind, item_id").all(ch.id);
  const items_json = JSON.stringify(inv);

  const now = Date.now();
  if (existing) {
    db.prepare(`
      UPDATE loadouts SET weapon = ?, armour = ?, vehicle_id = ?, items_json = ?, created_at = ?
      WHERE id = ?
    `).run(ch.equipped_weapon || 'fists', ch.equipped_armour || 'none', ch.active_vehicle_id || null, items_json, now, existing.id);
    return { ok: true, id: existing.id, updated: true };
  } else {
    const r = db.prepare(`
      INSERT INTO loadouts (char_id, name, weapon, armour, vehicle_id, items_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ch.id, trimmed, ch.equipped_weapon || 'fists', ch.equipped_armour || 'none', ch.active_vehicle_id || null, items_json, now);
    return { ok: true, id: r.lastInsertRowid, updated: false };
  }
}

export function listLoadouts(charId) {
  const rows = db.prepare('SELECT * FROM loadouts WHERE char_id = ? ORDER BY created_at DESC').all(charId);
  return rows.map(decorate);
}

export function getLoadout(charId, id) {
  const row = db.prepare('SELECT * FROM loadouts WHERE char_id = ? AND id = ?').get(charId, id);
  return row ? decorate(row) : null;
}

function decorate(row) {
  let items = [];
  try { items = JSON.parse(row.items_json || '[]'); } catch { items = []; }
  const itemsDecorated = items.map(it => ({
    ...it,
    name: resolveItemName(it.kind, it.item_id),
  }));
  const weapon  = row.weapon ? weaponById(row.weapon) : null;
  const armour  = row.armour ? armourById(row.armour) : null;
  // Vehicle metadata lookup — gracefully tolerates a deleted car
  // (vehicle_id IS NULL'd by the FK). We expose just the row id and
  // catalogue id/name; the client renders "vehicle gone" for nulls.
  let vehicle = null;
  if (row.vehicle_id) {
    const v = db.prepare('SELECT vehicle_id, city, shipping_until FROM vehicles_owned WHERE id = ?').get(row.vehicle_id);
    if (v) {
      const meta = vehicleById(v.vehicle_id);
      vehicle = {
        row_id: row.vehicle_id,
        vehicle_id: v.vehicle_id,
        name: meta ? `${meta.maker} ${meta.name}` : v.vehicle_id,
        tier: meta?.tier || null,
        city: v.city,
        shipping_until: v.shipping_until || null,
      };
    }
  }
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    weapon: row.weapon,
    weapon_name: weapon?.name || row.weapon,
    armour: row.armour,
    armour_name: armour?.name || row.armour,
    vehicle,
    item_count: itemsDecorated.length,
    items: itemsDecorated,
  };
}

// Apply a loadout: equip the saved weapon/armour if still owned, set
// the active vehicle if still owned and ready. Returns
// { ok, applied: [], skipped: [{ kind, reason }] }.
export function applyLoadout(ch, id) {
  const row = db.prepare('SELECT * FROM loadouts WHERE char_id = ? AND id = ?').get(ch.id, id);
  if (!row) return { error: 'Loadout not found.' };

  const applied = [];
  const skipped = [];

  // Weapon
  if (row.weapon && row.weapon !== ch.equipped_weapon) {
    if (ownsWeapon(ch.id, row.weapon)) {
      ch.equipped_weapon = row.weapon;
      applied.push({ kind: 'weapon', item: row.weapon, name: weaponById(row.weapon)?.name || row.weapon });
    } else {
      skipped.push({ kind: 'weapon', item: row.weapon, reason: 'not owned' });
    }
  }

  // Armour
  if (row.armour && row.armour !== ch.equipped_armour) {
    if (ownsArmour(ch.id, row.armour)) {
      ch.equipped_armour = row.armour;
      applied.push({ kind: 'armour', item: row.armour, name: armourById(row.armour)?.name || row.armour });
    } else {
      skipped.push({ kind: 'armour', item: row.armour, reason: 'not owned' });
    }
  }

  // Vehicle — must still be owned, sitting in the player's current
  // city, and not in transit. Otherwise skipped with a reason the UI
  // can render directly.
  if (row.vehicle_id && row.vehicle_id !== ch.active_vehicle_id) {
    const v = vehicleRow(ch.id, row.vehicle_id);
    const now = Date.now();
    if (!v) {
      skipped.push({ kind: 'vehicle', reason: 'sold or chopped' });
    } else if (v.shipping_until && v.shipping_until > now) {
      skipped.push({ kind: 'vehicle', reason: 'in transit' });
    } else if (v.city !== ch.city) {
      skipped.push({ kind: 'vehicle', reason: `in ${v.city.replace(/_/g, ' ')}` });
    } else {
      ch.active_vehicle_id = row.vehicle_id;
      // Reset the premium-active flag — only one drive at a time, and
      // applying a regular-vehicle loadout means we're stepping out of
      // the premium car. Matches the equip-vehicle behaviour elsewhere.
      ch.active_premium_vehicle_id = null;
      const meta = vehicleById(v.vehicle_id);
      applied.push({ kind: 'vehicle', name: meta ? `${meta.maker} ${meta.name}` : v.vehicle_id });
    }
  }

  return { ok: true, applied, skipped };
}

export function deleteLoadout(charId, id) {
  const r = db.prepare('DELETE FROM loadouts WHERE char_id = ? AND id = ?').run(charId, id);
  return { ok: r.changes > 0 };
}
