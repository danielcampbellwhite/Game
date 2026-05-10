import { Router } from 'express';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { GYM_MACHINES, STAT_CAPS } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { applyTrainingBuffs, buffSnapshot } from '../services/buffs.js';
import { bumpMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';

const router = Router();

const machineById = id => GYM_MACHINES.find(m => m.id === id);

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  res.json({
    machines: GYM_MACHINES,
    buffs: buffSnapshot(ch),
    progress: {
      strength: ch.strength_progress || 0,
      defence: ch.defence_progress || 0,
      speed: ch.speed_progress || 0,
    },
    base: {
      strength: ch.strength,
      defence: ch.defence,
      speed: ch.speed,
    },
  });
});

const PROGRESS_PER_BUFF_POINT = 0.025;
const PERMANENT_STATS = ['strength', 'defence', 'speed'];

router.post('/train', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const m = machineById(req.body?.machine_id);
  if (!m) return res.status(400).json({ error: 'Unknown machine' });
  if (ch.energy < m.energy) return res.status(400).json({ error: 'Not enough energy' });
  if (ch.cash < m.cost) return res.status(400).json({ error: `Need £${m.cost}` });

  ch.energy -= m.energy;
  ch.cash -= m.cost;
  applyTrainingBuffs(ch, m.buffs);
  ch.happiness = Math.min(100, ch.happiness + 1);
  bumpMission(ch, 'gym_session', 1, { machine: m.id });

  const permanentGains = {};
  for (const stat of PERMANENT_STATS) {
    const buffAmount = m.buffs[stat] || 0;
    if (buffAmount <= 0) continue;
    const cap = STAT_CAPS[stat];
    if ((ch[stat] || 0) >= cap) {
      ch[`${stat}_progress`] = 0;
      continue;
    }
    const before = ch[`${stat}_progress`] || 0;
    let progress = before + buffAmount * PROGRESS_PER_BUFF_POINT;
    let gained = 0;
    while (progress >= 1.0 && (ch[stat] || 0) < cap) {
      ch[stat] = (ch[stat] || 0) + 1;
      progress -= 1.0;
      gained += 1;
    }
    if ((ch[stat] || 0) >= cap) progress = 0;
    ch[`${stat}_progress`] = progress;
    if (gained > 0) permanentGains[stat] = gained;
  }

  const buffSummary = Object.entries(m.buffs).map(([s, v]) => `+${v} ${s}`).join(', ');
  const permSummary = Object.entries(permanentGains).map(([s, v]) => `+${v} ${s} (PERMANENT)`).join(', ');
  const logMsg = permSummary
    ? `${m.emoji} ${m.name} — ${buffSummary}; ${permSummary}.`
    : `${m.emoji} ${m.name} — ${buffSummary} (decays over time).`;
  writeLog(ch.id, 'training', logMsg, { machine: m.id, permanentGains });
  saveCharacter(ch);
  res.json({ ok: true, permanentGains, character: publicCharacter(ch), buffs: buffSnapshot(ch) });
});

export default router;
