// Shared flight-duration math so both /api/travel and /api/inventory's
// ship-vehicle agree on how long a journey takes. Distance proxy is
// the index spread between the two cities in the master CITIES list —
// not realistic but stable and easy to reason about.

import { CITIES, cityById } from '../data.js';

export const FLIGHT_CLASSES = {
  economy:  { mul: 1.0, durationMul: 1.0 },
  business: { mul: 2.5, durationMul: 0.5 },
  first:    { mul: 6.0, durationMul: 0.0 }, // instant
};

export function flightDurationMs(fromCity, toCity, durationMul) {
  const from = cityById(fromCity);
  const to = cityById(toCity);
  if (!from || !to) return 0;
  const baseMin = 5 + Math.abs(CITIES.indexOf(from) - CITIES.indexOf(to)) * 2;
  return Math.floor(baseMin * 60 * 1000 * durationMul);
}
