// Faction reputation — each faction's share of total criminal activity
// across the playerbase, normalised so the three add to 100%. Driven
// by the faction_stats counter that increments on every successful
// crime (see routes/crimes.js).

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { FACTIONS } from '../data.js';

const router = Router();

router.get('/reputation', requireAuth, requireCharacter, (req, res) => {
  const rows = db.prepare('SELECT faction_id, crimes_committed FROM faction_stats').all();
  const byId = Object.fromEntries(rows.map(r => [r.faction_id, r.crimes_committed]));
  const total = FACTIONS.reduce((s, f) => s + (byId[f.id] || 0), 0);

  // When nobody has committed a crime yet, give every faction an even
  // split so the bar doesn't render as a jagged 100/0/0.
  const factions = FACTIONS.map(f => {
    const count = byId[f.id] || 0;
    const share = total > 0 ? count / total : 1 / FACTIONS.length;
    return {
      id: f.id,
      name: f.name,
      palette: f.palette,
      crimes: count,
      share,                              // 0..1
      percent: Math.round(share * 1000) / 10, // 1dp percentage
    };
  });
  res.json({ factions, total });
});

export default router;
