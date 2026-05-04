import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CITIES, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

const FLIGHT_CLASSES = {
  economy:    { mul: 1.0, durationMul: 1.0 },
  business:   { mul: 2.5, durationMul: 0.5 },
  first:      { mul: 6.0, durationMul: 0.0 }, // instant
};

function flightDurationMs(fromCity, toCity, durationMul) {
  const from = cityById(fromCity);
  const to = cityById(toCity);
  if (!from || !to) return 0;
  // Simple heuristic: distance proxy is sum of indices spread
  const baseMin = 5 + Math.abs(CITIES.indexOf(from) - CITIES.indexOf(to)) * 2;
  return Math.floor(baseMin * 60 * 1000 * durationMul);
}

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
  res.json({ flights, currentCity: ch.city });
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

export default router;
