import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { WEAPONS, ARMOUR, AMMO, weaponById, armourById, ammoById, vehicleById, cityById, drugById, miscItemById, propertyById, applyVehicleMods, CITIES, VEHICLE_TIER_DRIVING_GATE } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { garageSummary, freeGarageSpace } from '../services/garage.js';
import { FLIGHT_CLASSES, flightDurationMs } from '../services/flights.js';
import { itemWeight, PERSONAL_CAP_KG, HOUSE_CAP_KG, personalWeight, houseStashWeight, hasHouseIn, listHouseStash, transfer } from '../services/weight.js';

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
      condition: r.condition ?? 100,
      shipping_until: r.shipping_until && r.shipping_until > Date.now() ? r.shipping_until : null,
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

  // Per-unit weights stamped onto each personal row so the UI can
  // render the weight column without re-resolving categories.
  const stampWeight = (kind) => (i) => ({ ...i, unit_kg: itemWeight(kind, i.id ?? i.item_id) });
  const weaponsW = weapons.map(stampWeight('weapon'));
  const armoursW = armours.map(stampWeight('armour'));
  const drugsW   = drugs.map(stampWeight('drug'));
  const ammoW    = ammo.map(stampWeight('ammo'));
  const miscW    = misc.map(stampWeight('misc'));

  // House stash for the city the character is currently in. Empty when
  // they don't own a property in this city.
  const currentCity = ch.city;
  const houseOwned  = hasHouseIn(ch.id, currentCity);
  const houseItems  = houseOwned ? listHouseStash(ch.id, currentCity) : [];
  // Decorate with display names so the client doesn't need to look
  // them up against the catalogues for the stash UI.
  const houseDecorated = houseItems.map(i => {
    let name = i.item_id;
    if (i.kind === 'weapon') name = weaponById(i.item_id)?.name || name;
    if (i.kind === 'armour') name = armourById(i.item_id)?.name || name;
    if (i.kind === 'ammo')   name = ammoById(i.item_id)?.name   || name;
    if (i.kind === 'drug')   name = drugById(i.item_id)?.name   || name;
    if (i.kind === 'misc')   name = miscItemById(i.item_id)?.name || name;
    return { ...i, name };
  });

  res.json({
    weapons: weaponsW, armours: armoursW, drugs: drugsW, ammo: ammoW, misc: miscW,
    vehicles, properties,
    garages,
    equipped: {
      weapon: ch.equipped_weapon,
      armour: ch.equipped_armour,
      weapon_detail: equippedWeapon || null,
      armour_detail: equippedArmour || null,
      weapon_ammo: ammoForEquipped,
    },
    weight: {
      personal_kg:     personalWeight(ch.id),
      personal_cap_kg: PERSONAL_CAP_KG,
      house_kg:        houseOwned ? houseStashWeight(ch.id, currentCity) : 0,
      house_cap_kg:    HOUSE_CAP_KG,
      house_owned:     houseOwned,
      house_city:      currentCity,
    },
    house_stash: houseDecorated,
  });
});

// POST /api/inventory/transfer { kind, item_id, qty, from, to } —
// move items between personal and the current-city house stash. Caps
// enforced at the destination; insufficient quantity / cap overflow
// returns 400.
router.post('/transfer', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { kind, item_id, qty, from, to } = req.body || {};
  const n = parseInt(qty, 10);
  if (!kind || !item_id || !n || n <= 0) return res.status(400).json({ error: 'kind, item_id, qty required.' });
  if (!['personal', 'house'].includes(from) || !['personal', 'house'].includes(to)) {
    return res.status(400).json({ error: 'from/to must be personal or house.' });
  }
  // House stash is city-locked — you can only fish through your own
  // city's stash. (Vehicle cargo is a follow-up commit.)
  const city = ch.city;
  if ((from === 'house' || to === 'house') && !hasHouseIn(ch.id, city)) {
    return res.status(400).json({ error: 'You don\'t own a property in this city.' });
  }
  const r = transfer(ch.id, kind, item_id, n, 0, from, to, city);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
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
  // If a premium car is currently being driven, park it silently — the
  // explicit "take this out of the garage" action is a clear switch
  // intent. The premium item itself isn't lost (it lives on the user
  // account); only the active reference flips.
  if (ch.active_premium_vehicle_id) {
    db.prepare('UPDATE characters SET active_premium_vehicle_id = NULL WHERE id = ?').run(ch.id);
    ch.active_premium_vehicle_id = null;
  }
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Vehicle not found.' });
  if (row.shipping_until && row.shipping_until > Date.now()) {
    const minutes = Math.max(1, Math.ceil((row.shipping_until - Date.now()) / 60000));
    return res.status(400).json({ error: `That car is still in transit — arrives in ${minutes} min.` });
  }
  if (row.city !== ch.city) {
    return res.status(400).json({ error: `That car is in ${cityById(row.city)?.name || row.city}. Fly there to drive it.` });
  }
  // Driver's licence — driving skill must cover the car's tier
  // before you can equip it. Buying / shipping / storing are still
  // open; this only blocks setting the car as your active ride.
  const v = vehicleById(row.vehicle_id);
  const drivingGate = (v && VEHICLE_TIER_DRIVING_GATE[v.tier]) || 0;
  if ((ch.driving || 1) < drivingGate) {
    return res.status(403).json({ error: `Tier ${v.tier} requires driving skill ${drivingGate}+. Train at the Driving School.` });
  }
  ch.active_vehicle_id = row.id;
  saveCharacter(ch);
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
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Vehicle not found.' });
  if (row.city === to) return res.status(400).json({ error: 'That vehicle is already in that city.' });
  if (row.shipping_until && row.shipping_until > Date.now()) {
    return res.status(400).json({ error: 'That car is already in transit. Wait for it to arrive.' });
  }
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(400).json({ error: 'Unknown vehicle.' });
  if (freeGarageSpace(ch.id, to) <= 0) {
    return res.status(400).json({ error: `No free garage space in ${cityById(to).name}. Buy a property there first.` });
  }
  const cost = shipCost(v, to);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()} to ship.` });
  // Shipping mirrors a business-class flight on the same route, so a
  // tier-7 hyper to Hong Kong takes the same 13-ish minutes a player
  // would spend in the air themselves.
  const dur = flightDurationMs(row.city, to, FLIGHT_CLASSES.business.durationMul);
  const arrivesAt = Date.now() + dur;
  // If the car being shipped is the active ride, park it first — the
  // player can't drive a car that's literally on a transporter. The
  // active reference is cleared in the same save so a refresh shows
  // the right state immediately.
  const wasActive = Number(ch.active_vehicle_id) === id;
  if (wasActive) ch.active_vehicle_id = null;
  ch.cash -= cost;
  db.prepare('UPDATE vehicles_owned SET city = ?, shipping_until = ? WHERE id = ?')
    .run(to, dur > 0 ? arrivesAt : null, id);
  saveCharacter(ch);
  writeLog(ch.id, 'shop',
    `${wasActive ? 'Parked and shipped' : 'Shipped'} ${v.maker} ${v.name} to ${cityById(to).name} for £${cost.toLocaleString()} — arriving in ${Math.max(1, Math.round(dur / 60000))} min.`,
    { vehicle: v.id, from: row.city, to, cost, durationMs: dur, fromActive: wasActive });
  res.json({ ok: true, cost, durationMs: dur, arrivesAt, fromActive: wasActive, character: publicCharacter(ch) });
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
  // Carry-weight gate. Reject before deducting cash so the player
  // doesn't get charged for stock they can't pick up.
  const buyUnits = kind === 'ammo' ? item.packSize * qty : qty;
  const buyKg = itemWeight(kind, item_id) * buyUnits;
  const haveKg = personalWeight(ch.id);
  if (haveKg + buyKg > PERSONAL_CAP_KG + 1e-6) {
    return res.status(400).json({
      error: `Carry too much — adds ${buyKg.toFixed(2)}kg (you have ${haveKg.toFixed(1)}/${PERSONAL_CAP_KG}kg). Stash items at your house first.`,
    });
  }
  ch.cash -= total;
  // For weapons/armour, store qty (you can own multiples but only equip one).
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, ?, ?, ?)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
  `).run(ch.id, kind, item_id, buyUnits);
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
