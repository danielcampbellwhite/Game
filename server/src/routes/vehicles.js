// Vehicle-wide actions that aren't tied to the dealership / chop
// shop / repair flows. Currently: fuel refill. Lives at /api/vehicles
// and works from anywhere — no location gate — because being
// stranded out of fuel is bad enough UX without forcing a walk to
// a specific building.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { refillVehicleToFull, refillCost } from '../services/fuel.js';
import { vehicleById } from '../data.js';
import { writeLog } from '../services/log.js';

const router = Router();

// GET /api/vehicles/refill-quote — peek at the cost without
// committing. Useful for the inventory UI to display "Refill £X"
// before the player taps. Returns the active vehicle's quote.
router.get('/refill-quote', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  if (!ch.active_vehicle_id) return res.json({ active: false });
  const row = db.prepare('SELECT id, vehicle_id, fuel FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) return res.json({ active: false });
  const cost = refillCost(row.vehicle_id, row.fuel ?? 100);
  const v = vehicleById(row.vehicle_id);
  res.json({
    active: true,
    vehicle_id: row.id,
    name: v ? `${v.maker} ${v.name}` : 'Active vehicle',
    fuel: row.fuel ?? 100,
    full: row.fuel >= 100,
    cost,
  });
});

// POST /api/vehicles/refill — refills the ACTIVE vehicle to full,
// charges cost from cash. Returns the updated character + the new
// fuel value so the client can re-render without a second fetch.
router.post('/refill', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const r = refillVehicleToFull(ch);
  if (r.error) return res.status(400).json({ error: r.error });
  const row = db.prepare('SELECT vehicle_id FROM vehicles_owned WHERE id = ?').get(ch.active_vehicle_id);
  const v = row ? vehicleById(row.vehicle_id) : null;
  const name = v ? `${v.maker} ${v.name}` : 'the active vehicle';
  writeLog(ch.id, 'travel', `Filled up ${name} — £${r.cost.toLocaleString()}, tank full.`,
    { vehicle_row: ch.active_vehicle_id, cost: r.cost, refilled: r.refilled });
  saveCharacter(ch);
  res.json({ ok: true, cost: r.cost, refilled: r.refilled, fuel: r.fuel, character: publicCharacter(ch) });
});

export default router;
