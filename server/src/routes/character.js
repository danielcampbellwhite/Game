import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { loadCharacter, applyTick, publicCharacter } from '../services/character.js';
import { recentLog, writeLog } from '../services/log.js';
import { CITIES, AVATARS, cityById } from '../data.js';

const router = Router();

router.get('/options', (_req, res) => {
  res.json({ cities: CITIES, avatars: AVATARS });
});

router.post('/create', requireAuth, (req, res) => {
  const { name, avatar, city } = req.body || {};
  if (!name || !avatar || !city) return res.status(400).json({ error: 'name, avatar, city required' });
  if (!cityById(city)) return res.status(400).json({ error: 'Invalid city' });
  if (!AVATARS.includes(avatar)) return res.status(400).json({ error: 'Invalid avatar' });
  if (name.length < 2 || name.length > 24) return res.status(400).json({ error: 'Name length 2-24' });
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
    ) VALUES (?, ?, ?, ?, 1, 1, 1, 1, ?, ?, ?, 'fists', 'none', ?)
  `).run(req.user.id, name, avatar, city, now, now, now, now);
  writeLog(info.lastInsertRowid, 'system', `Welcome to ${cityById(city).name}, ${name}.`);
  const ch = loadCharacter(req.user.id);
  applyTick(ch);
  res.json({ character: publicCharacter(ch) });
});

router.get('/', requireAuth, requireCharacter, (req, res) => {
  res.json({
    character: publicCharacter(req.character),
    log: recentLog(req.character.id, 30),
  });
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
