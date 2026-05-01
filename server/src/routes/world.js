import { Router } from 'express';
import { CITIES } from '../data.js';
import { db } from '../db.js';
import { getDrugMarketForCity } from '../services/market.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';

const router = Router();

const ONLINE_WINDOW_MS = 60 * 1000;

router.get('/', (_req, res) => {
  res.json({
    cities: CITIES.map(c => ({
      ...c,
      drugs: getDrugMarketForCity(c.id),
    })),
  });
});

// City directory with live player counts. Returns one row per city with
// `total` (everyone whose character is currently in that city, including
// people in jail/hospital/travelling-out) and `online` (active in the
// last 60 seconds). Used by the City page grid.
router.get('/cities', requireAuth, requireCharacter, (req, res) => {
  const now = Date.now();
  const cutoff = now - ONLINE_WINDOW_MS;
  const totals = db.prepare('SELECT city, COUNT(*) AS c FROM characters GROUP BY city').all();
  const onlines = db.prepare('SELECT city, COUNT(*) AS c FROM characters WHERE last_active_at >= ? GROUP BY city').all(cutoff);
  const totalMap  = Object.fromEntries(totals.map(r => [r.city, r.c]));
  const onlineMap = Object.fromEntries(onlines.map(r => [r.city, r.c]));
  res.json({
    you: req.character.city,
    cities: CITIES.map(c => ({
      ...c,
      players: totalMap[c.id]  || 0,
      online:  onlineMap[c.id] || 0,
    })),
  });
});

export default router;
