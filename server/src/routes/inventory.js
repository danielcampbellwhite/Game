import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { WEAPONS, ARMOUR, AMMO, weaponById, armourById, ammoById, vehicleById, cityById, drugById, miscItemById, propertyById, applyVehicleMods, CITIES } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { garageSummary, freeGarageSpace } from '../services/garage.js';

// Inter-city shipping: £500 base × tier × (destination flight cost
// scaled to a 1500 median). Tier-1 short-hop ≈ £500, tier-7 long-haul
// to Dubai ≈ £6,500. Rounded to the nearest £100 so quotes look clean.
function shipCost(vehicle, toCity) {
  if (!vehicle || !toCity) return 0;
  const baseFlight = cityById(toCity)?.flightBase || 1500;
  const tier = vehicle.tier || 1;
  const raw = 500 * tier * (baseFlight / 1500);
  return Math.max(500, Math.round(raw / 100) * 100);
}

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
      emoji: m?.emoji || '',
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
      is_active: r.id === ch.active_vehicle_id,
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

  // Per-city garage usage (capacity + free spaces) so the client can
  // render a "London 1/4" badge next to each vehicle and on the
  // shipping picker.
  const garages = garageSummary(ch.id).map(g => ({
    ...g,
    cityName: cityById(g.city)?.name || g.city,
  }));

  res.json({
    weapons, armours, drugs, ammo, misc, vehicles, properties,
    garages,
    equipped: {
      weapon: ch.equipped_weapon,
      armour: ch.equipped_armour,
      weapon_detail: equippedWeapon || null,
      armour_detail: equippedArmour || null,
      weapon_ammo: ammoForEquipped,
    },
  });
});

// Quote a shipping cost without committing — used by the client before
// the player confirms. Returns the cost plus capacity info for both
// ends so the UI can disable the action when the destination is full.
router.get('/ship-quote', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.query.id, 10);
  const to = req.query.to;
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Vehicle not found.' });
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(400).json({ error: 'Unknown vehicle.' });
  if (!cityById(to)) return res.status(400).json({ error: 'Unknown destination city.' });
  const cost = shipCost(v, to);
  const free = freeGarageSpace(ch.id, to);
  res.json({ ok: true, from: row.city, to, cost, free });
});

// Equip a car: pull it out of the garage and make it the player's
// active ride. Requires the car to be in the player's current city
// (you can't drive a London car around Tokyo) and the player to not
// already have an active vehicle.
router.post('/equip-vehicle', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.body?.id, 10);
  if (ch.active_vehicle_id) {
    return res.status(400).json({ error: 'You\'re already driving a car. Store or sell it first.' });
  }
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Vehicle not found.' });
  if (row.city !== ch.city) {
    return res.status(400).json({ error: `That car is in ${cityById(row.city)?.name || row.city}. Fly there to drive it.` });
  }
  ch.active_vehicle_id = row.id;
  saveCharacter(ch);
  const v = vehicleById(row.vehicle_id);
  writeLog(ch.id, 'shop', `Took the ${v?.maker || ''} ${v?.name || 'car'} out of the garage.`, { vehicle: row.vehicle_id });
  res.json({ ok: true, character: publicCharacter(ch) });
});

// Store the active car: park it in a local garage. Requires free
// space in the current city's garages. After storing the player is
// on foot and free to fly.
router.post('/store-vehicle', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  if (!ch.active_vehicle_id) return res.status(400).json({ error: 'You don\'t have an active car to store.' });
  if (freeGarageSpace(ch.id, ch.city) <= 0) {
    const cap = db.prepare(`
      SELECT COUNT(*) AS n FROM properties_owned WHERE char_id = ? AND city = ?
    `).get(ch.id, ch.city);
    return res.status(400).json({
      error: cap?.n
        ? 'Garage is full in this city. Sell or ship a car before storing another.'
        : 'No garage in this city. Buy a property first, or sell the car instead.',
    });
  }
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) {
    // Stale active id — clean up and tell the client.
    ch.active_vehicle_id = null;
    saveCharacter(ch);
    return res.status(404).json({ error: 'Active vehicle missing.' });
  }
  // Move the car into the player's current city's garage and clear
  // the active slot.
  db.prepare('UPDATE vehicles_owned SET city = ? WHERE id = ?').run(ch.city, row.id);
  ch.active_vehicle_id = null;
  saveCharacter(ch);
  const v = vehicleById(row.vehicle_id);
  writeLog(ch.id, 'shop', `Parked the ${v?.maker || ''} ${v?.name || 'car'} in the ${cityById(ch.city)?.name || ch.city} garage.`, { vehicle: row.vehicle_id });
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/ship-vehicle', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.body?.id, 10);
  const to = req.body?.to;
  if (!cityById(to)) return res.status(400).json({ error: 'Unknown destination city.' });
  if (id === Number(ch.active_vehicle_id)) {
    return res.status(400).json({ error: 'Your active car can\'t be shipped — store it in a garage first, then ship from there.' });
  }
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Vehicle not found.' });
  if (row.city === to) return res.status(400).json({ error: 'That vehicle is already in that city.' });
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(400).json({ error: 'Unknown vehicle.' });
  if (freeGarageSpace(ch.id, to) <= 0) {
    return res.status(400).json({ error: `No free garage space in ${cityById(to).name}. Buy a property there first.` });
  }
  const cost = shipCost(v, to);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()} to ship.` });
  ch.cash -= cost;
  db.prepare('UPDATE vehicles_owned SET city = ? WHERE id = ?').run(to, id);
  saveCharacter(ch);
  writeLog(ch.id, 'shop', `Shipped ${v.maker} ${v.name} to ${cityById(to).name} for £${cost.toLocaleString()}.`, { vehicle: v.id, from: row.city, to, cost });
  res.json({ ok: true, cost, character: publicCharacter(ch) });
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
