// Repair shop — fix up the active vehicle. Cost scales with both
// the car's book price and how much condition needs restoring, so a
// banged-up exotic is far pricier to repair than a banged-up beater.
//
// Repairs always go to 100%. Players can refuse the quote (the GET
// returns the price; the POST commits) but partial repairs would add
// fiddly UI for marginal value.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { vehicleById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

// Cost per percentage point of repair, expressed as a fraction of the
// car's city-adjusted book price. 0.004 ⇒ 50% of repair on a £20k
// city-priced car costs £4k. Higher-tier cars pay proportionally more
// even though they're "the same" % repair, which matches the user's
// "expensive cars are more expensive to repair" intent.
const REPAIR_COST_PER_PCT = 0.004;
const REPAIR_MIN_COST     = 100;

function quote(row, city) {
  const v = vehicleById(row.vehicle_id);
  if (!v) return null;
  const cityMul = cityById(city)?.businessMul || 1.0;
  const cityBook = Math.floor(v.bookPrice * cityMul);
  const missing = Math.max(0, 100 - (row.condition ?? 100));
  const rawCost = missing * REPAIR_COST_PER_PCT * cityBook;
  const cost = missing > 0 ? Math.max(REPAIR_MIN_COST, Math.round(rawCost)) : 0;
  return {
    vehicle_id: v.id,
    name: v.name,
    maker: v.maker,
    tier: v.tier,
    condition: row.condition ?? 100,
    cityBook,
    cost,
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  let active = null;
  if (ch.active_vehicle_id) {
    const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
    if (row) active = quote(row, ch.city);
  }
  res.json({
    cityName: cityById(ch.city)?.name,
    active,
  });
});

router.post('/', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  if (!ch.active_vehicle_id) return res.status(400).json({ error: 'You have no active car to repair.' });
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) return res.status(404).json({ error: 'Active vehicle missing.' });
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(404).json({ error: 'Vehicle catalogue missing.' });
  const cur = row.condition ?? 100;
  if (cur >= 100) return res.status(400).json({ error: 'Already in perfect shape.' });
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const cityBook = Math.floor(v.bookPrice * cityMul);
  const missing = 100 - cur;
  const cost = Math.max(REPAIR_MIN_COST, Math.round(missing * REPAIR_COST_PER_PCT * cityBook));
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()} for repairs.` });

  ch.cash -= cost;
  db.prepare('UPDATE vehicles_owned SET condition = 100 WHERE id = ?').run(row.id);
  saveCharacter(ch);
  writeLog(ch.id, 'shop', `Repaired the ${v.maker} ${v.name} to 100% (-£${cost.toLocaleString()}, was ${Math.round(cur)}%).`, { vehicle: v.id, cost, fromCondition: cur });
  res.json({ ok: true, cost, character: publicCharacter(ch) });
});

export default router;
