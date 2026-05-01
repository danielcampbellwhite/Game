import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  const remaining = ch.jail_until && ch.jail_until > now ? ch.jail_until - now : 0;
  const lawyerCost = remaining > 0 ? Math.max(500, Math.floor(remaining / 1000) * 5) : 0;
  const bribeCost  = remaining > 0 ? Math.max(2000, Math.floor(remaining / 1000) * 25) : 0;
  res.json({ inJail: remaining > 0, jail_until: ch.jail_until, lawyerCost, bribeCost });
});

router.post('/lawyer', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  if (!ch.jail_until || ch.jail_until <= now) return res.status(400).json({ error: 'Not in jail' });
  const remaining = ch.jail_until - now;
  const cost = Math.max(500, Math.floor(remaining / 1000) * 5);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  ch.cash -= cost;
  ch.jail_until = now + Math.floor(remaining / 2);
  writeLog(ch.id, 'jail', `Hired a lawyer for £${cost}, sentence cut in half.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/bribe', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  if (!ch.jail_until || ch.jail_until <= now) return res.status(400).json({ error: 'Not in jail' });
  const remaining = ch.jail_until - now;
  const cost = Math.max(2000, Math.floor(remaining / 1000) * 25);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  // 90% chance succeeds; on fail, lose cash and double sentence
  if (Math.random() < 0.9) {
    ch.cash -= cost;
    ch.jail_until = null;
    ch.jail_reason = null;
    writeLog(ch.id, 'jail', `Bribed your way out for £${cost}.`);
  } else {
    ch.cash -= cost;
    ch.jail_until = now + remaining * 2;
    writeLog(ch.id, 'jail', `Bribe rejected — sentence doubled and lost £${cost}.`);
  }
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
