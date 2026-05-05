import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { VEHICLES, vehicleById, cityById, VEHICLE_TIER_LEVEL_GATE, VEHICLE_TIER_DRIVING_GATE } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { freeGarageSpace, garageCapacity, vehicleCount } from '../services/garage.js';

const router = Router();

// Legal-dealer price respects the city's businessMul (luxury markets cost more).
function dealerPrice(vehicle, city) {
  const mul = cityById(city)?.businessMul || 1.0;
  return Math.floor(vehicle.bookPrice * mul);
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const inventory = VEHICLES.map(v => {
    const levelGate   = VEHICLE_TIER_LEVEL_GATE[v.tier]   || 1;
    const drivingGate = VEHICLE_TIER_DRIVING_GATE[v.tier] || 0;
    return {
      ...v,
      price: dealerPrice(v, ch.city),
      levelGate,
      drivingGate,
      locked: ch.level < levelGate,
    };
  });
  const capacity = garageCapacity(ch.id, ch.city);
  const used = vehicleCount(ch.id, ch.city);
  // Quote the active-vehicle trade-in price so the UI can show what
  // the dealer would offer for the player's current car.
  let active = null;
  if (ch.active_vehicle_id) {
    const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
    if (row) {
      const av = vehicleById(row.vehicle_id);
      if (av) {
        const cityMul = cityById(ch.city)?.businessMul || 1.0;
        const condMul = Math.max(0, row.condition ?? 100) / 100;
        active = {
          id: row.id,
          name: av.name,
          maker: av.maker,
          tier: av.tier,
          acquired_via: row.acquired_via,
          condition: row.condition ?? 100,
          tradeIn: row.acquired_via === 'bought'
            ? Math.floor(av.bookPrice * cityMul * DEALER_BUYBACK_RATE * condMul)
            : null,
        };
      }
    }
  }
  res.json({
    city: ch.city,
    cityName: cityById(ch.city)?.name,
    inventory,
    garage: { capacity, used, free: Math.max(0, capacity - used) },
    active,
  });
});

router.post('/buy', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const v = vehicleById(req.body?.vehicle_id);
  if (!v) return res.status(400).json({ error: 'Unknown vehicle' });
  const levelGate = VEHICLE_TIER_LEVEL_GATE[v.tier] || 1;
  if (ch.level < levelGate) {
    return res.status(403).json({ error: `Tier ${v.tier} cars unlock at level ${levelGate}.` });
  }
  // The car will only auto-equip as the active ride if (a) the player
  // isn't currently driving something AND (b) their driving licence
  // covers the tier. Otherwise it goes straight to the garage.
  const drivingGate = VEHICLE_TIER_DRIVING_GATE[v.tier] || 0;
  const hasLicence = (ch.driving || 1) >= drivingGate;
  const willBeActive = !ch.active_vehicle_id && hasLicence;
  if (!willBeActive && freeGarageSpace(ch.id, ch.city) <= 0) {
    const cap = garageCapacity(ch.id, ch.city);
    return res.status(400).json({
      error: cap === 0
        ? 'No garage in this city. Buy a property here, or sell your current car first.'
        : `Garage full (${cap}/${cap}). Sell or store something before buying another.`,
    });
  }
  const price = dealerPrice(v, ch.city);
  if (ch.cash < price) return res.status(400).json({ error: `Need £${price.toLocaleString()}` });
  ch.cash -= price;
  const info = db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at) VALUES (?, ?, ?, ?, ?)')
    .run(ch.id, v.id, 'bought', ch.city, Date.now());
  if (willBeActive) ch.active_vehicle_id = info.lastInsertRowid;
  writeLog(ch.id, 'dealership', `Bought ${v.maker} ${v.name} for £${price.toLocaleString()}${willBeActive ? ' — driving it off the lot.' : ' — parked at the garage.'}`, { vehicle: v.id, price, active: willBeActive });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// Trade-in: sell the active vehicle back to the dealer at 60% of its
// city-adjusted book price. Only works for cars you bought legitimately
// (acquired_via='bought'); stolen cars have to move through the chop
// shop or the black-market dealer.
const DEALER_BUYBACK_RATE = 0.60;
router.post('/sell', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  if (!ch.active_vehicle_id) return res.status(400).json({ error: 'You have no active car to sell.' });
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) return res.status(404).json({ error: 'Active vehicle missing.' });
  if (row.acquired_via !== 'bought') {
    return res.status(400).json({ error: 'The dealership only takes legally-bought cars. Try a chop shop or black-market dealer.' });
  }
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(404).json({ error: 'Vehicle catalogue missing.' });
  let modCount = 0;
  try { modCount = Object.keys(JSON.parse(row.mods_json || '{}')).length; } catch {}
  if (modCount > 0) {
    return res.status(400).json({ error: 'The dealer won\'t take a customised car. Strip the mods or list it on a player shop.' });
  }
  const listed = db.prepare("SELECT id FROM shop_listings WHERE kind = 'vehicle' AND instance_id = ?").get(row.id);
  if (listed) return res.status(400).json({ error: 'This car is listed in a player shop — delist it first.' });

  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const condMul = Math.max(0, row.condition ?? 100) / 100;
  const payout = Math.floor(v.bookPrice * cityMul * DEALER_BUYBACK_RATE * condMul);
  ch.cash += payout;
  ch.active_vehicle_id = null;
  db.prepare('DELETE FROM vehicles_owned WHERE id = ?').run(row.id);
  writeLog(ch.id, 'dealership', `Sold ${v.maker} ${v.name} back to the dealer for £${payout.toLocaleString()} (${Math.round(row.condition ?? 100)}% condition).`, { vehicle: v.id, payout, condition: row.condition });
  saveCharacter(ch);
  res.json({ ok: true, payout, character: publicCharacter(ch) });
});

export default router;
