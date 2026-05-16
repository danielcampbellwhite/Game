// "Are you online?" — physical access rules for the in-game internet.
//
// Two device classes exist:
//   1. smartphone — portable. If you carry one in personal inventory,
//      you have internet anywhere.
//   2. laptop — not portable. Lives in a property's house stash or in
//      an active vehicle's stash. You only have internet when you're
//      physically with it: at the home where it's stashed, or with the
//      active car/aircraft that holds it.
//
// Bank "app" access (viewing your bank balance away from the bank),
// online purchases of flights/vehicles/weapons/properties/stocks, and
// live chat all require internet. Direct messages between players
// also require a phone or laptop; burner phones only allow a one-off
// individual message (handled separately in routes/messages.js).

import { db } from '../db.js';
import { isHomeSlug, homeIdFromSlug } from './locations.js';

// Does this character have a smartphone in personal inventory?
function carriesSmartphone(charId) {
  const r = db.prepare(
    "SELECT 1 FROM inventory WHERE char_id = ? AND kind = 'misc' AND item_id = 'smartphone' AND qty > 0"
  ).get(charId);
  return !!r;
}

// Is there a laptop stashed in the property the character is currently
// standing in? Returns the property_owned_id when yes, null otherwise.
function laptopAtCurrentHome(ch) {
  if (!isHomeSlug(ch.current_location)) return null;
  const propId = homeIdFromSlug(ch.current_location);
  if (!propId) return null;
  const r = db.prepare(
    "SELECT 1 FROM stash WHERE char_id = ? AND container = 'house' AND property_owned_id = ? AND kind = 'misc' AND item_id = 'laptop' AND qty > 0"
  ).get(ch.id, propId);
  return r ? propId : null;
}

// Is there a laptop in the character's active vehicle's stash?
// active_vehicle_id is the regular driveable car; planes/helicopters
// don't carry stash routinely (they sit in hangars). Returns the
// vehicle row id when yes.
function laptopInActiveVehicle(ch) {
  if (!ch.active_vehicle_id) return null;
  const r = db.prepare(
    "SELECT 1 FROM stash WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ? AND kind = 'misc' AND item_id = 'laptop' AND qty > 0"
  ).get(ch.id, ch.active_vehicle_id);
  return r ? ch.active_vehicle_id : null;
}

// Authoritative "are you online" check. Returns { online: bool,
// reason: 'phone'|'laptop_home'|'laptop_car'|null }.
export function internetStatus(ch) {
  if (carriesSmartphone(ch.id))      return { online: true, reason: 'phone'      };
  if (laptopAtCurrentHome(ch))       return { online: true, reason: 'laptop_home' };
  if (laptopInActiveVehicle(ch))     return { online: true, reason: 'laptop_car'  };
  return { online: false, reason: null };
}

export function hasInternet(ch) {
  return internetStatus(ch).online;
}

// Express middleware — gates a route on "currently online" and tells
// the player why if they're not.
export function requireInternet(req, res, next) {
  const s = internetStatus(req.character);
  if (!s.online) {
    return res.status(403).json({
      error: 'You need a phone on you, or a laptop where you are, to do that online.',
    });
  }
  req.internetReason = s.reason;
  next();
}
