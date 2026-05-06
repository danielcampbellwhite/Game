import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { listAreasInCity, listAllAreas, captureArea, factionAreaCount } from '../services/areas.js';

const router = Router();

// All areas across all cities — used by global maps / leaderboards.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  res.json({ areas: listAllAreas() });
});

// Areas in a single city. Includes a small `facts` block so the UI
// can render "Your faction holds 3 of 9" without a second round trip.
router.get('/city/:cityId', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const city = req.params.cityId;
  const areas = listAreasInCity(city);
  const counts = {};
  for (const a of areas) {
    if (!a.faction) continue;
    counts[a.faction] = (counts[a.faction] || 0) + 1;
  }
  res.json({
    city,
    areas,
    counts,
    yourFactionHolds: ch.faction ? (counts[ch.faction] || 0) : 0,
    total: areas.length,
  });
});

// Capture attempt — the player must be in a gang and physically in
// the area's city. The service handles validation, casualty rolls,
// per-area daily cooldown, etc.
router.post('/:areaId/capture', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const gang = db.prepare(`
    SELECT g.* FROM gangs g
    JOIN gang_members gm ON gm.gang_id = g.id
    WHERE gm.char_id = ?
  `).get(ch.id);
  if (!gang) return res.status(403).json({ error: 'Join a gang to fight for territory.' });

  const result = captureArea(ch, gang, req.params.areaId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

export default router;
