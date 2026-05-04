// Garage capacity per city — sum of `garage` on every property the
// character owns in that city. Vehicles live in a city until shipped
// elsewhere, so each city has its own cap. Used to gate dealer
// purchases and inter-city shipping.

import { db } from '../db.js';
import { propertyById } from '../data.js';

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
  return cap;
}

export function vehicleCount(charId, city) {
  if (!city) return 0;
  const r = db.prepare(
    'SELECT COUNT(*) AS n FROM vehicles_owned WHERE char_id = ? AND city = ?'
  ).get(charId, city);
  return r?.n || 0;
}

export function freeGarageSpace(charId, city) {
  return Math.max(0, garageCapacity(charId, city) - vehicleCount(charId, city));
}

// Returns an array of { city, capacity, used, free } for every city
// where the character has either a property or a vehicle. Useful for
// the inventory page so the player can see their footprint at a glance.
export function garageSummary(charId) {
  const cities = new Set();
  for (const r of db.prepare('SELECT DISTINCT city FROM properties_owned WHERE char_id = ?').all(charId)) {
    if (r.city) cities.add(r.city);
  }
  for (const r of db.prepare('SELECT DISTINCT city FROM vehicles_owned WHERE char_id = ?').all(charId)) {
    if (r.city) cities.add(r.city);
  }
  return [...cities].map(city => {
    const capacity = garageCapacity(charId, city);
    const used = vehicleCount(charId, city);
    return { city, capacity, used, free: Math.max(0, capacity - used) };
  });
}
