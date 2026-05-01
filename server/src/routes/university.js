import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { UNIVERSITY_COURSES, STAT_CAPS } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { bumpMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';

const router = Router();

const courseById = id => UNIVERSITY_COURSES.find(c => c.id === id);
const cooldownKey = id => `uni_${id}`;

// Cost scales with current intelligence — each point gets dearer.
const courseCost = (course, intel) => Math.floor(course.baseCost * (1 + intel * 0.5));

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const rows = db.prepare(
    "SELECT item_id, used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id LIKE 'uni_%'"
  ).all(ch.id);
  const cdMap = Object.fromEntries(rows.map(r => [r.item_id.replace(/^uni_/, ''), r.used_at]));

  const now = Date.now();
  const courses = UNIVERSITY_COURSES.map(c => {
    const used = cdMap[c.id] || 0;
    const readyAt = used + c.cooldownSec * 1000;
    return {
      ...c,
      cost: courseCost(c, ch.intelligence),
      readyAt,
      ready: now >= readyAt,
    };
  });
  res.json({
    courses,
    intelligence: ch.intelligence,
    cap: STAT_CAPS.intelligence,
    maxed: ch.intelligence >= STAT_CAPS.intelligence,
  });
});

router.post('/study', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const course = courseById(req.body?.course_id);
  if (!course) return res.status(400).json({ error: 'Unknown course' });
  if (ch.intelligence >= STAT_CAPS.intelligence) {
    return res.status(409).json({ error: `You're already at the intelligence cap (${STAT_CAPS.intelligence}). The university has nothing left to teach you.` });
  }

  const now = Date.now();
  const cd = db.prepare('SELECT used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id = ?')
    .get(ch.id, cooldownKey(course.id));
  if (cd) {
    const readyAt = cd.used_at + course.cooldownSec * 1000;
    if (now < readyAt) return res.status(429).json({ error: 'Course is on cooldown', readyAt });
  }

  if (ch.energy < course.energy) return res.status(400).json({ error: 'Not enough energy' });
  const cost = courseCost(course, ch.intelligence);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()}` });

  ch.energy -= course.energy;
  ch.cash -= cost;
  ch.intelligence = Math.min(STAT_CAPS.intelligence, ch.intelligence + course.gain);
  ch.happiness = Math.min(100, ch.happiness + 1);
  bumpMission(ch, 'university_class', 1, { course: course.id });

  // Record cooldown
  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(ch.id, cooldownKey(course.id), now);

  writeLog(ch.id, 'training', `${course.emoji} ${course.name} — +${course.gain} intelligence (now ${ch.intelligence}, permanent).`, { course: course.id });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), readyAt: now + course.cooldownSec * 1000 });
});

export default router;
