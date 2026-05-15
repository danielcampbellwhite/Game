// Cosmetic clothing — purely visual. Items have a slot
// (hat/top/bottom/shoes/accessory); a character can equip one item
// per slot. Items are non-stackable: own 1 max per id.

import { db } from '../db.js';
import { CLOTHING_SLOTS, clothingItemById, clothingForStore } from '../data-clothing.js';

function readEquipped(ch) {
  if (!ch.equipped_clothing) return {};
  try { return JSON.parse(ch.equipped_clothing) || {}; }
  catch { return {}; }
}
function writeEquipped(ch, map) {
  ch.equipped_clothing = JSON.stringify(map);
  db.prepare('UPDATE characters SET equipped_clothing = ? WHERE id = ?').run(ch.equipped_clothing, ch.id);
}

export function getEquipped(ch) {
  const map = readEquipped(ch);
  const out = {};
  for (const slot of CLOTHING_SLOTS) {
    const id = map[slot];
    if (!id) { out[slot] = null; continue; }
    const item = clothingItemById(id);
    out[slot] = item ? { id: item.id, name: item.name, slot: item.slot, store: item.store } : null;
  }
  return out;
}

export function ownsClothing(charId, itemId) {
  return !!db.prepare('SELECT 1 FROM clothing_owned WHERE char_id = ? AND item_id = ?').get(charId, itemId);
}

export function listOwned(charId) {
  const rows = db.prepare('SELECT item_id, acquired_at FROM clothing_owned WHERE char_id = ?').all(charId);
  return rows.map(r => {
    const m = clothingItemById(r.item_id);
    return m ? { ...m, acquired_at: r.acquired_at } : null;
  }).filter(Boolean);
}

export function listStore(tier, charId) {
  const owned = new Set(db.prepare('SELECT item_id FROM clothing_owned WHERE char_id = ?').all(charId).map(r => r.item_id));
  return clothingForStore(tier).map(i => ({ ...i, owned: owned.has(i.id) }));
}

export function buyClothing(ch, itemId) {
  const item = clothingItemById(itemId);
  if (!item) return { error: 'Unknown item.' };
  if (ownsClothing(ch.id, itemId)) return { error: 'You already own that.' };
  if (ch.cash < item.cost) return { error: `Need £${item.cost.toLocaleString()}.` };
  ch.cash -= item.cost;
  db.prepare('INSERT INTO clothing_owned (char_id, item_id, acquired_at) VALUES (?, ?, ?)')
    .run(ch.id, itemId, Date.now());
  return { ok: true, item, cost: item.cost };
}

export function equipClothing(ch, slot, itemId) {
  if (!CLOTHING_SLOTS.includes(slot)) return { error: 'Unknown slot.' };
  if (itemId) {
    const item = clothingItemById(itemId);
    if (!item) return { error: 'Unknown item.' };
    if (item.slot !== slot) return { error: `That item goes in the ${item.slot} slot.` };
    if (!ownsClothing(ch.id, itemId)) return { error: 'You don\'t own that item.' };
  }
  const map = readEquipped(ch);
  if (itemId) map[slot] = itemId;
  else        delete map[slot];
  writeEquipped(ch, map);
  return { ok: true, equipped: getEquipped(ch) };
}

// Public outfit fetcher — used by the player-profile route to render
// what someone else is wearing.
export function publicOutfitForChar(charId) {
  const row = db.prepare('SELECT equipped_clothing FROM characters WHERE id = ?').get(charId);
  let map = {};
  try { map = row?.equipped_clothing ? JSON.parse(row.equipped_clothing) : {}; }
  catch { map = {}; }
  const out = {};
  for (const slot of CLOTHING_SLOTS) {
    const id = map[slot];
    if (!id) { out[slot] = null; continue; }
    const item = clothingItemById(id);
    out[slot] = item ? { id: item.id, name: item.name, slot: item.slot } : null;
  }
  return out;
}
