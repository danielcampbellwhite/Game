// Day/night cycle. Each city has an approximate UTC offset (no DST
// modelling — the real-world DST gymnastics would clutter the model
// and the gameplay impact is tiny). Crime success, venue openings and
// a few flavour blurbs are all driven by the city's local hour.

// City → UTC offset in hours. Approximate; DST ignored on purpose.
const CITY_TZ_OFFSET = {
  new_york:    -5,
  los_angeles: -8,
  miami:       -5,
  kingston:    -5,
  rio:         -3,
  london:       0,
  liverpool:    0,
  paris:        1,
  berlin:       1,
  moscow:       3,
  dubai:        4,
  tokyo:        9,
  hong_kong:    8,
  sydney:      10,
  cape_town:    2,
};

export function cityLocalHour(city, now = Date.now()) {
  const offset = CITY_TZ_OFFSET[city] ?? 0;
  const utcHour = new Date(now).getUTCHours();
  return ((utcHour + offset) % 24 + 24) % 24;
}

export function cityLocalTime(city, now = Date.now()) {
  const offset = CITY_TZ_OFFSET[city] ?? 0;
  const d = new Date(now);
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();
  const h = ((utcH + offset) % 24 + 24) % 24;
  return { hour: h, minute: utcM };
}

// Day-night buckets. Anchored at the city local hour.
//   late_night  00–05  — cover of darkness, fewest witnesses
//   morning     06–10  — rush hour starts, alert public
//   day         11–16  — office hours
//   evening     17–21  — still light, after-work foot traffic
//   night       22–23  — dark, lighter foot traffic
const BUCKETS = [
  { id: 'late_night', from: 0,  to: 5  },
  { id: 'morning',    from: 6,  to: 10 },
  { id: 'day',        from: 11, to: 16 },
  { id: 'evening',    from: 17, to: 21 },
  { id: 'night',      from: 22, to: 23 },
];
export function hourBucket(city, now = Date.now()) {
  const h = cityLocalHour(city, now);
  for (const b of BUCKETS) if (h >= b.from && h <= b.to) return b.id;
  return 'day';
}

export const BUCKET_LABEL = {
  late_night: 'Late night',
  morning:    'Morning',
  day:        'Daytime',
  evening:    'Evening',
  night:      'Night',
};

// Crime-specific time-of-day modifiers. Multiplier on the rolled
// success chance. Set per-crime so e.g. shoplifting at 3am is a bad
// idea (shutters down) but a break-in is the opposite.
// Anything not listed defaults to 1.0 (no time effect).
const CRIME_HOUR_MULS = {
  // Street — cover-of-darkness crimes favour night/late-night.
  mugging:       { late_night: 1.15, night: 1.10, evening: 1.05, day: 0.90, morning: 0.85 },
  breakin:       { late_night: 1.20, night: 1.15, evening: 1.05, day: 0.75, morning: 0.80 },
  cat_converter: { late_night: 1.20, night: 1.15, evening: 1.00, day: 0.85, morning: 0.90 },
  loan_collect:  { late_night: 1.15, night: 1.10, evening: 1.05, day: 0.95, morning: 0.90 },
  store_holdup:  { late_night: 1.20, night: 1.10, evening: 1.00, day: 0.90, morning: 0.85 },
  atm_skim:      { late_night: 1.10, night: 1.10, evening: 1.00, day: 0.95, morning: 0.95 },
  // Crowd-dependent crimes peak during business hours.
  pickpocket:    { late_night: 0.80, night: 0.90, evening: 1.05, day: 1.15, morning: 1.10 },
  shoplift:      { late_night: 0.70, night: 0.80, evening: 1.00, day: 1.10, morning: 1.10 },
  snatch_grab:   { late_night: 0.85, night: 0.95, evening: 1.05, day: 1.10, morning: 1.10 },
  bike_theft:    { late_night: 1.00, night: 1.05, evening: 1.05, day: 1.00, morning: 0.95 },
  scam:          { late_night: 0.95, night: 1.00, evening: 1.10, day: 1.10, morning: 1.05 },
  // Cyber — victims at screens during office hours, plus a darkweb bump at night.
  phishing:      { late_night: 0.85, night: 0.90, evening: 1.15, day: 1.15, morning: 1.05 },
  social_eng:    { late_night: 0.85, night: 0.95, evening: 1.10, day: 1.20, morning: 1.10 },
  card_fraud:    { late_night: 0.95, night: 1.00, evening: 1.10, day: 1.10, morning: 1.05 },
  sim_swap:      { late_night: 0.90, night: 0.95, evening: 1.10, day: 1.15, morning: 1.05 },
  darkweb:       { late_night: 1.10, night: 1.10, evening: 1.05, day: 0.95, morning: 0.90 },
  ransomware:    { late_night: 1.05, night: 1.05, evening: 1.05, day: 1.00, morning: 0.95 },
  crypto_drain:  { late_night: 1.05, night: 1.05, evening: 1.05, day: 1.00, morning: 0.95 },
  ddos_ext:      { late_night: 1.05, night: 1.05, evening: 1.05, day: 1.00, morning: 0.95 },
  botnet_rental: { late_night: 1.05, night: 1.05, evening: 1.05, day: 1.00, morning: 0.95 },
  // GTA — night strongly favoured. Same shape for every tier.
  gta_beater:    { late_night: 1.20, night: 1.15, evening: 1.00, day: 0.80, morning: 0.85 },
  gta_compact:   { late_night: 1.20, night: 1.15, evening: 1.00, day: 0.80, morning: 0.85 },
  gta_hothatch:  { late_night: 1.20, night: 1.15, evening: 1.00, day: 0.80, morning: 0.85 },
  gta_premium:   { late_night: 1.20, night: 1.15, evening: 1.00, day: 0.80, morning: 0.85 },
  gta_luxury:    { late_night: 1.25, night: 1.15, evening: 1.00, day: 0.75, morning: 0.80 },
  gta_exotic:    { late_night: 1.25, night: 1.15, evening: 1.00, day: 0.75, morning: 0.80 },
  gta_hyper:     { late_night: 1.30, night: 1.20, evening: 1.00, day: 0.70, morning: 0.75 },
  // Major scores — mostly nocturnal except bank rob, which historically
  // happens during business hours when the vault is open and staff thin.
  jewellery:     { late_night: 1.20, night: 1.10, evening: 1.00, day: 0.85, morning: 0.85 },
  bank_rob:      { late_night: 0.80, night: 0.85, evening: 0.95, day: 1.15, morning: 1.10 },
  smuggle:       { late_night: 1.15, night: 1.10, evening: 1.05, day: 0.95, morning: 0.95 },
  art_heist:     { late_night: 1.25, night: 1.15, evening: 1.00, day: 0.80, morning: 0.85 },
  casino_score:  { late_night: 1.20, night: 1.10, evening: 1.05, day: 0.95, morning: 0.90 },
  cargo_hijack:  { late_night: 1.20, night: 1.10, evening: 1.00, day: 0.90, morning: 0.95 },
  cyber_bank:    { late_night: 1.10, night: 1.05, evening: 1.05, day: 1.00, morning: 0.95 },
};

export function crimeHourMul(crimeId, city, now = Date.now()) {
  const tbl = CRIME_HOUR_MULS[crimeId];
  if (!tbl) return 1;
  const b = hourBucket(city, now);
  return tbl[b] ?? 1;
}

// Venue opening hours. `null` = always open. Otherwise the venue is
// open whenever city local hour is in [open, close); ranges that wrap
// midnight are handled (open 22, close 4 means 22:00–03:59).
const VENUE_HOURS = {
  casino:    { open: 14, close: 4 },
  bookmaker: null,
};
export function isVenueOpen(venue, city, now = Date.now()) {
  const hours = VENUE_HOURS[venue];
  if (!hours) return true;
  const h = cityLocalHour(city, now);
  const { open, close } = hours;
  if (open < close) return h >= open && h < close;
  return h >= open || h < close;
}
export function venueOpensAt(venue) {
  return VENUE_HOURS[venue] || null;
}
