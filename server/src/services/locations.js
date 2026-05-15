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

export const WALK_MS  = 45 * 1000;
export const DRIVE_MS = 10 * 1000;

// Catalog of physical locations. `slug` is the persisted value of
// characters.current_location and the value sent to /travel.
// `route` is the client URL the player goes to once they arrive.
export const LOCATIONS = {
  streets:        { name: 'On the streets',     emoji: '',  route: '/city',           travelable: true,  gated: false },
  bank:           { name: 'Bank',               emoji: '',  route: '/bank',           travelable: true,  gated: true  },
  gun_store:      { name: 'Gun Store',          emoji: '',  route: '/gun-store',      travelable: true,  gated: true  },
  dealership:     { name: 'Car Dealership',     emoji: '',  route: '/dealership',     travelable: true,  gated: true  },
  chop_shop:      { name: 'Chop Shop',          emoji: '',  route: '/chop-shop',      travelable: true,  gated: true  },
  repair:         { name: 'Repair Shop',        emoji: '',  route: '/repair',         travelable: true,  gated: true  },
  gym:            { name: 'Gym',                emoji: '',  route: '/gym',            travelable: true,  gated: true  },
  range:          { name: 'Shooting Range',     emoji: '',  route: '/range',          travelable: true,  gated: true  },
  university:     { name: 'University',         emoji: '',  route: '/university',     travelable: true,  gated: true  },
  driving_school: { name: 'Driving School',     emoji: '',  route: '/driving-school', travelable: true,  gated: true  },
  hospital:       { name: 'Hospital',           emoji: '',  route: '/hospital',       travelable: true,  gated: true  },
  casino:         { name: 'Casino',             emoji: '',  route: '/casino',         travelable: true,  gated: true  },
  bookmaker:      { name: 'Bookmaker',          emoji: '',  route: '/bookmaker',      travelable: true,  gated: true  },
  fence:          { name: 'The Fence',          emoji: '',  route: '/fence',          travelable: true,  gated: true  },
  general_store:  { name: 'General Store',      emoji: '',  route: '/general-store',  travelable: true,  gated: true  },
  job_board:      { name: 'Job Board',          emoji: '',  route: '/job-board',      travelable: true,  gated: true  },
  // Forced-state locations — you don't travel to them, you arrive
  // because something happened. Listed so the slug is recognised by
  // the lookup and the UI can render a name/emoji.
  jail:           { name: 'Jail',               emoji: '',  route: '/jail',           travelable: false, gated: false },
};

export function locationMeta(slug) {
  return LOCATIONS[slug] || null;
}

export function isValidLocation(slug) {
  return Boolean(LOCATIONS[slug]);
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

  let dur;
  if (mode === 'drive') {
    if (!hasActiveVehicle(ch)) return { error: 'You need an active vehicle to drive.' };
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

  writeLog(ch.id, 'travel', `Set off ${ch.intra_travel_mode === 'drive' ? 'driving' : 'walking'} to ${destMeta.name}.`);
  return { ok: true, arrives_at: arrives, mode: ch.intra_travel_mode, to: dest };
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
