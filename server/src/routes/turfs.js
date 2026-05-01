import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { cityById } from '../data.js';
import { listTurfHolds } from '../services/gangs.js';

const router = Router();

// Snapshot of every city currently held by a gang.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const holds = listTurfHolds().map(h => ({
    city: h.city,
    city_name: cityById(h.city)?.name || h.city,
    gang: { id: h.gang_id, name: h.gang_name, tag: h.gang_tag },
    won_at: h.won_at,
    expires_at: h.expires_at,
  }));
  res.json({ turfs: holds });
});

export default router;
