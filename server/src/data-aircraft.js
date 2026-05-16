// Private aircraft catalogue — planes + helicopters that players
// can buy from the airport, store in hangars, and use to fly
// inter-city (no intra-city). Shares the `vehicles_owned` table
// with cars via a `class` discriminator column. Aircraft never
// roll out of GTA crimes and never sell at the chop shop / car
// dealership — gating is done by checking `class` at each site.
//
// Tiers map loosely to cars:
//   1 — entry private aircraft       (~£40k–£80k)
//   2 — twin-engine / executive      (~£200k–£500k)
//   3 — luxury jet / corp helicopter (~£1M–£4M)

// Prices anchored near real-world MSRP (lightly rounded) so the
// top-tier aircraft are genuine endgame goals — the Gulfstream
// sits in "you've earned this" territory next to the £15M villa
// and £5M hypercar that already cap the regular economy.
export const AIRCRAFT = [
  //  Planes
  { id: 'plane_cessna_172',    name: 'Skyhawk 172',     maker: 'Cessna',     class: 'plane',      tier: 1, bookPrice:   400000 },
  { id: 'plane_beech_baron',   name: 'Baron 58',        maker: 'Beechcraft', class: 'plane',      tier: 2, bookPrice:  1800000 },
  { id: 'plane_gulfstream',    name: 'G650',            maker: 'Gulfstream', class: 'plane',      tier: 3, bookPrice: 55000000 },
  //  Helicopters
  { id: 'heli_robinson_r44',   name: 'R44 Raven',       maker: 'Robinson',   class: 'helicopter', tier: 1, bookPrice:   550000 },
  { id: 'heli_bell_407',       name: '407',             maker: 'Bell',       class: 'helicopter', tier: 2, bookPrice:  2800000 },
  { id: 'heli_sikorsky_s76',   name: 'S-76',            maker: 'Sikorsky',   class: 'helicopter', tier: 3, bookPrice: 12000000 },
];

const BY_ID = Object.fromEntries(AIRCRAFT.map(a => [a.id, a]));
export const aircraftById = id => BY_ID[id] || null;
export const isAircraftClass = cls => cls === 'plane' || cls === 'helicopter';

// Per-km fuel consumption while flying. Calibrated so a full tank
// covers ~1000–2000km depending on tier — long enough to cross most
// world-map links without a refuel, short enough that refuelling
// matters.
export const AIRCRAFT_FUEL_PER_KM = {
  plane:      { 1: 0.08, 2: 0.06, 3: 0.05 },
  helicopter: { 1: 0.10, 2: 0.08, 3: 0.06 },
};

// Full-tank refill cost. Roughly anchored to real-world Jet-A1
// fuel costs at the listed tier; the G650's 18k matches a real
// long-haul fill-up. Refuelling is a real expense to plan for.
export const AIRCRAFT_REFILL_FULL_COST = {
  plane:      { 1:   800, 2:  4000, 3: 18000 },
  helicopter: { 1:   600, 2:  3000, 3: 11000 },
};

// Flight wall-clock duration per km. Planes are quick; helis are
// roughly half as fast.
export const AIRCRAFT_MS_PER_KM = {
  plane:      0.4,
  helicopter: 0.9,
};
