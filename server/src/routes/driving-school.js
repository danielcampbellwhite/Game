// Driving School — permanent driving-stat training. Mirrors the
// University route shape so the client can reuse its component.
//
// Higher driving skill increases street-race win odds and lessens
// the condition damage taken on inter-city drives.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { DRIVING_COURSES, STAT_CAPS } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

const courseById = id => DRIVING_COURSES.find(c => c.id === id);
const cooldownKey = id => `drive_${id}`;

// Cost scales with current driving skill — each point gets dearer.
const courseCost = (course, driving) => Math.floor(course.baseCost * (1 + driving * 0.5));

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const rows = db.prepare(
    "SELECT item_id, used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id LIKE 'drive_%'"
  ).all(ch.id);
  const cdMap = Object.fromEntries(rows.map(r => [r.item_id.replace(/^drive_/, ''), r.used_at]));

  const now = Date.now();
  const courses = DRIVING_COURSES.map(c => {
    const used = cdMap[c.id] || 0;
    const readyAt = used + c.cooldownSec * 1000;
    return {
      ...c,
      cost: courseCost(c, ch.driving ?? 1),
      readyAt,
      ready: now >= readyAt,
    };
  });
  res.json({
    courses,
    driving: ch.driving ?? 1,
    cap: STAT_CAPS.driving,
    maxed: (ch.driving ?? 1) >= STAT_CAPS.driving,
  });
});

router.post('/study', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const course = courseById(req.body?.course_id);
  if (!course) return res.status(400).json({ error: 'Unknown course' });
  const current = ch.driving ?? 1;
  if (current >= STAT_CAPS.driving) {
    return res.status(409).json({ error: `You're already at the driving cap (${STAT_CAPS.driving}). The instructors have nothing left to teach you.` });
  }

  const now = Date.now();
  const cd = db.prepare('SELECT used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id = ?')
    .get(ch.id, cooldownKey(course.id));
  if (cd) {
    const readyAt = cd.used_at + course.cooldownSec * 1000;
    if (now < readyAt) return res.status(429).json({ error: 'Course is on cooldown', readyAt });
  }

  if (ch.energy < course.energy) return res.status(400).json({ error: 'Not enough energy' });
  const cost = courseCost(course, current);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()}` });

  ch.energy -= course.energy;
  ch.cash -= cost;
  ch.driving = Math.min(STAT_CAPS.driving, current + course.gain);
  ch.happiness = Math.min(100, ch.happiness + 1);

  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(ch.id, cooldownKey(course.id), now);

  writeLog(ch.id, 'training', `${course.emoji} ${course.name} — +${course.gain} driving (now ${ch.driving}, permanent).`, { course: course.id });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), readyAt: now + course.cooldownSec * 1000 });
});

export default router;
