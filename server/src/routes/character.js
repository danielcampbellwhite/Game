import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { loadCharacter, applyTick, publicCharacter } from '../services/character.js';
import { recentLog, writeLog } from '../services/log.js';
import { CITIES, AVATARS, cityById } from '../data.js';

const router = Router();

// Starting stat allocation — mirrors client/components/StatAllocator.jsx.
// Each stat starts at STAT_BASE; the player gets STAT_POINTS to spend
// across the four base stats. Total spent must equal STAT_POINTS exactly
// (no leaving points on the table). Cap per stat is BASE + POINTS.
const STAT_BASE = 1;
const STAT_POINTS = 10;
const STAT_MAX = STAT_BASE + STAT_POINTS;
const STAT_KEYS = ['strength', 'defence', 'speed', 'intelligence'];

// Returns { ok, stats, error } where stats is the validated, integer-
// coerced object. Falsy / missing input is treated as "all base" and
// fails validation (since spent === 0 ≠ STAT_POINTS).
function validateStartingStats(input) {
  const out = {};
  for (const k of STAT_KEYS) {
    const v = Math.floor(Number(input?.[k]));
    if (!Number.isFinite(v) || v < STAT_BASE || v > STAT_MAX) {
      return { ok: false, error: `Each stat must be between ${STAT_BASE} and ${STAT_MAX}` };
    }
    out[k] = v;
  }
  const spent = STAT_KEYS.reduce((s, k) => s + (out[k] - STAT_BASE), 0);
  if (spent !== STAT_POINTS) {
    return { ok: false, error: `Spend exactly ${STAT_POINTS} stat points (you spent ${spent}).` };
  }
  return { ok: true, stats: out };
}

router.get('/options', (_req, res) => {
  res.json({ cities: CITIES, avatars: AVATARS });
});

router.post('/create', requireAuth, (req, res) => {
  const { name, avatar, city, stats } = req.body || {};
  if (!name || !city) return res.status(400).json({ error: 'name, city required' });
  if (!cityById(city)) return res.status(400).json({ error: 'Invalid city' });
  // Avatar is no longer surfaced in the UI — accept either an empty
  // string or a known avatar id (legacy data).
  const avatarVal = (avatar || '').trim();
  if (avatarVal && !AVATARS.includes(avatarVal)) return res.status(400).json({ error: 'Invalid avatar' });
  if (name.length < 2 || name.length > 24) return res.status(400).json({ error: 'Name length 2-24' });
  const sv = validateStartingStats(stats);
  if (!sv.ok) return res.status(400).json({ error: sv.error });
  const exists = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.id);
  if (exists) return res.status(409).json({ error: 'Character already exists' });
  // Names must be globally unique across all characters (case-insensitive).
  const taken = db.prepare('SELECT id FROM characters WHERE name = ? COLLATE NOCASE').get(name);
  if (taken) return res.status(409).json({ error: 'That name is taken — pick another.' });
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO characters (
      user_id, name, avatar, city,
      strength, defence, speed, intelligence,
      last_tick, last_health_tick, bank_last_interest,
      equipped_weapon, equipped_armour, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fists', 'none', ?)
  `).run(
    req.user.id, name, avatarVal, city,
    sv.stats.strength, sv.stats.defence, sv.stats.speed, sv.stats.intelligence,
    now, now, now, now,
  );
  writeLog(info.lastInsertRowid, 'system', `Welcome to ${cityById(city).name}, ${name}.`);
  const ch = loadCharacter(req.user.id);
  applyTick(ch);
  res.json({ character: publicCharacter(ch) });
});

router.get('/', requireAuth, (req, res) => {
  // Sidesteps requireCharacter so a pending_new_character row can still
  // read its own state (the client uses this to decide whether to show
  // the death banner / new-character form).
  const ch = loadCharacter(req.user.id);
  if (!ch) return res.status(404).json({ error: 'No character. Create one first.' });
  if (ch.status === 'alive') applyTick(ch);
  res.json({
    character: publicCharacter(ch),
    log: recentLog(ch.id, 30),
  });
});

// POST /api/character/new-character — rolls a fresh character after
// death. Resets the existing row (same DB id, same user account) to a
// level-10 newcomer with default stats and a fresh 3-day protection
// window from `created_at = now`.
router.post('/new-character', requireAuth, (req, res) => {
  const { name, avatar, city, stats } = req.body || {};
  const ch = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.id);
  if (!ch) return res.status(404).json({ error: 'No character to replace.' });
  if (ch.status !== 'pending_new_character') return res.status(409).json({ error: 'Your character is alive — no new character to roll.' });

  if (!name || !city) return res.status(400).json({ error: 'name, city required' });
  if (!cityById(city)) return res.status(400).json({ error: 'Invalid city' });
  const avatarVal = (avatar || '').trim();
  if (avatarVal && !AVATARS.includes(avatarVal)) return res.status(400).json({ error: 'Invalid avatar' });
  const trimmed = String(name).trim();
  if (trimmed.length < 2 || trimmed.length > 24) return res.status(400).json({ error: 'Name length 2-24' });
  const sv = validateStartingStats(stats);
  if (!sv.ok) return res.status(400).json({ error: sv.error });
  const taken = db.prepare('SELECT id FROM characters WHERE name = ? COLLATE NOCASE AND id != ?').get(trimmed, ch.id);
  if (taken) return res.status(409).json({ error: 'That name is taken — pick another.' });

  // Level-10 starting line. max_energy / max_nerve / max_health derive
  // from level via applyTick, so we just set level + reset vitals to
  // their level-10 caps in one shot.
  const now = Date.now();
  const maxEnergy = 100 + 5 * (10 - 1);
  const maxNerve  = 10 + Math.floor(10 / 5);
  const maxHealth = 100 + 5 * (10 - 1);

  db.prepare(`
    UPDATE characters SET
      name = ?, avatar = ?, city = ?,
      status = 'alive',
      level = 10, xp = 0,
      energy = ?, max_energy = ?,
      nerve = ?, max_nerve = ?,
      health = ?, max_health = ?,
      happiness = 50,
      strength = ?, defence = ?, speed = ?, intelligence = ?,
      reputation = 0,
      cash = 500, bank = 0, dirty_cash = 0,
      jail_until = NULL, jail_reason = NULL,
      hospital_until = NULL, hospital_reason = NULL,
      travel_until = NULL, travel_to = NULL,
      equipped_weapon = 'fists', equipped_armour = 'none',
      equipped_weapon_instance = NULL,
      prestige = 0,
      strength_buff = 0, strength_buff_at = NULL,
      defence_buff = 0, defence_buff_at = NULL,
      speed_buff = 0, speed_buff_at = NULL,
      accuracy_buff = 0, accuracy_buff_at = NULL,
      strength_progress = 0, defence_progress = 0, speed_progress = 0,
      last_tick = ?, last_health_tick = ?, bank_last_interest = ?,
      last_active_at = ?, created_at = ?
    WHERE id = ?
  `).run(
    trimmed, avatarVal, city,
    maxEnergy, maxEnergy,
    maxNerve, maxNerve,
    maxHealth, maxHealth,
    sv.stats.strength, sv.stats.defence, sv.stats.speed, sv.stats.intelligence,
    now, now, now, now, now,
    ch.id,
  );

  writeLog(ch.id, 'system', `${trimmed} starts fresh — level 10. Welcome to ${cityById(city).name}.`);
  const fresh = loadCharacter(req.user.id);
  applyTick(fresh);
  res.json({ character: publicCharacter(fresh) });
});

router.post('/prestige', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  if (ch.level < 80) return res.status(400).json({ error: 'Reach level 80 to prestige.' });
  const newPrestige = (ch.prestige || 0) + 1;
  // Wipe progress, keep prestige count.
  db.prepare(`
    UPDATE characters SET
      level = 1, xp = 0,
      energy = 100, max_energy = 100,
      nerve = 10, max_nerve = 10,
      health = 100, max_health = 100,
      happiness = 50,
      strength = 1, defence = 1, speed = 1, intelligence = 1,
      reputation = 0,
      cash = 5000, bank = 0, dirty_cash = 0,
      jail_until = NULL, jail_reason = NULL, hospital_until = NULL, hospital_reason = NULL, travel_until = NULL, travel_to = NULL,
      equipped_weapon = 'fists', equipped_armour = 'none',
      prestige = ?
    WHERE id = ?
  `).run(newPrestige, ch.id);
  db.prepare('DELETE FROM inventory WHERE char_id = ?').run(ch.id);
  db.prepare('DELETE FROM businesses_owned WHERE char_id = ?').run(ch.id);
  db.prepare('DELETE FROM properties_owned WHERE char_id = ?').run(ch.id);
  db.prepare('DELETE FROM stocks_owned WHERE char_id = ?').run(ch.id);
  db.prepare('DELETE FROM loans WHERE char_id = ?').run(ch.id);
  writeLog(ch.id, 'system', `Prestige ${newPrestige} achieved. +5% to all caps permanently.`);
  const fresh = loadCharacter(req.user.id);
  applyTick(fresh);
  res.json({ character: publicCharacter(fresh), prestige: newPrestige });
});

export default router;
