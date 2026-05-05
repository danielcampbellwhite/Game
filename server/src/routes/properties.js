import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { PROPERTIES, propertyById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const owned = db.prepare('SELECT * FROM properties_owned WHERE char_id = ?').all(ch.id).map(p => ({
    ...p, ...propertyById(p.property_id), cityName: cityById(p.city)?.name,
  }));
  const ownedIds = new Set(owned.map(p => p.property_id));
  // Only list properties whose `city` matches the player's current city.
  // Legacy generic properties have no `city` field so they're filtered out.
  const forSale = PROPERTIES
    .filter(p => p.city === ch.city)
    .filter(p => !ownedIds.has(p.id))
    .map(p => ({
      ...p,
      cityName: cityById(p.city)?.name,
      locked: ch.level < (p.levelGate || 1),
    }));
  res.json({ owned, forSale, currentCity: ch.city, currentCityName: cityById(ch.city)?.name });
});

router.post('/buy', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const prop = propertyById(req.body?.property_id);
  if (!prop) return res.status(400).json({ error: 'Unknown property' });
  if (!prop.city) return res.status(400).json({ error: 'Legacy property — no longer for sale.' });
  if (prop.city !== ch.city) {
    return res.status(403).json({ error: `Must be in ${cityById(prop.city)?.name} to view this property.` });
  }
  const gate = prop.levelGate || 1;
  if (ch.level < gate) {
    return res.status(403).json({ error: `${prop.tierLabel || 'Tier ' + prop.tier} properties unlock at level ${gate}.` });
  }
  const exists = db.prepare('SELECT id FROM properties_owned WHERE char_id = ? AND property_id = ?')
    .get(ch.id, prop.id);
  if (exists) return res.status(409).json({ error: 'Already owned' });
  if (ch.cash < prop.cost) return res.status(400).json({ error: `Need £${prop.cost.toLocaleString()}` });
  ch.cash -= prop.cost;
  db.prepare('INSERT INTO properties_owned (char_id, property_id, city) VALUES (?, ?, ?)')
    .run(ch.id, prop.id, prop.city);
  writeLog(ch.id, 'property', `Bought ${prop.name} (${prop.address}) in ${cityById(prop.city)?.name} for £${prop.cost.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
