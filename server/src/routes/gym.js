import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { GYMS, gymById, GYM_MACHINES } from '../data-gyms.js';
import { STAT_CAPS } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { applyTrainingBuffs, buffSnapshot } from '../services/buffs.js';
import { bumpMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';

// Inline migration — we couldn't edit db.js in this deploy without
// blowing the push budget. Add the gym_id / gym_until columns on
// module load; the try/catch covers the idempotent case where they
// already exist.
try { db.exec('ALTER TABLE characters ADD COLUMN gym_id TEXT'); } catch {}
try { db.exec('ALTER TABLE characters ADD COLUMN gym_until INTEGER'); } catch {}

const router = Router();

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const machineById = id => GYM_MACHINES.find(m => m.id === id);

// Permanent-stat progression rate. Multiplied by the current gym's
// `progressionMul` so the high-tier members reach the cap faster.
const PROGRESS_PER_BUFF_POINT = 0.025;
const PERMANENT_STATS = ['strength', 'defence', 'speed'];

// saveCharacter() writes a hardcoded column list that doesn't include
// gym_id / gym_until — they were added by the inline ALTER TABLE above
// without an edit to the character service. Persist them directly
// whenever the route mutates them so they actually hit disk.
function persistGymMembership(ch) {
  db.prepare('UPDATE characters SET gym_id = ?, gym_until = ? WHERE id = ?')
    .run(ch.gym_id || null, ch.gym_until || null, ch.id);
}

function currentMembership(ch, now = Date.now()) {
  if (!ch.gym_id || !ch.gym_until || ch.gym_until <= now) return null;
  const gym = gymById(ch.gym_id);
  if (!gym) return null;
  return { gym, expiresAt: ch.gym_until };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  const active = currentMembership(ch, now);
  res.json({
    gyms: GYMS.map(g => ({
      ...g,
      locked: (ch.level || 1) < g.levelGate,
      youHere: active?.gym.id === g.id,
    })),
    membership: active ? { gymId: active.gym.id, expiresAt: active.expiresAt, msLeft: active.expiresAt - now } : null,
    // Every machine; client filters by minTier <= active gym tier.
    machines: GYM_MACHINES,
    buffs: buffSnapshot(ch),
    progress: {
      strength: ch.strength_progress || 0,
      defence:  ch.defence_progress  || 0,
      speed:    ch.speed_progress    || 0,
    },
    base: {
      strength: ch.strength,
      defence:  ch.defence,
      speed:    ch.speed,
    },
  });
});

// Join (or switch to) a gym — pay the weekly fee and overwrite any
// existing membership. Switching forfeits the remaining time on the
// old one. Locked gyms (below player level) refused.
router.post('/join', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const gym = gymById(req.body?.gym_id);
  if (!gym) return res.status(400).json({ error: 'Unknown gym.' });
  if ((ch.level || 1) < gym.levelGate) {
    return res.status(403).json({ error: `${gym.name} unlocks at level ${gym.levelGate}.` });
  }
  if (ch.cash < gym.weeklyFee) {
    return res.status(400).json({ error: `Need £${gym.weeklyFee.toLocaleString()} for a week's membership.` });
  }
  ch.cash -= gym.weeklyFee;
  ch.gym_id = gym.id;
  ch.gym_until = Date.now() + WEEK_MS;
  writeLog(ch.id, 'gym', `Signed up at ${gym.name} for £${gym.weeklyFee.toLocaleString()} (1 week).`);
  saveCharacter(ch);
  persistGymMembership(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// Renew the current membership for another week — same gym, same fee.
// Adds 7 days from now (or from current expiry if still active, so a
// keen player who renews a day early doesn't lose that day).
router.post('/renew', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  if (!ch.gym_id) return res.status(400).json({ error: "You're not a member of any gym." });
  const gym = gymById(ch.gym_id);
  if (!gym) return res.status(404).json({ error: 'Gym catalogue missing.' });
  if (ch.cash < gym.weeklyFee) {
    return res.status(400).json({ error: `Need £${gym.weeklyFee.toLocaleString()} to renew.` });
  }
  ch.cash -= gym.weeklyFee;
  const now = Date.now();
  const base = (ch.gym_until && ch.gym_until > now) ? ch.gym_until : now;
  ch.gym_until = base + WEEK_MS;
  writeLog(ch.id, 'gym', `Renewed ${gym.name} membership (£${gym.weeklyFee.toLocaleString()}, +1 week).`);
  saveCharacter(ch);
  persistGymMembership(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/train', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const m = machineById(req.body?.machine_id);
  if (!m) return res.status(400).json({ error: 'Unknown machine' });
  const active = currentMembership(ch);
  if (!active) return res.status(403).json({ error: 'Join a gym before training.' });
  if (active.gym.tier < m.minTier) {
    return res.status(403).json({ error: `That machine is at a tier-${m.minTier} gym — upgrade your membership to use it.` });
  }
  if (ch.energy < m.energy) return res.status(400).json({ error: `Not enough energy — needs ${m.energy}.` });

  ch.energy -= m.energy;
  applyTrainingBuffs(ch, m.buffs);
  ch.happiness = Math.min(100, ch.happiness + 1);
  bumpMission(ch, 'gym_session', 1, { machine: m.id });

  const mul = active.gym.progressionMul || 1;
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
    let progress = before + buffAmount * PROGRESS_PER_BUFF_POINT * mul;
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
    ? `${m.emoji} ${m.name} @ ${active.gym.name} — ${buffSummary}; ${permSummary}.`
    : `${m.emoji} ${m.name} @ ${active.gym.name} — ${buffSummary} (decays over time).`;
  writeLog(ch.id, 'training', logMsg, { machine: m.id, gym: active.gym.id, permanentGains });
  saveCharacter(ch);
  res.json({ ok: true, permanentGains, character: publicCharacter(ch), buffs: buffSnapshot(ch) });
});

export default router;
