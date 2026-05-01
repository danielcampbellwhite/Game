import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  const remaining = ch.hospital_until && ch.hospital_until > now ? ch.hospital_until - now : 0;
  const treatCost = remaining > 0
    ? Math.max(1000, Math.floor(remaining / 1000) * 10)
    : (ch.health < ch.max_health ? (ch.max_health - ch.health) * 50 : 0);
  res.json({ inHospital: remaining > 0, hospital_until: ch.hospital_until, treatCost, health: ch.health, max_health: ch.max_health });
});

router.post('/treat', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  if (ch.hospital_until && ch.hospital_until > now) {
    const remaining = ch.hospital_until - now;
    const cost = Math.max(1000, Math.floor(remaining / 1000) * 10);
    if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
    ch.cash -= cost;
    ch.hospital_until = null;
    ch.hospital_reason = null;
    ch.health = ch.max_health;
    writeLog(ch.id, 'hospital', `Paid £${cost} for fast-track discharge.`);
  } else if (ch.health < ch.max_health) {
    const cost = (ch.max_health - ch.health) * 50;
    if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
    ch.cash -= cost;
    ch.health = ch.max_health;
    writeLog(ch.id, 'hospital', `Paid £${cost} for full medical treatment.`);
  } else {
    return res.status(400).json({ error: 'Already at full health' });
  }
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
