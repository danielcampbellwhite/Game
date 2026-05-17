import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CITIES, cityById, landReachableFrom, landDistanceBetween, vehicleById, specPerk } from '../data.js';
import { saveCharacter, publicCharacter, applyJailSentence } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { FLIGHT_CLASSES, flightDurationMs } from '../services/flights.js';
import { interDriveFuelCost, maxKmOnFullTank } from '../services/fuel.js';
import {
  BOARDING_WINDOW_MS,
  bookableSlots, earliestBookableSlot, inBoardingWindow,
  isSlotBookable, scheduleSnapshot,
} from '../services/flight-schedule.js';

const router = Router();

// Driving across the country: cheap (you're paying for petrol) but
// slow. The condition decay simulates wear-and-tear so very long road
// trips also chew through your car's resale value.
const DRIVE_COST_PER_KM       = 0.10;   // £/km
const DRIVE_MS_PER_KM         = 1500;   // 1.5s per km of road = ~25 min per 1000km
const CONDITION_LOSS_PER_KM   = 1 / 500; // 1% per 500km

// Lazy cleanup — flips any of the player's tickets that have lapsed
// (departs_at has passed without a boarding) to 'missed'. Called on
// every list/buy/board.
function expireLapsedTickets(charId, now = Date.now()) {
  db.prepare(`
    UPDATE flight_tickets SET status = 'missed'
    WHERE char_id = ? AND status = 'booked' AND departs_at <= ?
  `).run(charId, now);
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const from = cityById(ch.city);
  const now = Date.now();
  expireLapsedTickets(ch.id, now);
  const schedule = scheduleSnapshot(now);
  // Tickets the player already holds, keyed below per route so each
  // destination card can grey-out the slots they've already bought.
  const myTickets = db.prepare(`
    SELECT id, from_city, to_city, class, cost, departs_at, status
    FROM flight_tickets
    WHERE char_id = ? AND status = 'booked' AND from_city = ?
    ORDER BY departs_at ASC
  `).all(ch.id, ch.city);
  const bookedByRoute = {};
  for (const t of myTickets) {
    const key = `${t.to_city}`;
    (bookedByRoute[key] = bookedByRoute[key] || new Set()).add(t.departs_at);
  }
  const flights = CITIES.filter(c => c.id !== ch.city).map(c => {
    const baseFare = Math.floor((from.flightBase + c.flightBase) / 2);
    const unlockLevel = c.unlockLevel || 1;
    const taken = bookedByRoute[c.id] || new Set();
    return {
      city: c.id, name: c.name, emoji: c.emoji,
      unlockLevel,
      locked: ch.level < unlockLevel,
      classes: Object.fromEntries(Object.entries(FLIGHT_CLASSES).map(([k, v]) => ([k, {
        cost: Math.floor(baseFare * v.mul),
        durationMs: flightDurationMs(ch.city, c.id, v.durationMul),
      }]))),
      // Per-slot availability for THIS destination — the slot list is
      // shared across all routes; only the "already-booked" flags vary.
      slots: schedule.slots.map(t => ({ departs_at: t, taken: taken.has(t) })),
    };
  });
  // Drivable destinations — only cities reachable via the LAND_EDGES
  // graph from the player's current city.
  const drives = landReachableFrom(ch.city).map(r => {
    const c = cityById(r.city);
    const unlockLevel = c?.unlockLevel || 1;
    return {
      city: r.city,
      name: r.name,
      km: r.km,
      cost: Math.max(10, Math.round(r.km * DRIVE_COST_PER_KM)),
      durationMs: Math.round(r.km * DRIVE_MS_PER_KM),
      conditionCost: Math.round(r.km * CONDITION_LOSS_PER_KM * 100) / 100,
      unlockLevel,
      locked: ch.level < unlockLevel,
    };
  });
  res.json({
    flights,
    drives,
    currentCity: ch.city,
    schedule,
    tickets: myTickets.map(t => ({
      ...t,
      boardingOpensAt: t.departs_at - BOARDING_WINDOW_MS,
      isBoarding: inBoardingWindow(t.departs_at, now),
    })),
  });
});

// Buy a ticket for a specific scheduled departure. `departs_at` is an
// ms timestamp from the slot list returned by GET / — caller picks
// which slot they want. Players may hold multiple tickets per route
// (one per slot) but never two seats on the same slot.
router.post('/ticket', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const { city, klass = 'economy', departs_at } = req.body || {};
  const target = cityById(city);
  if (!target) return res.status(400).json({ error: 'Unknown city' });
  if (target.id === ch.city) return res.status(400).json({ error: "Already there." });
  if (ch.level < (target.unlockLevel || 1)) {
    return res.status(403).json({ error: `${target.name} unlocks at level ${target.unlockLevel}.` });
  }
  const cls = FLIGHT_CLASSES[klass];
  if (!cls) return res.status(400).json({ error: 'Unknown flight class' });
  if (ch.active_vehicle_id) {
    return res.status(400).json({ error: 'Stash your car in a garage before booking a flight.' });
  }
  if (ch.active_premium_vehicle_id) {
    return res.status(400).json({ error: 'Park your premium car (from the Premium page) before booking a flight.' });
  }
  const now = Date.now();
  expireLapsedTickets(ch.id, now);

  // Resolve the departure slot. If the caller didn't pick one, fall
  // back to the earliest bookable slot so a "just book the next one"
  // call still works.
  let slot = parseInt(departs_at, 10);
  if (!Number.isFinite(slot)) slot = earliestBookableSlot(now);
  if (!isSlotBookable(slot, now)) {
    return res.status(400).json({ error: 'That departure has already left or is past the bookable horizon.' });
  }
  // One seat per (route, slot). Multiple slots on the same route are fine.
  const dupe = db.prepare(
    "SELECT id FROM flight_tickets WHERE char_id = ? AND status = 'booked' AND from_city = ? AND to_city = ? AND departs_at = ?"
  ).get(ch.id, ch.city, target.id, slot);
  if (dupe) return res.status(409).json({ error: 'You already hold a seat on that departure.' });

  const from = cityById(ch.city);
  const baseFare = Math.floor((from.flightBase + target.flightBase) / 2);
  const cost = Math.floor(baseFare * cls.mul);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()}` });

  ch.cash -= cost;
  db.prepare(`
    INSERT INTO flight_tickets (char_id, from_city, to_city, class, cost, departs_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)
  `).run(ch.id, ch.city, target.id, klass, cost, slot, now);
  saveCharacter(ch);
  writeLog(ch.id, 'travel',
    `Booked ${klass} ticket to ${target.name} for £${cost.toLocaleString()}, departs ${new Date(slot).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}.`);
  res.json({ ok: true, departsAt: slot, character: publicCharacter(ch) });
});

// Board a flight — only valid in the 1-minute window before takeoff.
// Triggers the customs roll (drug seizure) and, on success, puts the
// player into transit for the flight's duration.
router.post('/board/:ticketId', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const ticketId = parseInt(req.params.ticketId, 10);
  const now = Date.now();
  expireLapsedTickets(ch.id, now);
  const t = db.prepare(
    "SELECT * FROM flight_tickets WHERE id = ? AND char_id = ?"
  ).get(ticketId, ch.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found.' });
  if (t.status !== 'booked') return res.status(400).json({ error: `Ticket already ${t.status}.` });
  if (t.from_city !== ch.city) return res.status(400).json({ error: 'You\'re not at the right airport.' });
  if (!inBoardingWindow(t.departs_at, now)) {
    const eta = Math.max(0, t.departs_at - BOARDING_WINDOW_MS - now);
    return res.status(400).json({ error: `Boarding opens in ${Math.ceil(eta / 1000)}s.` });
  }
  if (ch.active_vehicle_id) {
    return res.status(400).json({ error: 'Stash your car in a garage before flying.' });
  }
  if (ch.active_premium_vehicle_id) {
    return res.status(400).json({ error: 'Park your premium car before flying.' });
  }
  const target = cityById(t.to_city);
  if (!target) return res.status(400).json({ error: 'Destination missing.' });
  const cls = FLIGHT_CLASSES[t.class];
  if (!cls) return res.status(400).json({ error: 'Class missing.' });
  const dur = flightDurationMs(t.from_city, t.to_city, cls.durationMul);

  // Customs check — drugs in your bag get seized at the gate, with a
  // jail sentence that scales with the variety carried. Same risk
  // model the old /fly endpoint used; just moved to the boarding
  // gate so it lands in the dramatic moment. Unlicensed weapons
  // (bought on the corner, kind='weapon_illegal') count the same.
  const contrabandRows = db.prepare(
    "SELECT kind, item_id, qty FROM inventory WHERE char_id = ? AND kind IN ('drug', 'weapon_illegal')"
  ).all(ch.id);
  let busted = false; let seized = null; let bustJailMin = 0;
  if (contrabandRows.length > 0) {
    const seizureChance = Math.min(0.25, 0.08 + 0.02 * contrabandRows.length);
    if (Math.random() < seizureChance) {
      seized = contrabandRows.map(r => `${r.qty}× ${r.item_id}${r.kind === 'weapon_illegal' ? ' (unlicensed)' : ''}`).join(', ');
      db.prepare("DELETE FROM inventory WHERE char_id = ? AND kind IN ('drug', 'weapon_illegal')").run(ch.id);
      bustJailMin = 30 + contrabandRows.length * 5 + Math.floor(Math.random() * 16);
      applyJailSentence(ch, bustJailMin * 60 * 1000, `Customs caught you trying to fly out with ${seized} — sentenced to ${bustJailMin} minutes.`);
      ch.travel_until = null;
      ch.travel_to = null;
      busted = true;
    }
  }

  db.prepare("UPDATE flight_tickets SET status = ? WHERE id = ?").run('boarded', t.id);

  if (busted) {
    writeLog(ch.id, 'travel', ` Customs seized your stash: ${seized}. Jailed ${bustJailMin} min.`, null, true);
  } else if (dur === 0) {
    ch.city = target.id;
    ch.travel_until = null;
    ch.travel_to = null;
    writeLog(ch.id, 'travel', `Instant first-class to ${target.name}.`);
  } else {
    // Boarding can happen anywhere inside the 5-min boarding window,
    // but the flight itself doesn't move until the scheduled takeoff.
    // Anchor travel_started_at to t.departs_at so the TravelMap holds
    // the plane on the origin marker until the clock hits takeoff.
    const takeoffAt = t.departs_at;
    ch.travel_started_at = takeoffAt;
    ch.travel_until = takeoffAt + dur;
    ch.travel_to = target.id;
    ch.travel_mode = 'plane';
    const minsToTakeoff = Math.max(0, Math.ceil((takeoffAt - Date.now()) / 60000));
    writeLog(ch.id, 'travel',
      `Boarded ${t.class} flight to ${target.name}. Pushback in ${minsToTakeoff} min, flight time ${Math.round(dur/60000)} min.`);
  }
  saveCharacter(ch);
  res.json({ ok: true, busted, seized, jailMin: bustJailMin, character: publicCharacter(ch) });
});

router.post('/fly', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const { city, klass = 'economy' } = req.body || {};
  const target = cityById(city);
  if (!target) return res.status(400).json({ error: 'Unknown city' });
  if (target.id === ch.city) return res.status(400).json({ error: 'Already there' });
  if (ch.level < (target.unlockLevel || 1)) {
    return res.status(403).json({ error: `${target.name} unlocks at level ${target.unlockLevel}.` });
  }
  const cls = FLIGHT_CLASSES[klass];
  if (!cls) return res.status(400).json({ error: 'Unknown flight class' });
  // The airline won't carry your active car. Stash it in a local
  // garage (or sell it) before you can board.
  if (ch.active_vehicle_id) {
    return res.status(400).json({ error: 'Stash your car in a garage before flying out.' });
  }
  if (ch.active_premium_vehicle_id) {
    return res.status(400).json({ error: 'Park your premium car before flying out.' });
  }
  const from = cityById(ch.city);
  const baseFare = Math.floor((from.flightBase + target.flightBase) / 2);
  const cost = Math.floor(baseFare * cls.mul);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  const dur = flightDurationMs(ch.city, target.id, cls.durationMul);
  ch.cash -= cost;

  // Customs check — every flight rolls if you're carrying drugs OR
  // unlicensed weapons (kind='weapon_illegal'). Base 8% + 2% per
  // distinct contraband line, capped at 25%. Caught = stash seized +
  // 30-80 min inside depending on how many lines triggered it.
  const contrabandRows = db.prepare(
    "SELECT kind, item_id, qty FROM inventory WHERE char_id = ? AND kind IN ('drug', 'weapon_illegal')"
  ).all(ch.id);
  let busted = false;
  let seized = null;
  let bustJailMin = 0;
  if (contrabandRows.length > 0) {
    const seizureChance = Math.min(0.25, 0.08 + 0.02 * contrabandRows.length);
    if (Math.random() < seizureChance) {
      seized = contrabandRows.map(r => `${r.qty}× ${r.item_id}${r.kind === 'weapon_illegal' ? ' (unlicensed)' : ''}`).join(', ');
      db.prepare("DELETE FROM inventory WHERE char_id = ? AND kind IN ('drug', 'weapon_illegal')").run(ch.id);
      bustJailMin = 30 + contrabandRows.length * 5 + Math.floor(Math.random() * 16);
      applyJailSentence(ch, bustJailMin * 60 * 1000, `Customs caught you trying to fly out with ${seized} in your bag — sentenced to ${bustJailMin} minutes.`);
      ch.travel_until = null;
      ch.travel_to = null;
      busted = true;
    }
  }

  if (busted) {
    // Caught at the gate — never made it onto the flight.
    writeLog(ch.id, 'travel', ` Customs seized your stash: ${seized}. Jailed ${bustJailMin} min.`, null, true);
  } else if (dur === 0) {
    ch.city = target.id;
    ch.travel_until = null;
    ch.travel_to = null;
    writeLog(ch.id, 'travel', `Instant first-class to ${target.name} (£${cost}).`);
  } else {
    const now3 = Date.now();
    ch.travel_started_at = now3;
    ch.travel_until = now3 + dur;
    ch.travel_to = target.id;
    ch.travel_mode = 'plane';
    writeLog(ch.id, 'travel', `Boarded ${klass} flight to ${target.name} (£${cost}, ${Math.round(dur/60000)} min).`);
  }
  saveCharacter(ch);
  res.json({ ok: true, busted, seized, jailMin: bustJailMin, character: publicCharacter(ch) });
});

// Drive your active car to a city connected by road. Avoids the
// customs check at the airport (no drug seizure roll), takes the
// active car along (no need to store/equip), and is much cheaper
// than flying — but slower, and chews through condition.
router.post('/drive', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const target = cityById(req.body?.city);
  if (!target) return res.status(400).json({ error: 'Unknown city' });
  if (target.id === ch.city) return res.status(400).json({ error: 'Already there' });
  if (ch.level < (target.unlockLevel || 1)) {
    return res.status(403).json({ error: `${target.name} unlocks at level ${target.unlockLevel}.` });
  }
  const km = landDistanceBetween(ch.city, target.id);
  if (km == null) return res.status(400).json({ error: 'No road from here — you\'ll have to fly.' });
  if (!ch.active_vehicle_id) return res.status(400).json({ error: 'You need an active car to drive between cities.' });

  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) return res.status(404).json({ error: 'Active vehicle missing.' });
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(404).json({ error: 'Vehicle catalogue missing.' });

  // Higher driving skill = lighter foot. 1 → near-full damage,
  // 80 (cap) → 60% of base damage. Floor 0.4 so the dampener never
  // disappears entirely.
  const skillDampener = Math.max(0.4, 1 - (ch.driving ?? 1) * 0.005);
  // Wheelman 'Heavy foot' shaves another flat % off the cost
  // (specPerk returns a negative value, e.g. -0.20).
  const wheelmanMul = Math.max(0.05, 1 + specPerk(ch, 'drive_condition_pct'));
  const conditionCost = km * CONDITION_LOSS_PER_KM * 100 * skillDampener * wheelmanMul;
  if (row.condition <= conditionCost) {
    return res.status(400).json({
      error: `That ${v.maker} ${v.name} won't make it (${Math.round(row.condition)}%). Repair it before a long drive.`,
    });
  }

  const cost = Math.max(10, Math.round(km * DRIVE_COST_PER_KM));
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()} for tolls and route fees.` });

  // Fuel check — the tank has to cover this distance. Per-km burn
  // scales by vehicle tier; see services/fuel.js. Reject before we
  // touch any other state if there isn't enough in the tank.
  const fuelNeeded = interDriveFuelCost(row.vehicle_id, km);
  if ((row.fuel ?? 100) < fuelNeeded) {
    const tankMax = maxKmOnFullTank(row.vehicle_id);
    return res.status(400).json({
      error: `Tank can't cover ${km}km. Refill the ${v.maker} ${v.name} first (full tank ≈ ${tankMax}km on this engine).`,
    });
  }

  const dur = Math.round(km * DRIVE_MS_PER_KM);

  ch.cash -= cost;
  // Drop condition + fuel on the active car, and pre-place it at the
  // destination — once travel completes, the player and the car will
  // be in the same city and the row's stored city is already correct.
  const newCondition = Math.max(0, row.condition - conditionCost);
  const newFuel      = Math.max(0, (row.fuel ?? 100) - fuelNeeded);
  db.prepare('UPDATE vehicles_owned SET condition = ?, fuel = ?, city = ? WHERE id = ?')
    .run(newCondition, newFuel, target.id, row.id);
  const nowDrive = Date.now();
  ch.travel_started_at = nowDrive;
  ch.travel_until = nowDrive + dur;
  ch.travel_mode = 'car';
  ch.travel_to = target.id;
  saveCharacter(ch);
  writeLog(ch.id, 'travel', `Driving the ${v.maker} ${v.name} to ${target.name} — ${km}km, £${cost} in tolls, -${conditionCost.toFixed(1)}% condition, -${Math.round(fuelNeeded)}% fuel (tank ${Math.round(newFuel)}%).`,
    { vehicle: v.id, km, cost, conditionCost, fuelUsed: fuelNeeded, fuelAfter: newFuel });
  res.json({ ok: true, character: publicCharacter(ch), durationMs: dur, km, cost, fuelUsed: fuelNeeded, fuelAfter: newFuel });
});

export default router;
