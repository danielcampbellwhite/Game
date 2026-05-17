// "Are you online?" — physical access rules for the in-game internet.
//
// The Smartphone is the only device that grants connectivity. It's
// available to the player whenever they can physically reach it:
//
//   * In their personal inventory (always reachable).
//   * In the house stash of the property they're currently standing
//     inside (home_<id> slug).
//   * In the cargo of the active vehicle they're currently driving.
//
// Anywhere else (other property, other vehicle, stash elsewhere)
// → out of reach → offline.
//
// The phone-owned-anywhere check ("they own one at all, even if
// it's out of reach") drives whether the floating phone icon
// renders at all.

import { db } from '../db.js';
import { isHomeSlug, homeIdFromSlug } from './locations.js';

// Is there ANY smartphone tied to this character — pockets, house,
// or vehicle? Used by publicCharacter to decide whether to show the
// phone FAB icon at all. Returns false for players who've never
// bought one (or who sold theirs).
export function ownsSmartphoneSomewhere(charId) {
  const inv = db.prepare(
    "SELECT 1 FROM inventory WHERE char_id = ? AND kind = 'misc' AND item_id = 'smartphone' AND qty > 0"
  ).get(charId);
  if (inv) return true;
  const stash = db.prepare(
    "SELECT 1 FROM stash WHERE char_id = ? AND kind = 'misc' AND item_id = 'smartphone' AND qty > 0"
  ).get(charId);
  return !!stash;
}

function carriesSmartphone(charId) {
  const r = db.prepare(
    "SELECT 1 FROM inventory WHERE char_id = ? AND kind = 'misc' AND item_id = 'smartphone' AND qty > 0"
  ).get(charId);
  return !!r;
}

// Phone stashed in the property the player is currently inside?
function phoneAtCurrentHome(ch) {
  if (!isHomeSlug(ch.current_location)) return false;
  const propId = homeIdFromSlug(ch.current_location);
  if (!propId) return false;
  const r = db.prepare(
    "SELECT 1 FROM stash WHERE char_id = ? AND container = 'house' AND property_owned_id = ? AND kind = 'misc' AND item_id = 'smartphone' AND qty > 0"
  ).get(ch.id, propId);
  return !!r;
}

// Phone stashed in the active vehicle's cargo?
function phoneInActiveVehicle(ch) {
  if (!ch.active_vehicle_id) return false;
  const r = db.prepare(
    "SELECT 1 FROM stash WHERE char_id = ? AND container = 'vehicle' AND vehicle_id = ? AND kind = 'misc' AND item_id = 'smartphone' AND qty > 0"
  ).get(ch.id, ch.active_vehicle_id);
  return !!r;
}

// Authoritative "are you online" check. Returns { online: bool,
// reason: 'phone' | 'phone_home' | 'phone_car' | null, owned: bool }.
// owned tells the client whether the player has a phone at all
// (anywhere) so the floating phone icon can hide entirely when
// they don't.
export function internetStatus(ch) {
  const owned = ownsSmartphoneSomewhere(ch.id);
  if (!owned) return { online: false, reason: null, owned: false };
  if (carriesSmartphone(ch.id))   return { online: true,  reason: 'phone',      owned: true };
  if (phoneAtCurrentHome(ch))     return { online: true,  reason: 'phone_home', owned: true };
  if (phoneInActiveVehicle(ch))   return { online: true,  reason: 'phone_car',  owned: true };
  return { online: false, reason: null, owned: true };
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
      error: s.owned
        ? 'Your phone isn\'t with you. Take it from the stash where you left it.'
        : 'You need a smartphone to do that online.',
    });
  }
  req.internetReason = s.reason;
  next();
}
