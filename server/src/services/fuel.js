// Vehicle fuel system. Each owned car has a `fuel` tank (0-100, REAL)
// that drains when the car is driven. Empty tank = can't drive until
// you refill. Refill cost scales with vehicle tier (bigger engines =
// pricier fill-ups). The fuel tank is separate from the cash "petrol
// cost" already charged on inter-city drives — that's tolls /
// route fees; this is the literal tank in the car.

import { db } from '../db.js';
import { vehicleById } from '../data.js';

// % of tank used per intra-city drive (10s short trip). Higher
// tiers eat more fuel per hop — a Beater barely sips it; a
// luxury hypercar drinks.
const INTRA_FUEL_BY_TIER = { 1: 3, 2: 4, 3: 5, 4: 7, 5: 10 };

// % of tank used per km on an inter-city road trip. Calibrated so
// a full tank in a tier-1 beater covers ~5000km; a tier-5 luxury
// covers ~2000km.
const INTER_FUEL_PER_KM_BY_TIER = { 1: 0.02, 2: 0.03, 3: 0.035, 4: 0.04, 5: 0.05 };

// Cost to refill an EMPTY tank to FULL, by tier. Refill at any
// fuel level is proportional: (100 - currentFuel) / 100 * full.
const REFILL_FULL_COST_BY_TIER = { 1: 100, 2: 200, 3: 400, 4: 800, 5: 1500 };

function tierOf(vehicleId) {
  return vehicleById(vehicleId)?.tier || 1;
}

// Fuel cost for ONE intra-city drive in this vehicle.
export function intraDriveFuelCost(vehicleId) {
  return INTRA_FUEL_BY_TIER[tierOf(vehicleId)] || INTRA_FUEL_BY_TIER[3];
}

// Fuel cost for a km-distance inter-city drive in this vehicle.
export function interDriveFuelCost(vehicleId, km) {
  const rate = INTER_FUEL_PER_KM_BY_TIER[tierOf(vehicleId)] || INTER_FUEL_PER_KM_BY_TIER[3];
  return Math.max(0.1, km * rate);
}

// Cash cost to refill `currentFuel` (0-100) back to 100.
export function refillCost(vehicleId, currentFuel) {
  const full = REFILL_FULL_COST_BY_TIER[tierOf(vehicleId)] || REFILL_FULL_COST_BY_TIER[3];
  const fraction = Math.max(0, Math.min(100, 100 - (currentFuel || 0))) / 100;
  return Math.max(1, Math.round(full * fraction));
}

// Maximum km a full tank covers for this vehicle. Used to warn the
// player before they commit to an inter-city drive they can't finish.
export function maxKmOnFullTank(vehicleId) {
  const rate = INTER_FUEL_PER_KM_BY_TIER[tierOf(vehicleId)] || INTER_FUEL_PER_KM_BY_TIER[3];
  return Math.floor(100 / rate);
}

// Atomic fuel debit on the vehicle. Returns { ok, fuel } when the
// debit lands, { error } when there isn't enough in the tank.
// Caller is responsible for everything else (the trip itself, logs,
// etc.) — this is just the tank arithmetic.
export function consumeFuel(vehicleRowId, amount) {
  const row = db.prepare('SELECT fuel FROM vehicles_owned WHERE id = ?').get(vehicleRowId);
  if (!row) return { error: 'Vehicle not found.' };
  const current = row.fuel ?? 100;
  if (current < amount) {
    return { error: `Not enough fuel — tank at ${Math.round(current)}%, need ${Math.round(amount)}%.`, fuel: current };
  }
  const next = Math.max(0, current - amount);
  db.prepare('UPDATE vehicles_owned SET fuel = ? WHERE id = ?').run(next, vehicleRowId);
  return { ok: true, fuel: next };
}

// Refill the active vehicle to FULL, charging the proportional cost
// out of the character's cash. Returns { ok, refilled, cost, fuel }
// or { error }.
export function refillVehicleToFull(ch) {
  if (!ch.active_vehicle_id) return { error: 'No active vehicle to refill.' };
  const row = db.prepare('SELECT id, vehicle_id, fuel FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) return { error: 'Active vehicle missing.' };
  const current = row.fuel ?? 100;
  if (current >= 100) return { error: 'Tank is already full.' };
  const cost = refillCost(row.vehicle_id, current);
  if (ch.cash < cost) return { error: `Need £${cost.toLocaleString()} for a full refill.` };
  ch.cash -= cost;
  db.prepare('UPDATE vehicles_owned SET fuel = 100 WHERE id = ?').run(row.id);
  return { ok: true, refilled: 100 - current, cost, fuel: 100 };
}
