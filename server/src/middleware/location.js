// Mount-level gate: refuses requests if the character isn't standing
// in the right physical location. Used to give every in-city service
// (bank, gun store, etc.) a real geography. Returns 409 with enough
// info that the client can prompt the player to walk/drive over.

import { effectiveLocation, isIntraTravelling, locationMeta } from '../services/locations.js';
import { hasInternet } from '../services/online.js';

// Same gate as requireAtLocation, but accepts an online connection
// as an alternative — used by services that have a real-world
// digital equivalent (stock markets, banking app, etc.).
export function requireAtLocationOrOnline(slug) {
  return function (req, res, next) {
    const ch = req.character;
    if (!ch) return res.status(401).json({ error: 'No character on request.' });
    const now = Date.now();
    if (isIntraTravelling(ch, now)) {
      return res.status(409).json({
        error: 'You are travelling.',
        intra_travel_until: ch.intra_travel_until,
        intra_travel_to:    ch.intra_travel_to,
        intra_travel_mode:  ch.intra_travel_mode,
      });
    }
    const here = effectiveLocation(ch, now);
    if (here === slug) return next();
    if (hasInternet(ch)) return next();
    return res.status(409).json({
      error: `You need to be at the ${locationMeta(slug)?.name || slug} or have internet on you.`,
      not_at_location: true,
      at:   here,
      need: slug,
    });
  };
}

export function requireAtLocation(slug) {
  return function (req, res, next) {
    const ch = req.character;
    if (!ch) return res.status(401).json({ error: 'No character on request.' });
    const now = Date.now();
    if (isIntraTravelling(ch, now)) {
      return res.status(409).json({
        error: 'You are travelling.',
        intra_travel_until: ch.intra_travel_until,
        intra_travel_to:    ch.intra_travel_to,
        intra_travel_mode:  ch.intra_travel_mode,
      });
    }
    const here = effectiveLocation(ch, now);
    if (here === slug) return next();
    return res.status(409).json({
      error: `You need to be at the ${locationMeta(slug)?.name || slug}.`,
      not_at_location: true,
      at:   here,
      need: slug,
    });
  };
}
