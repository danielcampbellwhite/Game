// Private hangar + aircraft endpoints. All gated to the airport
// location — the hangar lives there, so buying / upgrading / flying
// only happens when the player is physically at the airport.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { requireAtLocation } from '../middleware/location.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import {
  HANGAR_PURCHASE_COST, HANGAR_MAX, SLOT_UPGRADE_COSTS,
  loadHangar, loadHangars, hangarSummary, buyHangar, upgradeHangarSlot,
  hangarHasFreeSlot,
} from '../services/hangar.js';
import {
  AIRCRAFT, aircraftById, AIRCRAFT_FUEL_PER_KM, AIRCRAFT_REFILL_FULL_COST,
  AIRCRAFT_MS_PER_KM, cityById, vehicleById, landDistanceBetween,
} from '../data.js';

const router = Router();
const atAirport = [requireAuth, requireCharacter, requireAtLocation('airport')];

// GET / — overview for the current city's airport: hangar status,
// aircraft for sale, upgrade prices, and the player's hangars
// across all cities.
router.get('/', ...atAirport, (req, res) => {
  const ch = req.character;
  const here = hangarSummary(ch.id, ch.city);
  const all  = loadHangars(ch.id).map(h => ({
    id: h.id, city: h.city, cityName: cityById(h.city)?.name,
    plane_slots: h.plane_slots, heli_slots: h.heli_slots, car_slots: h.car_slots,
  }));
  // List my aircraft in the local hangar (city-scoped, class != car).
  const myAircraft = here ? db.prepare(`
    SELECT id, vehicle_id, class, condition, fuel, acquired_at
    FROM vehicles_owned
    WHERE char_id = ? AND city = ? AND class != 'car'
    ORDER BY acquired_at DESC
  `).all(ch.id, ch.city).map(r => {
    const a = aircraftById(r.vehicle_id);
    return a ? {
      id: r.id, vehicle_id: a.id, name: a.name, maker: a.maker, class: r.class,
      tier: a.tier, condition: r.condition, fuel: r.fuel,
    } : null;
  }).filter(Boolean) : [];
  res.json({
    city: ch.city, cityName: cityById(ch.city)?.name,
    hangar: here,                                 // null if not owned
    purchaseCost: HANGAR_PURCHASE_COST,
    maxSlots: HANGAR_MAX,
    upgradeCosts: SLOT_UPGRADE_COSTS,
    aircraft_catalog: AIRCRAFT,
    my_aircraft_here: myAircraft,
    my_hangars: all,
  });
});

// POST /buy — buy a base hangar in the current city.
router.post('/buy', ...atAirport, (req, res) => {
  const ch = req.character;
  const r = buyHangar(ch);
  if (r.error) return res.status(400).json({ error: r.error });
  writeLog(ch.id, 'aviation', ` Bought a hangar at ${cityById(ch.city)?.name} airport — £${r.cost.toLocaleString()}.`, { city: ch.city }, true);
  saveCharacter(ch);
  res.json({ ok: true, cost: r.cost, hangar: hangarSummary(ch.id, ch.city), character: publicCharacter(ch) });
});

// POST /upgrade { slot: 'plane' | 'helicopter' | 'car' } — bump a
// slot count by 1, charged out of cash. Server enforces caps + price.
router.post('/upgrade', ...atAirport, (req, res) => {
  const ch = req.character;
  const slot = req.body?.slot;
  if (!['plane', 'helicopter', 'car'].includes(slot)) {
    return res.status(400).json({ error: 'Bad slot.' });
  }
  const r = upgradeHangarSlot(ch, slot);
  if (r.error) return res.status(400).json({ error: r.error });
  writeLog(ch.id, 'aviation', `Upgraded ${slot} slot in ${cityById(ch.city)?.name} hangar — £${r.cost.toLocaleString()}, now ${r.new_capacity}.`,
    { city: ch.city, slot, cost: r.cost, new_capacity: r.new_capacity });
  saveCharacter(ch);
  res.json({ ok: true, cost: r.cost, hangar: hangarSummary(ch.id, ch.city), character: publicCharacter(ch) });
});

// POST /buy-aircraft { aircraft_id } — purchase from the airport
// dealer; aircraft drops straight into your local hangar. Requires
// a free slot of the matching class.
router.post('/buy-aircraft', ...atAirport, (req, res) => {
  const ch = req.character;
  const a = aircraftById(req.body?.aircraft_id);
  if (!a) return res.status(400).json({ error: 'Unknown aircraft.' });
  const hangar = hangarSummary(ch.id, ch.city);
  if (!hangar) return res.status(400).json({ error: 'You need a hangar in this city first.' });
  const slot = hangar.slots[a.class];
  if (!slot || slot.free <= 0) {
    return res.status(400).json({ error: `Your local hangar is out of ${a.class} space — upgrade or sell first.` });
  }
  if (ch.cash < a.bookPrice) return res.status(400).json({ error: `Need £${a.bookPrice.toLocaleString()}.` });
  ch.cash -= a.bookPrice;
  const now = Date.now();
  db.prepare(`
    INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, condition, fuel, class)
    VALUES (?, ?, 'bought', ?, ?, 100, 100, ?)
  `).run(ch.id, a.id, ch.city, now, a.class);
  writeLog(ch.id, 'aviation', ` Bought a ${a.maker} ${a.name} — £${a.bookPrice.toLocaleString()}, parked in your ${cityById(ch.city)?.name} hangar.`,
    { aircraft: a.id, city: ch.city, cost: a.bookPrice }, true);
  saveCharacter(ch);
  res.json({ ok: true, cost: a.bookPrice, character: publicCharacter(ch), hangar: hangarSummary(ch.id, ch.city) });
});

// POST /fly { aircraft_row_id, to_city } — fly your own aircraft to
// another city. Validates: aircraft in current city's hangar; you
// have a hangar at the destination with a free slot of the matching
// class; the tank can cover the distance. Also handles parking the
// car you drove to the airport in: if there's an active car AND the
// hangar has a free car slot, the car is auto-stashed at the local
// hangar (active_vehicle_id cleared). If no car slot is free we
// refuse the flight rather than abandoning the car in the road.
router.post('/fly', ...atAirport, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const rowId = parseInt(req.body?.aircraft_row_id, 10);
  const toCity = req.body?.to_city;
  if (!Number.isFinite(rowId)) return res.status(400).json({ error: 'Bad aircraft.' });
  const target = cityById(toCity);
  if (!target) return res.status(400).json({ error: 'Unknown destination city.' });
  if (target.id === ch.city) return res.status(400).json({ error: 'Already in that city.' });
  if (ch.level < (target.unlockLevel || 1)) {
    return res.status(403).json({ error: `${target.name} unlocks at level ${target.unlockLevel}.` });
  }
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(rowId, ch.id);
  if (!row || row.city !== ch.city) return res.status(400).json({ error: 'That aircraft is not in this hangar.' });
  if (row.class === 'car') return res.status(400).json({ error: 'Cars don\'t fly. Drive instead.' });
  const a = aircraftById(row.vehicle_id);
  if (!a) return res.status(400).json({ error: 'Aircraft catalogue missing.' });

  // Destination hangar must exist and have free space.
  if (!hangarHasFreeSlot(ch.id, target.id, a.class)) {
    return res.status(400).json({
      error: `No free ${a.class} space at your ${target.name} hangar — buy or upgrade one before you take off.`,
    });
  }

  // Distance — same land-distance map as cars use. If no link, we
  // still allow the flight (aircraft don't need a road), but use
  // a Haversine-ish fallback... actually for V1 we'll just require
  // a known link and improve later. landDistanceBetween returns
  // null for unlinked pairs.
  const km = landDistanceBetween(ch.city, target.id);
  if (km == null) return res.status(400).json({ error: 'No flight plan filed for this pair yet — pick another destination.' });

  // Fuel check on the aircraft tank.
  const rate = AIRCRAFT_FUEL_PER_KM[a.class][a.tier];
  const fuelNeeded = Math.max(0.1, km * rate);
  if ((row.fuel ?? 100) < fuelNeeded) {
    return res.status(400).json({
      error: `Tank can't cover ${km}km. Refuel before take-off.`,
    });
  }

  // Handle the car-park step: if the player drove here, stash the
  // car in the local hangar's car slot. Refuse if no slot free.
  const localHangar = hangarSummary(ch.id, ch.city);
  if (ch.active_vehicle_id) {
    if (!localHangar || localHangar.slots.car.free <= 0) {
      return res.status(400).json({
        error: 'Your local hangar has no free car space — store the car elsewhere first.',
      });
    }
    // City was already this city; just clear active so the slot
    // counter on next hangar read reflects it.
    ch.active_vehicle_id = null;
  }

  // Debit fuel + reposition aircraft city to destination ahead of
  // arrival (mirrors how cars are pre-placed on /travel/drive).
  const newFuel = Math.max(0, (row.fuel ?? 100) - fuelNeeded);
  db.prepare('UPDATE vehicles_owned SET fuel = ?, city = ? WHERE id = ?').run(newFuel, target.id, row.id);

  const dur = Math.max(1500, Math.round(km * AIRCRAFT_MS_PER_KM[a.class]));
  ch.travel_until = Date.now() + dur;
  ch.travel_to    = target.id;
  saveCharacter(ch);
  writeLog(ch.id, 'aviation', ` Flying the ${a.maker} ${a.name} to ${target.name} — ${km}km, ${Math.round(fuelNeeded)}% fuel.`,
    { aircraft: a.id, km, fuelUsed: fuelNeeded, fuelAfter: newFuel, to: target.id });
  res.json({
    ok: true, durationMs: dur, km,
    fuelUsed: fuelNeeded, fuelAfter: newFuel,
    character: publicCharacter(ch),
  });
});

// POST /refuel { aircraft_row_id } — fill an aircraft tank to 100.
// Same shape as /api/vehicles/refill but for aircraft (which use a
// different per-tier price table).
router.post('/refuel', ...atAirport, (req, res) => {
  const ch = req.character;
  const rowId = parseInt(req.body?.aircraft_row_id, 10);
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(rowId, ch.id);
  if (!row) return res.status(404).json({ error: 'Aircraft not found.' });
  if (row.class === 'car') return res.status(400).json({ error: 'Use /vehicles/refill for cars.' });
  if (row.city !== ch.city) return res.status(400).json({ error: 'That aircraft is at another hangar.' });
  if ((row.fuel ?? 100) >= 100) return res.status(400).json({ error: 'Tank is already full.' });
  const a = aircraftById(row.vehicle_id);
  if (!a) return res.status(400).json({ error: 'Aircraft catalogue missing.' });
  const full = AIRCRAFT_REFILL_FULL_COST[a.class][a.tier];
  const fraction = (100 - (row.fuel ?? 100)) / 100;
  const cost = Math.max(1, Math.round(full * fraction));
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()} for a full tank.` });
  ch.cash -= cost;
  db.prepare('UPDATE vehicles_owned SET fuel = 100 WHERE id = ?').run(row.id);
  writeLog(ch.id, 'aviation', `Refuelled the ${a.maker} ${a.name} at ${cityById(ch.city)?.name} — £${cost.toLocaleString()}.`,
    { aircraft: a.id, cost });
  saveCharacter(ch);
  res.json({ ok: true, cost, fuel: 100, character: publicCharacter(ch) });
});

export default router;
