import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CITIES, cityById, landReachableFrom, landDistanceBetween, vehicleById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { FLIGHT_CLASSES, flightDurationMs } from '../services/flights.js';

const router = Router();

// Driving across the country: cheap (you're paying for petrol) but
// slow. The condition decay simulates wear-and-tear so very long road
// trips also chew through your car's resale value.
const DRIVE_COST_PER_KM       = 0.10;   // £/km
const DRIVE_MS_PER_KM         = 1500;   // 1.5s per km of road = ~25 min per 1000km
const CONDITION_LOSS_PER_KM   = 1 / 500; // 1% per 500km

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const from = cityById(ch.city);
  const flights = CITIES.filter(c => c.id !== ch.city).map(c => {
    const baseFare = Math.floor((from.flightBase + c.flightBase) / 2);
    return {
      city: c.id, name: c.name, emoji: c.emoji,
      classes: Object.fromEntries(Object.entries(FLIGHT_CLASSES).map(([k, v]) => ([k, {
        cost: Math.floor(baseFare * v.mul),
        durationMs: flightDurationMs(ch.city, c.id, v.durationMul),
      }]))),
    };
  });
  // Drivable destinations — only cities reachable via the LAND_EDGES
  // graph from the player's current city.
  const drives = landReachableFrom(ch.city).map(r => ({
    city: r.city,
    name: r.name,
    km: r.km,
    cost: Math.max(10, Math.round(r.km * DRIVE_COST_PER_KM)),
    durationMs: Math.round(r.km * DRIVE_MS_PER_KM),
    conditionCost: Math.round(r.km * CONDITION_LOSS_PER_KM * 100) / 100,
  }));
  res.json({ flights, drives, currentCity: ch.city });
});

router.post('/fly', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const { city, klass = 'economy' } = req.body || {};
  const target = cityById(city);
  if (!target) return res.status(400).json({ error: 'Unknown city' });
  if (target.id === ch.city) return res.status(400).json({ error: 'Already there' });
  const cls = FLIGHT_CLASSES[klass];
  if (!cls) return res.status(400).json({ error: 'Unknown flight class' });
  // The airline won't carry your active car. Stash it in a local
  // garage (or sell it) before you can board.
  if (ch.active_vehicle_id) {
    return res.status(400).json({ error: 'Stash your car in a garage before flying out.' });
  }
  const from = cityById(ch.city);
  const baseFare = Math.floor((from.flightBase + target.flightBase) / 2);
  const cost = Math.floor(baseFare * cls.mul);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  const dur = flightDurationMs(ch.city, target.id, cls.durationMul);
  ch.cash -= cost;

  // Customs check — every flight rolls if you're carrying drugs. Base 8%
  // chance + 2% per distinct drug type, capped at 25%. If caught: stash
  // seized AND a jail sentence of 30–80 min depending on what was carried.
  const drugRows = db.prepare(
    "SELECT item_id, qty FROM inventory WHERE char_id = ? AND kind = 'drug'"
  ).all(ch.id);
  let busted = false;
  let seized = null;
  let bustJailMin = 0;
  if (drugRows.length > 0) {
    const seizureChance = Math.min(0.25, 0.08 + 0.02 * drugRows.length);
    if (Math.random() < seizureChance) {
      seized = drugRows.map(r => `${r.qty}× ${r.item_id}`).join(', ');
      db.prepare("DELETE FROM inventory WHERE char_id = ? AND kind = 'drug'").run(ch.id);
      // Jail time scales with how many drug types + a little randomness
      bustJailMin = 30 + drugRows.length * 5 + Math.floor(Math.random() * 16);
      ch.jail_until = Date.now() + bustJailMin * 60 * 1000;
      ch.jail_reason = `Customs caught you trying to fly out with ${seized} in your bag — sentenced to ${bustJailMin} minutes.`;
      // Cancel any in-flight travel (you're going to jail, not the airport lounge)
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
    ch.travel_until = Date.now() + dur;
    ch.travel_to = target.id;
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
  const km = landDistanceBetween(ch.city, target.id);
  if (km == null) return res.status(400).json({ error: 'No road from here — you\'ll have to fly.' });
  if (!ch.active_vehicle_id) return res.status(400).json({ error: 'You need an active car to drive between cities.' });

  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) return res.status(404).json({ error: 'Active vehicle missing.' });
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(404).json({ error: 'Vehicle catalogue missing.' });

  const conditionCost = km * CONDITION_LOSS_PER_KM * 100;
  if (row.condition <= conditionCost) {
    return res.status(400).json({
      error: `That ${v.maker} ${v.name} won't make it (${Math.round(row.condition)}%). Repair it before a long drive.`,
    });
  }

  const cost = Math.max(10, Math.round(km * DRIVE_COST_PER_KM));
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()} for petrol.` });
  const dur = Math.round(km * DRIVE_MS_PER_KM);

  ch.cash -= cost;
  // Drop condition on the active car, and pre-place it at the
  // destination — once travel completes, the player and the car will
  // be in the same city and the row's stored city is already correct.
  const newCondition = Math.max(0, row.condition - conditionCost);
  db.prepare('UPDATE vehicles_owned SET condition = ?, city = ? WHERE id = ?')
    .run(newCondition, target.id, row.id);
  ch.travel_until = Date.now() + dur;
  ch.travel_to = target.id;
  saveCharacter(ch);
  writeLog(ch.id, 'travel', `Driving the ${v.maker} ${v.name} to ${target.name} — ${km}km, £${cost} petrol, -${conditionCost.toFixed(1)}% condition.`,
    { vehicle: v.id, km, cost, conditionCost });
  res.json({ ok: true, character: publicCharacter(ch), durationMs: dur, km, cost });
});

export default router;
