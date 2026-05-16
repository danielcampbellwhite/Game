// Intra-city physical locations.
//
// Every city has the same fixed set of buildings, plus a "streets"
// default — that's where you arrive after an intercity flight and
// where you stand when you leave a building. Movement between any
// two locations in the same city is a flat 45s walk or 10s drive
// (drive requires an active vehicle).
//
// While travelling, the character is fully locked except for chat
// and the per-tick maintenance reads — see requireFreeCharacter in
// middleware/auth.js. Travel completes automatically on the next
// applyTick once the timestamp passes.

import { db } from '../db.js';
import { writeLog } from './log.js';
import { intraDriveFuelCost, consumeFuel } from './fuel.js';

export const WALK_MS  = 45 * 1000;
export const DRIVE_MS = 10 * 1000;

// Catalog of physical locations. `slug` is the persisted value of
// characters.current_location and the value sent to /travel.
// `route` is the client URL the player goes to once they arrive.
// `desc` is rendered on the City > Around Town tile so each
// location gets a one-line "what is this place" blurb.
export const LOCATIONS = {
  streets:        { name: 'On the streets',     route: '/city',           travelable: true,  gated: false, desc: 'Default spot when you arrive in a city or step out of a building.' },
  bank:           { name: 'Bank',               route: '/bank',           travelable: true,  gated: true,  desc: 'Vault, deposits, transfers. Cash kept here doesn\'t count toward what robbers can take.' },
  gun_store:      { name: 'Gun Store',          route: '/gun-store',      travelable: true,  gated: true,  desc: 'Pistols to assault rifles, plus the ammo to feed them. Required to swap loadouts.' },
  dealership:     { name: 'Car Dealership',     route: '/dealership',     travelable: true,  gated: true,  desc: 'Legal cars and trucks. Buy outright or trade in. Licence-gated by tier.' },
  chop_shop:      { name: 'Chop Shop',          route: '/chop-shop',      travelable: true,  gated: true,  desc: 'Move stolen vehicles fast (cheap) or via the dealer (risky).' },
  repair:         { name: 'Repair Shop',        route: '/repair',         travelable: true,  gated: true,  desc: 'Fix dings, dents and bullet holes. Pricier the worse the damage.' },
  gym:            { name: 'Gym',                route: '/gym',            travelable: true,  gated: true,  desc: 'Train STR, DEF, SPD and DEX. Energy in, stat points out.' },
  range:          { name: 'Shooting Range',     route: '/range',          travelable: true,  gated: true,  desc: 'Practice your aim. Better accuracy means fewer missed shots when it matters.' },
  university:     { name: 'University',         route: '/university',     travelable: true,  gated: true,  desc: 'Long courses for INT. Slow gains but they stick.' },
  driving_school: { name: 'Driving School',     route: '/driving-school', travelable: true,  gated: true,  desc: 'Earn the next driving licence tier. Higher tier unlocks better cars at the dealership.' },
  hospital:       { name: 'Hospital',           route: '/hospital',       travelable: true,  gated: true,  desc: 'Pay to skip the rest of your bed-rest timer.' },
  casino:         { name: 'Lucky Crown Casino', route: '/casino',         travelable: true,  gated: true,  desc: 'Roulette, blackjack, slots — try your luck against the house. Open afternoons to early morning.' },
  bookmaker:      { name: 'Bookmaker',          route: '/bookmaker',      travelable: true,  gated: true,  desc: 'Wager on football, boxing, horses and F1. ~8% house margin.' },
  fence:          { name: 'The Fence',          route: '/fence',          travelable: true,  gated: true,  desc: 'Wash illegal cash into legal at 70% — your relationship buys you a few extra points.' },
  general_store:  { name: 'General Store',      route: '/general-store',  travelable: true,  gated: true,  desc: 'Snacks, tools, lockpicks — the bits and bobs of the trade.' },
  clothing_low:   { name: 'Streetwear Outlet',  route: '/clothing/low',   travelable: true,  gated: true,  desc: 'Tracksuits, snapbacks, gold chains. Cheap, flashy, all cosmetic.' },
  clothing_high:  { name: 'Atelier',            route: '/clothing/high',  travelable: true,  gated: true,  desc: 'Bespoke suits, Italian leather, watches that take a year to ship. Cosmetic, by appointment only.' },
  // New: services that used to be accessible from anywhere. Promoted
  // to real locations so the City page is fully place-based.
  brokerage:      { name: 'Stock Brokerage',    route: '/stocks',         travelable: true,  gated: true,  desc: 'Live tickers and traders in suits. Buy and sell listed stocks.' },
  estate_agent:   { name: 'Estate Agent',       route: '/property',       travelable: true,  gated: true,  desc: 'Property listings and the keys to your next house. Buy, browse, sell.' },
  airport:        { name: 'Airport',            route: '/travel',         travelable: true,  gated: true,  desc: 'Flights to other cities. Set your destination, pay your fare, wheels up.' },
  drug_market:    { name: 'The Block',          route: '/drugs',          travelable: true,  gated: true,  desc: 'Sell drugs you produced in your labs. Prices drift hourly per city — bust risk scales with the flip size.' },
  high_street:    { name: 'High Street',        route: '/high-street',    travelable: true,  gated: true,  desc: 'Coffee shop, pharmacy, off-licence, deli, gift shop — all on one block.' },
  // Jail used to be forced-only — you arrived because you got booked.
  // Now it's also a travel destination so you can voluntarily walk
  // in to bail a friend out or attempt a jailbreak. effectiveLocation
  // still snaps to 'jail' for active sentences (forced state takes
  // precedence over current_location).
  jail:           { name: 'Jail',               route: '/jail',           travelable: true,  gated: true,  desc: 'Holding cells and the bail desk. Drop in to spring a friend or break someone out.' },
};

// Player-owned properties are addressable as dynamic destinations
// — slugs of the form 'home_<properties_owned_id>'. They aren't in
// the static LOCATIONS map; the /api/locations route enriches its
// response with the player's homes in the current city, and these
// helpers handle validation.
export function isHomeSlug(slug) {
  return typeof slug === 'string' && /^home_\d+$/.test(slug);
}

export function homeIdFromSlug(slug) {
  if (!isHomeSlug(slug)) return null;
  return parseInt(slug.slice('home_'.length), 10);
}

export function locationMeta(slug) {
  if (LOCATIONS[slug]) return LOCATIONS[slug];
  if (isHomeSlug(slug)) {
    // Generic synthetic — the locations route resolves the actual
    // property name. Anything that just needs a printable label
    // (logs, error messages) gets "Your home" which is fine.
    return { name: 'Your home', route: '/property', travelable: true, gated: true, desc: 'Inside your property.' };
  }
  return null;
}

export function isValidLocation(slug) {
  return Boolean(LOCATIONS[slug]) || isHomeSlug(slug);
}

// "Where is this character right now?" — single source of truth that
// folds in jail/hospital lockouts so the rest of the code doesn't
// have to special-case them. NULL persisted state is treated as
// 'streets' (the default for legacy characters).
export function effectiveLocation(ch, now = Date.now()) {
  if (ch.jail_until     && ch.jail_until     > now) return 'jail';
  if (ch.hospital_until && ch.hospital_until > now) return 'hospital';
  return ch.current_location || 'streets';
}

// Travelling intra-city? Distinct from intercity flights, which use
// travel_until / travel_to and are unaffected by this.
export function isIntraTravelling(ch, now = Date.now()) {
  return !!(ch.intra_travel_until && ch.intra_travel_until > now);
}

// Available active vehicle (regular or premium). Needed to drive.
function hasActiveVehicle(ch) {
  return !!(ch.active_vehicle_id || ch.active_premium_vehicle_id);
}

// Start a journey to `dest` by `mode` ('walk' | 'drive'). Returns
// { ok, arrives_at } or { error }.
export function startTravel(ch, dest, mode) {
  const now = Date.now();
  if (ch.jail_until     && ch.jail_until     > now) return { error: 'You are in jail.' };
  if (ch.hospital_until && ch.hospital_until > now) return { error: 'You are in hospital.' };
  if (ch.travel_until   && ch.travel_until   > now) return { error: 'You are mid-flight.' };
  if (isIntraTravelling(ch, now))                   return { error: 'You are already travelling somewhere in the city.' };

  const here = effectiveLocation(ch, now);
  if (!isValidLocation(dest))                       return { error: 'Unknown location.' };
  const destMeta = locationMeta(dest);
  if (!destMeta.travelable)                          return { error: `You can't travel to ${destMeta.name}.` };
  if (dest === here)                                 return { error: `You're already at ${destMeta.name}.` };
  // For home_* slugs, double-check the property belongs to the
  // player AND is in their current city. Players can't drive to a
  // property they own in another city — they have to fly there
  // first.
  if (isHomeSlug(dest)) {
    const id = homeIdFromSlug(dest);
    const row = db.prepare('SELECT id, city FROM properties_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
    if (!row) return { error: 'That property isn\'t yours.' };
    if (row.city !== ch.city) return { error: 'That property is in another city — fly there first.' };
  }

  let dur;
  let fuelInfo = null;
  if (mode === 'drive') {
    if (!hasActiveVehicle(ch)) return { error: 'You need an active vehicle to drive.' };
    // Fuel debit up-front — drain at start so the player commits to
    // the cost and can't undo by cancelling. If the tank can't cover
    // the hop, reject before any travel state is written.
    if (ch.active_vehicle_id) {
      const veh = db.prepare('SELECT id, vehicle_id FROM vehicles_owned WHERE id = ?').get(ch.active_vehicle_id);
      if (veh) {
        const cost = intraDriveFuelCost(veh.vehicle_id);
        const r = consumeFuel(veh.id, cost);
        if (r.error) return { error: r.error + ' Walk or refill at the inventory > vehicles tab.' };
        fuelInfo = { used: cost, remaining: r.fuel };
      }
    }
    dur = DRIVE_MS;
  } else if (mode === 'walk' || !mode) {
    dur = WALK_MS;
  } else {
    return { error: 'Unknown travel mode.' };
  }

  const arrives = now + dur;
  ch.intra_travel_until = arrives;
  ch.intra_travel_to    = dest;
  ch.intra_travel_mode  = mode === 'drive' ? 'drive' : 'walk';

  db.prepare(`
    UPDATE characters SET
      intra_travel_until = ?,
      intra_travel_to    = ?,
      intra_travel_mode  = ?
    WHERE id = ?
  `).run(arrives, dest, ch.intra_travel_mode, ch.id);

  const fuelNote = fuelInfo ? ` Tank ${Math.round(fuelInfo.remaining)}%.` : '';
  writeLog(ch.id, 'travel', `Set off ${ch.intra_travel_mode === 'drive' ? 'driving' : 'walking'} to ${destMeta.name}.${fuelNote}`);
  return { ok: true, arrives_at: arrives, mode: ch.intra_travel_mode, to: dest, fuel: fuelInfo };
}

// Called from applyTick. If the journey has completed, snap the
// character to the destination and clear the travel fields. Mutates
// `ch` in place; persistence happens via the normal saveCharacter
// flow at the end of the tick.
export function maybeArrive(ch, now = Date.now()) {
  if (!ch.intra_travel_until || ch.intra_travel_until > now) return false;
  if (!ch.intra_travel_to) {
    ch.intra_travel_until = null;
    ch.intra_travel_mode  = null;
    return false;
  }
  const dest = ch.intra_travel_to;
  const meta = locationMeta(dest);
  ch.current_location   = dest;
  ch.intra_travel_until = null;
  ch.intra_travel_to    = null;
  ch.intra_travel_mode  = null;
  writeLog(ch.id, 'travel', `Arrived at ${meta?.name || dest}.`, null, true);
  return true;
}

// Force the character's location to match a state they're now in —
// hospitalisation, jail, intercity arrival. Called from the relevant
// services. Idempotent.
export function forceLocation(ch, slug) {
  if (!isValidLocation(slug)) return;
  if (ch.current_location === slug) return;
  ch.current_location   = slug;
  // Forced relocation cancels any in-flight intra-city journey —
  // you can't be walking to the bank while being booked into jail.
  ch.intra_travel_until = null;
  ch.intra_travel_to    = null;
  ch.intra_travel_mode  = null;
}
