// "Are you online?" — physical access rules for the in-game internet.
//
// The Smartphone is the only device that grants connectivity. Carry
// one in personal inventory and you have internet anywhere you go;
// stash it, lose it, or never buy it and you're offline.
//
// Bank "app" access (viewing your bank balance away from the bank),
// online purchases of flights / vehicles / weapons, and live chat
// all require internet. Direct messages between players also need
// the smartphone; burner phones only allow a one-off individual
// message (handled separately in routes/messages.js).

import { db } from '../db.js';

// Does this character have a smartphone in personal inventory?
function carriesSmartphone(charId) {
  const r = db.prepare(
    "SELECT 1 FROM inventory WHERE char_id = ? AND kind = 'misc' AND item_id = 'smartphone' AND qty > 0"
  ).get(charId);
  return !!r;
}

// Authoritative "are you online" check. Returns { online: bool,
// reason: 'phone' | null }.
export function internetStatus(ch) {
  if (carriesSmartphone(ch.id)) return { online: true,  reason: 'phone' };
  return                              { online: false, reason: null    };
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
      error: 'You need a smartphone on you to do that online.',
    });
  }
  req.internetReason = s.reason;
  next();
}
