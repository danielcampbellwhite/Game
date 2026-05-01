import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, awardXp, publicCharacter, MAX_LEVEL } from '../services/character.js';
import { loadMissions, claimMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';
import { missionById } from '../data.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const missions = loadMissions(req.character);
  // Next reset is the next 00:00 UTC.
  const now = new Date();
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  res.json({ missions, resets_at: reset });
});

router.post('/claim', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const missionId = req.body?.mission_id;
  if (!missionId) return res.status(400).json({ error: 'mission_id required' });
  const result = claimMission(ch, missionId);
  if (result.error) return res.status(400).json({ error: result.error });

  const lvls = awardXp(ch, result.xp);
  ch.cash += result.cash;
  const tpl = missionById(missionId);
  writeLog(ch.id, 'mission', `${tpl?.emoji || '🎯'} Claimed mission "${tpl?.name || missionId}" — +${result.xp}xp +£${result.cash.toLocaleString()}.`, { mission: missionId, xp: result.xp, cash: result.cash, levels: lvls });
  saveCharacter(ch);
  res.json({
    ok: true,
    xp: result.xp,
    cash: result.cash,
    levels: lvls,
    at_max_level: ch.level >= MAX_LEVEL,
    character: publicCharacter(ch),
  });
});

export default router;
