// Garage capacity per city — sum of `garage` on every property the
// character owns in that city. Vehicles live in a city until shipped
// elsewhere, so each city has its own cap. Used to gate dealer
// purchases and inter-city shipping.
//
// Premium properties (account-bound) also contribute slots when their
// matching city is active — e.g. owning the Burj Khalifa Penthouse
// adds 15 garage slots in Dubai, on top of any normal property held
// in the same city.

import { db } from '../db.js';
import { propertyById } from '../data.js';
import { getPremiumPropertyBonusesForUser, userIdForChar } from './premium.js';

export function garageCapacity(charId, city) {
  if (!city) return 0;
  const rows = db.prepare(
    'SELECT property_id FROM properties_owned WHERE char_id = ? AND city = ?'
  ).all(charId, city);
  let cap = 0;
  for (const r of rows) {
    const p = propertyById(r.property_id);
    cap += p?.garage || 0;
  }
  cap += getPremiumPropertyBonusesForUser(userIdForChar(charId), city).garage;
  return cap;
}

// Vehicles parked in city's garages — excludes the player's active
// vehicle, which logically follows them around rather than occupying
// a space. The active row keeps a city value for bookkeeping but is
// not counted for capacity until it gets stored.
export function vehicleCount(charId, city) {
  if (!city) return 0;
  const r = db.prepare(`
    SELECT COUNT(*) AS n
    FROM vehicles_owned v
    LEFT JOIN characters c ON c.id = v.char_id
    WHERE v.char_id = ? AND v.city = ?
      AND (c.active_vehicle_id IS NULL OR v.id != c.active_vehicle_id)
  `).get(charId, city);
  return r?.n || 0;
}

export function freeGarageSpace(charId, city) {
  return Math.max(0, garageCapacity(charId, city) - vehicleCount(charId, city));
}

// Returns the active vehicle's row joined with the catalogue entry, or
// null if the character isn't currently driving anything. Lightweight
// enough to call in any route that needs to gate behaviour on it.
export function activeVehicle(charId) {
  const ch = db.prepare('SELECT active_vehicle_id FROM characters WHERE id = ?').get(charId);
  if (!ch?.active_vehicle_id) return null;
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ?').get(ch.active_vehicle_id);
  return row || null;
}

// Returns an array of { city, capacity, used, free } for every city
// where the character has either a property or a vehicle. Useful for
// the inventory page so the player can see their footprint at a glance.
export function garageSummary(charId) {
  const cities = new Set();
  for (const r of db.prepare('SELECT DISTINCT city FROM properties_owned WHERE char_id = ?').all(charId)) {
    if (r.city) cities.add(r.city);
  }
  // Skip the active vehicle's city when collecting — it shouldn't
  // create an entry on its own (the active car doesn't occupy a slot
  // and hasn't been "stored" anywhere yet).
  const ch = db.prepare('SELECT active_vehicle_id FROM characters WHERE id = ?').get(charId);
  const activeId = ch?.active_vehicle_id || 0;
  for (const r of db.prepare('SELECT DISTINCT city FROM vehicles_owned WHERE char_id = ? AND id != ?').all(charId, activeId)) {
    if (r.city) cities.add(r.city);
  }
  return [...cities].map(city => {
    const capacity = garageCapacity(charId, city);
    const used = vehicleCount(charId, city);
    return { city, capacity, used, free: Math.max(0, capacity - used) };
  });
}
