// Specialisation paths — pick once at level 25, locked in until
// retirement. Five passive nodes per path, auto-unlocked by level.

import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { SPECIALISATIONS } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

const UNLOCK_LEVEL = 25;

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const paths = SPECIALISATIONS.map(p => ({
    ...p,
    nodes: p.nodes.map(n => ({
      ...n,
      unlocked: ch.specialisation === p.id && (ch.level || 1) >= n.level,
    })),
  }));
  res.json({
    chosen: ch.specialisation || null,
    canChoose: !ch.specialisation && (ch.level || 1) >= UNLOCK_LEVEL,
    unlockLevel: UNLOCK_LEVEL,
    paths,
  });
});

router.post('/choose', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  if (ch.specialisation) return res.status(409).json({ error: 'You already chose a path. Retire to pick another.' });
  if ((ch.level || 1) < UNLOCK_LEVEL) {
    return res.status(403).json({ error: `Reach level ${UNLOCK_LEVEL} to specialise.` });
  }
  const id = req.body?.path;
  const path = SPECIALISATIONS.find(p => p.id === id);
  if (!path) return res.status(400).json({ error: 'Unknown specialisation path.' });
  ch.specialisation = path.id;
  saveCharacter(ch);
  writeLog(ch.id, 'system', `Specialised: ${path.name}. ${path.blurb}`);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
