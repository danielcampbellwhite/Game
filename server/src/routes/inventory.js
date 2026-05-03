import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { WEAPONS, ARMOUR, AMMO, weaponById, armourById, ammoById, vehicleById, cityById, drugById, miscItemById, propertyById, applyVehicleMods } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const items = db.prepare('SELECT * FROM inventory WHERE char_id = ?').all(ch.id);
  const weapons = items.filter(i => i.kind === 'weapon').map(i => ({ ...weaponById(i.item_id), qty: i.qty }));
  const armours = items.filter(i => i.kind === 'armour').map(i => ({ ...armourById(i.item_id), qty: i.qty }));
  // Drugs carry no other static metadata beyond the catalogue, so resolve
  // name/level here so the inventory page doesn't have to know the data table.
  const drugs = items.filter(i => i.kind === 'drug').map(i => {
    const d = drugById(i.item_id);
    return { id: i.item_id, name: d?.name || i.item_id, qty: i.qty };
  });
  const ammo  = items.filter(i => i.kind === 'ammo').map(i => ({ ...ammoById(i.item_id), qty: i.qty }));
  // Misc / general-store items — same shape the store page already returns.
  // Pass through `effects` / `oneShotCash` / `missionOnly` so the client
  // can render the right "what happened?" message after Use.
  const misc  = items.filter(i => i.kind === 'misc').map(i => {
    const m = miscItemById(i.item_id);
    return {
      id: i.item_id,
      name: m?.name || i.item_id,
      emoji: m?.emoji || '📦',
      desc: m?.desc || '',
      qty: i.qty,
      effects: m?.effects || null,
      oneShotCash: m?.oneShotCash || null,
      prizes: m?.prizes || null,
      missionOnly: !!m?.missionOnly,
    };
  }).filter(i => i.qty > 0);

  const vehicleRows = db.prepare('SELECT * FROM vehicles_owned WHERE char_id = ? ORDER BY id DESC').all(ch.id);
  const vehicles = vehicleRows.map(r => {
    const v = vehicleById(r.vehicle_id);
    if (!v) return null;
    const stats = applyVehicleMods(v, r.mods_json);
    return {
      id: r.id, vehicle_id: v.id, name: v.name, maker: v.maker, tier: v.tier,
      image: v.image,
      bookPrice: stats.bookPrice,
      base_book_price: stats.base_book_price,
      value_delta: stats.value_delta,
      power: stats.power,
      handling: stats.handling,
      is_modified: stats.is_modified,
      mods: stats.mods,
      acquired_via: r.acquired_via, city: r.city,
      cityName: cityById(r.city)?.name, acquired_at: r.acquired_at,
    };
  }).filter(Boolean);

  // Properties are owned per-city; bonuses only apply in their home city.
  const propertyRows = db.prepare('SELECT * FROM properties_owned WHERE char_id = ? ORDER BY id DESC').all(ch.id);
  const properties = propertyRows.map(r => {
    const p = propertyById(r.property_id);
    if (!p) return null;
    return {
      id: r.id,
      property_id: p.id,
      name: p.name,
      address: p.address || null,
      cost: p.cost,
      city: r.city,
      cityName: cityById(r.city)?.name,
      bonuses: p.bonuses,
    };
  }).filter(Boolean);

  // Resolve the equipped weapon's ammo type so the client can show "rounds
  // remaining" without a second lookup.
  const equippedWeapon = ch.equipped_weapon ? weaponById(ch.equipped_weapon) : null;
  const equippedArmour = ch.equipped_armour ? armourById(ch.equipped_armour) : null;
  const ammoForEquipped = equippedWeapon?.ammoType
    ? (items.find(i => i.kind === 'ammo' && i.item_id === equippedWeapon.ammoType)?.qty || 0)
    : null;

  res.json({
    weapons, armours, drugs, ammo, misc, vehicles, properties,
    equipped: {
      weapon: ch.equipped_weapon,
      armour: ch.equipped_armour,
      weapon_detail: equippedWeapon || null,
      armour_detail: equippedArmour || null,
      weapon_ammo: ammoForEquipped,
    },
  });
});

router.post('/buy', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { kind, item_id, qty = 1 } = req.body || {};
  let item;
  if (kind === 'weapon') item = weaponById(item_id);
  else if (kind === 'armour') item = armourById(item_id);
  else if (kind === 'ammo') item = ammoById(item_id);
  else return res.status(400).json({ error: 'Bad kind' });
  if (!item) return res.status(400).json({ error: 'Unknown item' });
  if (kind !== 'ammo' && ch.level < item.level) return res.status(403).json({ error: `Requires level ${item.level}` });
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const unitCost = kind === 'ammo' ? item.cost : Math.floor((item.cost || 0) * cityMul);
  const total = unitCost * (kind === 'ammo' ? item.packSize * qty : qty);
  if (ch.cash < total) return res.status(400).json({ error: `Need £${total.toLocaleString()}` });
  ch.cash -= total;
  // For weapons/armour, store qty (you can own multiples but only equip one).
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, ?, ?, ?)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
  `).run(ch.id, kind, item_id, kind === 'ammo' ? item.packSize * qty : qty);
  writeLog(ch.id, 'shop', `Bought ${kind === 'ammo' ? `${item.packSize * qty} ${item.name}` : `${qty}× ${item.name}`} for £${total}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/equip', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { kind, item_id } = req.body || {};
  if (kind === 'weapon') {
    if (item_id !== 'fists') {
      const owned = db.prepare('SELECT id FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(ch.id, 'weapon', item_id);
      if (!owned) return res.status(400).json({ error: 'Not owned' });
    }
    ch.equipped_weapon = item_id;
  } else if (kind === 'armour') {
    if (item_id !== 'none') {
      const owned = db.prepare('SELECT id FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(ch.id, 'armour', item_id);
      if (!owned) return res.status(400).json({ error: 'Not owned' });
    }
    ch.equipped_armour = item_id;
  } else {
    return res.status(400).json({ error: 'Bad kind' });
  }
  writeLog(ch.id, 'equip', `Equipped ${kind}: ${item_id}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
