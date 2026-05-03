// Generic item-requirement helpers — used by crimes (and anywhere else
// that wants to gate an action on the player having specific inventory
// items, optionally consuming them on commit).
//
// A `requires` entry looks like:
//   { kind: 'misc', item_id: 'atm_skimmer', qty: 1, consumed: true }
//
// `kind` matches the inventory.kind column ('misc', 'weapon', 'ammo',
// 'armour', 'drug'). `consumed: true` means the item is destroyed on
// commit even if the action fails.

import { db } from '../db.js';
import { miscItemById, weaponById, armourById, ammoById, drugById } from '../data.js';

function resolveItemMeta(kind, itemId) {
  switch (kind) {
    case 'misc':   return miscItemById(itemId);
    case 'weapon': return weaponById(itemId);
    case 'armour': return armourById(itemId);
    case 'ammo':   return ammoById(itemId);
    case 'drug':   return drugById(itemId);
    default:       return null;
  }
}

function ownedQty(charId, kind, itemId) {
  const r = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?')
    .get(charId, kind, itemId);
  return r?.qty || 0;
}

// Returns { ok, missing: [{ kind, item_id, name, need, have }] }.
// `requires` may be undefined / empty — both treated as "no requirements".
export function checkRequirements(charId, requires) {
  if (!requires || requires.length === 0) return { ok: true, missing: [] };
  const missing = [];
  for (const r of requires) {
    const have = ownedQty(charId, r.kind, r.item_id);
    if (have < r.qty) {
      const meta = resolveItemMeta(r.kind, r.item_id);
      missing.push({
        kind: r.kind,
        item_id: r.item_id,
        name: meta?.name || r.item_id,
        need: r.qty,
        have,
      });
    }
  }
  return { ok: missing.length === 0, missing };
}

// Decrements consumed items in inventory; deletes rows that hit zero.
// Returns the list of consumed items so callers can echo them back.
// Caller should `checkRequirements` first — this trusts the inventory.
export function consumeRequirements(charId, requires) {
  if (!requires || requires.length === 0) return [];
  const consumed = [];
  const dec = db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?');
  const cleanup = db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ? AND qty <= 0');
  for (const r of requires) {
    if (!r.consumed) continue;
    dec.run(r.qty, charId, r.kind, r.item_id);
    cleanup.run(charId, r.kind, r.item_id);
    const meta = resolveItemMeta(r.kind, r.item_id);
    consumed.push({
      kind: r.kind,
      item_id: r.item_id,
      name: meta?.name || r.item_id,
      qty: r.qty,
    });
  }
  return consumed;
}

// Annotate a `requires` array with current ownership counts so the
// client can render "you have X / Y" chips.
export function annotateRequirements(charId, requires) {
  if (!requires || requires.length === 0) return [];
  return requires.map(r => {
    const have = ownedQty(charId, r.kind, r.item_id);
    const meta = resolveItemMeta(r.kind, r.item_id);
    return {
      kind: r.kind,
      item_id: r.item_id,
      name: meta?.name || r.item_id,
      need: r.qty,
      have,
      consumed: !!r.consumed,
      ok: have >= r.qty,
    };
  });
}
