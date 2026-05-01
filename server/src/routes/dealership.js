import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { VEHICLES, vehicleById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

// Legal-dealer price respects the city's businessMul (luxury markets cost more).
function dealerPrice(vehicle, city) {
  const mul = cityById(city)?.businessMul || 1.0;
  return Math.floor(vehicle.bookPrice * mul);
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const inventory = VEHICLES.map(v => ({
    ...v,
    price: dealerPrice(v, ch.city),
  }));
  res.json({ city: ch.city, cityName: cityById(ch.city)?.name, inventory });
});

router.post('/buy', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const v = vehicleById(req.body?.vehicle_id);
  if (!v) return res.status(400).json({ error: 'Unknown vehicle' });
  const price = dealerPrice(v, ch.city);
  if (ch.cash < price) return res.status(400).json({ error: `Need £${price.toLocaleString()}` });
  ch.cash -= price;
  db.prepare('INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at) VALUES (?, ?, ?, ?, ?)')
    .run(ch.id, v.id, 'bought', ch.city, Date.now());
  writeLog(ch.id, 'dealership', `Bought ${v.maker} ${v.name} for £${price.toLocaleString()}.`, { vehicle: v.id, price });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
