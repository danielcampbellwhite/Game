import express from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { LOCATIONS, locationMeta, effectiveLocation, isIntraTravelling, startTravel, WALK_MS, DRIVE_MS } from '../services/locations.js';
import { saveCharacter } from '../services/character.js';
import { propertyById } from '../data.js';

const router = express.Router();

// GET /api/locations — list of buildings + your current standing.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  const here = effectiveLocation(ch, now);
  const travelling = isIntraTravelling(ch, now);

  const has_vehicle = !!(ch.active_vehicle_id || ch.active_premium_vehicle_id);

  const items = [];

  // Player-owned properties in this city take priority — listed
  // first so the player sees their homes before the public
  // buildings. Slug = "home_<row_id>"; storage gating elsewhere
  // checks current_location is a home_* slug.
  const homeRows = db.prepare('SELECT id, property_id FROM properties_owned WHERE char_id = ? AND city = ?')
    .all(ch.id, ch.city);
  for (const row of homeRows) {
    const p = propertyById(row.property_id);
    const slug = `home_${row.id}`;
    items.push({
      slug,
      name:   p ? p.name : 'Your home',
      emoji:  null,
      route:  '/property',
      gated:  true,
      desc:   p?.address ? `Home · ${p.address}` : 'Your private property — storage and downtime.',
      here:   slug === here,
      isHome: true,
    });
  }

  // Public buildings come after the player's own places.
  for (const [slug, m] of Object.entries(LOCATIONS)) {
    if (!m.travelable) continue;
    items.push({
      slug,
      name:   m.name,
      emoji:  m.emoji || null,
      route:  m.route,
      gated:  !!m.gated,
      desc:   m.desc || null,
      here:   slug === here,
    });
  }

  res.json({
    city: ch.city,
    current_location: here,
    intra_travel_until: ch.intra_travel_until || null,
    intra_travel_to:    ch.intra_travel_to    || null,
    intra_travel_mode:  ch.intra_travel_mode  || null,
    has_vehicle,
    walk_ms:  WALK_MS,
    drive_ms: DRIVE_MS,
    travelling,
    locations: items,
  });
});

// POST /api/locations/travel { to, mode } — start a journey.
router.post('/travel', requireAuth, requireCharacter, (req, res) => {
  const { to, mode } = req.body || {};
  const r = startTravel(req.character, to, mode);
  if (r.error) return res.status(400).json({ error: r.error });
  // startTravel writes intra_travel_* directly, but saveCharacter
  // would otherwise overwrite them with the stale in-memory values
  // on the next applyTick. Sync the in-memory row.
  saveCharacter(req.character);
  res.json({
    ok: true,
    arrives_at: r.arrives_at,
    to: r.to,
    mode: r.mode,
    name: locationMeta(r.to)?.name || r.to,
  });
});

export default router;
