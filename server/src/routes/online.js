// In-game internet — services you can use remotely from any place
// with a phone in your pocket or a laptop within reach. Every
// endpoint here is gated by requireInternet. Online services charge
// a small markup over the in-store price and are paid from the
// player's bank balance (not pocket cash) — the in-fiction reason
// is that online merchants only take bank transfers.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { requireInternet } from '../services/online.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import {
  CITIES, cityById, VEHICLES, vehicleById, VEHICLE_TIER_LEVEL_GATE,
  WEAPONS, ARMOUR, AMMO, weaponById, armourById, ammoById, propertyById,
} from '../data.js';
import { FLIGHT_CLASSES, flightDurationMs } from '../services/flights.js';
import { garageCapacity, vehicleCount } from '../services/garage.js';
import {
  DELIVERY_LEAD_MS, WEAPON_DELIVERY_LEAD_MS,
  listPendingDeliveries, pendingDeliveryCountInCity,
  listPendingWeaponDeliveries,
} from '../services/deliveries.js';

const router = Router();

// 8% across the board, sitting in the middle of the 5–10% range the
// player asked for. Keep this central; future online services should
// reuse it so the markup feels consistent everywhere.
export const ONLINE_MARKUP = 0.08;
export function onlinePrice(base) {
  return Math.ceil(base * (1 + ONLINE_MARKUP));
}

// Mirror the airport flight window so a ticket bought online and an
// in-person ticket land on the same boarding slot.
const FLIGHT_INTERVAL_MS = 10 * 60 * 1000;
const BOARDING_WINDOW_MS = 2 * 60 * 1000;
function nextDepartureAt(now = Date.now()) {
  return Math.ceil(now / FLIGHT_INTERVAL_MS) * FLIGHT_INTERVAL_MS;
}

// GET / — landing page. Right now just a status summary the client
// uses to decide which features to surface. Later this grows to
// include catalogues for online vehicles, weapons, etc.
router.get('/', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  res.json({
    online: true,
    via: req.internetReason,                 // 'phone' | 'laptop_home' | 'laptop_car'
    markup_pct: Math.round(ONLINE_MARKUP * 100),
    bank: ch.bank,
    cityName: cityById(ch.city)?.name,
  });
});

// GET /flights — the same fares the airport shows, with the online
// markup baked in. The player can be in any city to browse and book —
// they don't need to be at the airport — but they still need to be
// at the *origin* airport to board the flight itself.
router.get('/flights', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const from = cityById(ch.city);
  if (!from) return res.status(400).json({ error: 'Unknown origin city.' });
  const flights = CITIES.filter(c => c.id !== ch.city).map(c => {
    const baseFare = Math.floor((from.flightBase + c.flightBase) / 2);
    const unlockLevel = c.unlockLevel || 1;
    return {
      city: c.id, name: c.name, emoji: c.emoji,
      unlockLevel,
      locked: ch.level < unlockLevel,
      classes: Object.fromEntries(Object.entries(FLIGHT_CLASSES).map(([k, v]) => {
        const inStore = Math.floor(baseFare * v.mul);
        return [k, {
          base: inStore,
          cost: onlinePrice(inStore),
          durationMs: flightDurationMs(ch.city, c.id, v.durationMul),
        }];
      })),
    };
  });
  res.json({
    flights,
    markup_pct: Math.round(ONLINE_MARKUP * 100),
    boarding_note: `Pay online from your bank, then head to the ${from.name} airport to board.`,
  });
});

// POST /flights/ticket { city, klass } — books a flight online,
// pays from bank balance with the 8% online markup. Identical
// boarding rules to the airport endpoint: the ticket lands on the
// next departure slot and the player physically boards at the airport.
router.post('/flights/ticket', requireAuth, requireCharacter, requireFreeCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const { city, klass = 'economy' } = req.body || {};
  const target = cityById(city);
  if (!target) return res.status(400).json({ error: 'Unknown city.' });
  if (target.id === ch.city) return res.status(400).json({ error: 'Already there.' });
  if (ch.level < (target.unlockLevel || 1)) {
    return res.status(403).json({ error: `${target.name} unlocks at level ${target.unlockLevel}.` });
  }
  const cls = FLIGHT_CLASSES[klass];
  if (!cls) return res.status(400).json({ error: 'Unknown flight class.' });

  // Re-check for an existing pending ticket — players shouldn't end
  // up holding two seats on the same route just because they bought
  // one online and one at the desk.
  const existing = db.prepare(
    "SELECT id FROM flight_tickets WHERE char_id = ? AND status = 'booked' AND from_city = ? AND to_city = ?"
  ).get(ch.id, ch.city, target.id);
  if (existing) return res.status(409).json({ error: `You already hold a ticket to ${target.name}.` });

  const from = cityById(ch.city);
  const baseFare = Math.floor((from.flightBase + target.flightBase) / 2);
  const base = Math.floor(baseFare * cls.mul);
  const cost = onlinePrice(base);
  if (ch.bank < cost) {
    return res.status(400).json({ error: `Need £${cost.toLocaleString()} in your bank account to pay online.` });
  }

  let departsAt = nextDepartureAt();
  if (departsAt - Date.now() < BOARDING_WINDOW_MS) departsAt += FLIGHT_INTERVAL_MS;

  ch.bank -= cost;
  db.prepare(`
    INSERT INTO flight_tickets (char_id, from_city, to_city, class, cost, departs_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)
  `).run(ch.id, ch.city, target.id, klass, cost, departsAt, Date.now());
  saveCharacter(ch);
  writeLog(ch.id, 'travel',
    `Booked ${klass} ticket to ${target.name} online for £${cost.toLocaleString()} (incl. ${Math.round(ONLINE_MARKUP * 100)}% markup). Head to the airport to board.`);
  res.json({ ok: true, departsAt, cost, base, character: publicCharacter(ch) });
});

// ─── Vehicle delivery ─────────────────────────────────────────
// Online car ordering. The dealer ships to any city where the player
// owns a garage (== owns a property with a garage slot). Markup is the
// same 8% as flights. Pays from bank. Delivery is wall-clock 4 hours
// (DELIVERY_LEAD_MS) and the car materialises into vehicles_owned via
// applyTick → materializeReadyDeliveries.

function deliverableCities(charId) {
  // Cities where the player owns at least one garage slot.
  return CITIES
    .map(c => {
      const cap = garageCapacity(charId, c.id);
      if (cap <= 0) return null;
      const used = vehicleCount(charId, c.id);
      const pending = pendingDeliveryCountInCity(charId, c.id);
      return {
        id: c.id, name: c.name, emoji: c.emoji,
        capacity: cap, used, pending,
        free: Math.max(0, cap - used - pending),
      };
    })
    .filter(Boolean);
}

router.get('/vehicles', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const destinations = deliverableCities(ch.id);
  const totalFree = destinations.reduce((s, d) => s + d.free, 0);
  const inventory = VEHICLES.map(v => {
    const cityMul = cityById(ch.city)?.businessMul || 1.0;
    const base = Math.floor(v.bookPrice * cityMul);
    return {
      id: v.id, name: v.name, maker: v.maker, tier: v.tier,
      bookPrice: v.bookPrice,
      base,
      cost: onlinePrice(base),
      levelGate: VEHICLE_TIER_LEVEL_GATE[v.tier] || 1,
      locked: ch.level < (VEHICLE_TIER_LEVEL_GATE[v.tier] || 1),
    };
  });
  const pending = listPendingDeliveries(ch.id).map(d => {
    const v = vehicleById(d.vehicle_id);
    return {
      id: d.id,
      vehicle: v ? `${v.maker} ${v.name}` : d.vehicle_id,
      destination: cityById(d.destination_city)?.name || d.destination_city,
      arrives_at: d.arrives_at,
      cost: d.cost,
    };
  });
  res.json({
    inventory,
    destinations,
    totalFree,
    pending,
    leadHours: Math.round(DELIVERY_LEAD_MS / 3_600_000),
    markup_pct: Math.round(ONLINE_MARKUP * 100),
  });
});

router.post('/vehicles/buy', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const v = vehicleById(req.body?.vehicle_id);
  if (!v) return res.status(400).json({ error: 'Unknown vehicle.' });
  const destCity = req.body?.destination_city;
  const target = cityById(destCity);
  if (!target) return res.status(400).json({ error: 'Pick a destination city you own a garage in.' });
  const levelGate = VEHICLE_TIER_LEVEL_GATE[v.tier] || 1;
  if (ch.level < levelGate) {
    return res.status(403).json({ error: `Tier ${v.tier} cars unlock at level ${levelGate}.` });
  }
  const cap = garageCapacity(ch.id, destCity);
  if (cap <= 0) {
    return res.status(400).json({ error: `You don't own a garage in ${target.name}. Buy a property there first.` });
  }
  const used    = vehicleCount(ch.id, destCity);
  const pending = pendingDeliveryCountInCity(ch.id, destCity);
  if (used + pending >= cap) {
    return res.status(400).json({
      error: `No free space in your ${target.name} garage (${used}/${cap} parked, ${pending} on the way).`,
    });
  }
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const base = Math.floor(v.bookPrice * cityMul);
  const cost = onlinePrice(base);
  if (ch.bank < cost) {
    return res.status(400).json({ error: `Need £${cost.toLocaleString()} in your bank account to pay online.` });
  }
  ch.bank -= cost;
  const now = Date.now();
  const arrives = now + DELIVERY_LEAD_MS;
  db.prepare(`
    INSERT INTO vehicle_deliveries
      (char_id, vehicle_id, destination_city, base_cost, cost, ordered_at, arrives_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(ch.id, v.id, destCity, base, cost, now, arrives);
  writeLog(ch.id, 'delivery',
    `Ordered ${v.maker} ${v.name} online for £${cost.toLocaleString()} (incl. ${Math.round(ONLINE_MARKUP * 100)}% markup). Delivery to ${target.name} in ~${Math.round(DELIVERY_LEAD_MS / 3_600_000)}h.`,
    { vehicle: v.id, city: destCity, cost, eta: arrives });
  saveCharacter(ch);
  res.json({ ok: true, arrives_at: arrives, cost, base, character: publicCharacter(ch) });
});

// ─── Gear delivery (weapons / armour / ammo) ─────────────────
// Order weapons, armour, and ammo for delivery to a property you
// own. No licence check (the online seller doesn't ask). Same 8%
// markup, paid from bank. Lead time is 2 hours.

function ownedPropertiesFor(charId) {
  const rows = db.prepare(
    'SELECT id, property_id, city FROM properties_owned WHERE char_id = ? ORDER BY city'
  ).all(charId);
  return rows.map(r => {
    const p = propertyById(r.property_id);
    return {
      id: r.id,
      property_id: r.property_id,
      name: p?.name || 'Property',
      city: r.city,
      cityName: cityById(r.city)?.name || r.city,
    };
  });
}

router.get('/weapons', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const properties = ownedPropertiesFor(ch.id);
  const weapons = WEAPONS
    .filter(w => w.cost > 0)
    .map(w => {
      const base = Math.floor(w.cost * cityMul);
      return {
        id: w.id, name: w.name, maker: w.maker, category: w.category,
        dmg: w.dmg, level: w.level, ammoType: w.ammoType || null,
        base, cost: onlinePrice(base),
        locked: ch.level < w.level,
      };
    });
  const armours = ARMOUR
    .filter(a => a.cost > 0)
    .map(a => {
      const base = Math.floor(a.cost * cityMul);
      return {
        id: a.id, name: a.name, level: a.level,
        base, cost: onlinePrice(base),
        locked: ch.level < a.level,
      };
    });
  const ammo = AMMO.map(a => ({
    id: a.id, name: a.name, packSize: a.packSize,
    // Ammo is uniform-priced; still apply markup so the online tier feels consistent.
    base: a.cost * a.packSize,
    cost: onlinePrice(a.cost * a.packSize),
  }));
  const pending = listPendingWeaponDeliveries(ch.id).map(d => ({
    id: d.id,
    qty: d.qty,
    label: d.kind === 'weapon' ? (weaponById(d.item_id)?.name || d.item_id)
         : d.kind === 'armour' ? (armourById(d.item_id)?.name || d.item_id)
         : (ammoById(d.item_id)?.name || d.item_id),
    destination: (() => {
      const p = db.prepare('SELECT property_id, city FROM properties_owned WHERE id = ?').get(d.destination_property);
      return p ? `${propertyById(p.property_id)?.name || 'Property'} in ${cityById(p.city)?.name}` : 'A property';
    })(),
    arrives_at: d.arrives_at,
    cost: d.cost,
  }));
  res.json({
    weapons, armours, ammo,
    properties,
    pending,
    leadHours: Math.round(WEAPON_DELIVERY_LEAD_MS / 3_600_000),
    markup_pct: Math.round(ONLINE_MARKUP * 100),
  });
});

router.post('/weapons/buy', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const { kind, item_id, qty: rawQty = 1, destination_property } = req.body || {};
  const propRow = db.prepare(
    'SELECT id, city FROM properties_owned WHERE id = ? AND char_id = ?'
  ).get(destination_property, ch.id);
  if (!propRow) return res.status(400).json({ error: 'Pick a property you own as the delivery address.' });

  let item;
  if (kind === 'weapon')      item = weaponById(item_id);
  else if (kind === 'armour') item = armourById(item_id);
  else if (kind === 'ammo')   item = ammoById(item_id);
  else return res.status(400).json({ error: 'Bad item kind.' });
  if (!item) return res.status(400).json({ error: 'Unknown item.' });

  const qty = Math.max(1, Math.min(99, parseInt(rawQty, 10) || 1));
  // Weapons/armour are level-gated by catalogue; ammo isn't.
  if ((kind === 'weapon' || kind === 'armour') && ch.level < item.level) {
    return res.status(403).json({ error: `Requires level ${item.level}.` });
  }

  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  // For ammo, qty is "packs" — actual rounds delivered = packSize * qty.
  const buyUnits = kind === 'ammo' ? item.packSize * qty : qty;
  const baseUnit = kind === 'ammo' ? item.cost : Math.floor((item.cost || 0) * cityMul);
  const totalBase = kind === 'ammo' ? baseUnit * buyUnits : baseUnit * qty;
  const cost = onlinePrice(totalBase);
  if (ch.bank < cost) {
    return res.status(400).json({ error: `Need £${cost.toLocaleString()} in your bank account to pay online.` });
  }

  ch.bank -= cost;
  const now = Date.now();
  const arrives = now + WEAPON_DELIVERY_LEAD_MS;
  db.prepare(`
    INSERT INTO weapon_deliveries
      (char_id, destination_property, kind, item_id, qty, base_cost, cost, ordered_at, arrives_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(ch.id, propRow.id, kind, item.id, buyUnits, totalBase, cost, now, arrives);
  writeLog(ch.id, 'delivery',
    `Ordered ${buyUnits}× ${item.name} (${kind}) online for £${cost.toLocaleString()} — ETA ~${Math.round(WEAPON_DELIVERY_LEAD_MS / 3_600_000)}h.`,
    { kind, item: item.id, qty: buyUnits, property: propRow.id, cost, eta: arrives });
  saveCharacter(ch);
  res.json({ ok: true, arrives_at: arrives, cost, base: totalBase, character: publicCharacter(ch) });
});

export default router;
