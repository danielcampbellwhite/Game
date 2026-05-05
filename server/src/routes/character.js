import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { loadCharacter, applyTick, publicCharacter } from '../services/character.js';
import { recentLog, writeLog } from '../services/log.js';
import { CITIES, AVATARS, cityById, FACTION_IDS, GENDERS, STARTER_BUDGET, STARTER_CAR_IDS, STARTER_BUSINESS_IDS, starterCars, starterHousesForCity, starterBusinesses } from '../data.js';
import { applyFactionPerks } from '../services/factions.js';

const router = Router();

// Starting stat allocation — mirrors client/components/StatAllocator.jsx.
// Each stat starts at STAT_BASE; the player gets STAT_POINTS to spend
// across the four base stats. Total spent must equal STAT_POINTS exactly
// (no leaving points on the table). Cap per stat is BASE + POINTS.
const STAT_BASE = 1;
const STAT_POINTS = 10;
const STAT_MAX = STAT_BASE + STAT_POINTS;
const STAT_KEYS = ['strength', 'defence', 'speed', 'intelligence'];

// Validates a starter pack { car_id, house_id, business_id } against
// the curated lists. Returns { ok, picks, error }. Picks are the
// resolved objects (with prices) ready to insert.
function validateStarter(input, city) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Pick a car, a house, and a business.' };
  const cars = starterCars();
  const houses = starterHousesForCity(city);
  const bizs = starterBusinesses();
  const car   = cars.find(c => c.id === input.car_id);
  const house = houses.find(h => h.id === input.house_id);
  const biz   = bizs.find(b => b.id === input.business_id);
  if (!car)   return { ok: false, error: 'Pick a starter car.' };
  if (!house) return { ok: false, error: `Pick a starter house in ${city.replace(/_/g, ' ')}.` };
  if (!biz)   return { ok: false, error: 'Pick a starter business.' };
  const total = car.price + house.price + biz.price;
  if (total > STARTER_BUDGET) {
    return { ok: false, error: `Over budget by £${(total - STARTER_BUDGET).toLocaleString()}.` };
  }
  return { ok: true, picks: { car, house, biz, total } };
}

// Insert vehicle / property / business rows for a freshly-created
// character. Used by both /create and /new-character so the starter
// loadout flows through every creation path identically.
function applyStarterPack(charId, city, picks) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at)
    VALUES (?, ?, 'bought', ?, ?)
  `).run(charId, picks.car.id, city, now);
  db.prepare(`
    INSERT INTO properties_owned (char_id, property_id, city)
    VALUES (?, ?, ?)
  `).run(charId, picks.house.id, city);
  db.prepare(`
    INSERT INTO businesses_owned (char_id, business_id, city, last_collected)
    VALUES (?, ?, ?, ?)
  `).run(charId, picks.biz.id, city, now);
}

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

router.get('/options', async (_req, res) => {
  const { FACTIONS } = await import('../data.js');
  // Per-city starter house lists — keyed by city id so the client can
  // swap them as the player picks a starting city without another
  // round-trip.
  const housesByCity = Object.fromEntries(CITIES.map(c => [c.id, starterHousesForCity(c.id)]));
  res.json({
    cities: CITIES,
    avatars: AVATARS,
    factions: FACTIONS,
    genders: GENDERS,
    starter: {
      budget: STARTER_BUDGET,
      cars: starterCars(),
      housesByCity,
      businesses: starterBusinesses(),
    },
  });
});

//  Gangster name generator 
// Used by the character-creation form's " Random" button. Pulls
// first/last from gender-aware buckets and occasionally adds a colourful
// nickname (e.g. "Vinny 'The Knife' Marino"). No DB hit; pure RNG over
// curated lists, so collisions with existing names are possible — the
// client just calls again if the player doesn't like the result.
const FIRST_M = [
  'Vito', 'Tony', 'Marco', 'Sal', 'Rocco', 'Carmine', 'Frank', 'Gino', 'Luca', 'Enzo',
  'Dante', 'Bruno', 'Dominic', 'Angelo', 'Vinny', 'Joey', 'Paulie', 'Sonny', 'Mickey', 'Nico',
  'Aleksei', 'Dmitri', 'Yuri', 'Vlad', 'Igor', 'Pavel', 'Boris', 'Sergei',
  'Liam', 'Connor', 'Aiden', 'Declan', 'Cillian', 'Sean', 'Patrick',
  'Hiroshi', 'Kenji', 'Takeshi', 'Akira',
  'Carlos', 'Diego', 'Hector', 'Rafael', 'Mateo',
  'Marcus', 'Jamal', 'Tyrone', 'Devon', 'Reggie',
];
const FIRST_F = [
  'Donna', 'Connie', 'Rosa', 'Maria', 'Gianna', 'Lucia', 'Sofia', 'Bianca', 'Giulia', 'Valentina',
  'Carmela', 'Angelica', 'Isabella', 'Stella', 'Mia', 'Vita', 'Nico',
  'Tatiana', 'Anastasia', 'Katya', 'Irina', 'Natasha', 'Nadia', 'Vera',
  'Siobhan', 'Saoirse', 'Niamh', 'Aoife', 'Maeve',
  'Yuki', 'Mei', 'Hana',
  'Lupita', 'Carmen', 'Esperanza', 'Selena', 'Camila',
  'Aaliyah', 'Imani', 'Nia', 'Zara',
];
const LAST_GANGSTER = [
  'Corleone', 'Soprano', 'Gambino', 'Romano', 'Conti', 'Rizzo', 'Marino', 'Russo', 'Esposito', 'Vitale',
  'Falcone', 'Gallo', 'Lombardi', 'Marchetti', 'Bianchi', 'Greco', 'Costa', 'Riva',
  'Volkov', 'Sokolov', 'Petrov', 'Ivanov', 'Romanov', 'Belov',
  "O'Connor", "O'Brien", 'Murphy', 'Walsh', 'Byrne', 'Doyle', 'Lynch',
  'Tanaka', 'Yamamoto', 'Watanabe', 'Sato',
  'Reyes', 'Vega', 'Cruz', 'Mendoza', 'Salazar',
  'Washington', 'Jackson', 'Carter',
];
const NICKNAMES = [
  'The Knife', 'The Bull', 'Bulldog', 'The Snake', 'Iceman', 'The Wolf',
  'Lucky', 'Bones', 'Knuckles', 'The Hammer', 'Slim', 'Fingers',
  'The Saint', 'Big', 'Fat', 'Three Fingers', 'Tommy Guns', 'The Shark',
  'Whitey', 'Red', 'Smiley', 'The Rat', 'The Cat',
];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

router.get('/random-name', (req, res) => {
  const gender = (req.query.gender || '').toString();
  const firsts = gender === 'female' ? FIRST_F : FIRST_M;
  const first = pick(firsts);
  const last  = pick(LAST_GANGSTER);
  // 1 in 5 names get a nickname injected. Keep it sparse so it stays
  // a treat rather than a tax on every roll.
  const includeNick = Math.random() < 0.2;
  const name = includeNick
    ? `${first} '${pick(NICKNAMES)}' ${last}`
    : `${first} ${last}`;
  // Hard cap matches the validator (2-32). Drop the nickname if it busts.
  if (name.length > 32) return res.json({ name: `${first} ${last}` });
  res.json({ name });
});

router.post('/create', requireAuth, (req, res) => {
  const { name, avatar, city, stats, faction, gender, starter } = req.body || {};
  if (!name || !city) return res.status(400).json({ error: 'name, city required' });
  if (!cityById(city)) return res.status(400).json({ error: 'Invalid city' });
  if (!faction || !FACTION_IDS.includes(faction)) return res.status(400).json({ error: 'Pick a faction' });
  if (!gender || !GENDERS.includes(gender)) return res.status(400).json({ error: 'Pick a gender' });
  // Avatar is no longer surfaced in the UI — accept either an empty
  // string or a known avatar id (legacy data).
  const avatarVal = (avatar || '').trim();
  if (avatarVal && !AVATARS.includes(avatarVal)) return res.status(400).json({ error: 'Invalid avatar' });
  if (name.length < 2 || name.length > 32) return res.status(400).json({ error: 'Name length 2-32' });
  const sv = validateStartingStats(stats);
  if (!sv.ok) return res.status(400).json({ error: sv.error });
  const starterCheck = validateStarter(starter, city);
  if (!starterCheck.ok) return res.status(400).json({ error: starterCheck.error });
  const exists = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.id);
  if (exists) return res.status(409).json({ error: 'Character already exists' });
  // Names must be globally unique across all characters (case-insensitive).
  const taken = db.prepare('SELECT id FROM characters WHERE name = ? COLLATE NOCASE').get(name);
  if (taken) return res.status(409).json({ error: 'That name is taken — pick another.' });
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO characters (
      user_id, name, avatar, city, faction, gender,
      strength, defence, speed, intelligence,
      last_tick, last_health_tick, bank_last_interest,
      equipped_weapon, equipped_armour, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fists', 'none', ?)
  `).run(
    req.user.id, name, avatarVal, city, faction, gender,
    sv.stats.strength, sv.stats.defence, sv.stats.speed, sv.stats.intelligence,
    now, now, now, now,
  );
  applyFactionPerks(info.lastInsertRowid, faction);
  applyStarterPack(info.lastInsertRowid, city, starterCheck.picks);
  writeLog(info.lastInsertRowid, 'system', `Welcome to ${cityById(city).name}, ${name}. Starter pack: ${starterCheck.picks.car.name}, ${starterCheck.picks.house.name}, ${starterCheck.picks.biz.name}.`);
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
  const { name, avatar, city, stats, faction, gender, starter } = req.body || {};
  const ch = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.id);
  if (!ch) return res.status(404).json({ error: 'No character to replace.' });
  if (ch.status !== 'pending_new_character') return res.status(409).json({ error: 'Your character is alive — no new character to roll.' });

  if (!name || !city) return res.status(400).json({ error: 'name, city required' });
  if (!cityById(city)) return res.status(400).json({ error: 'Invalid city' });
  if (!faction || !FACTION_IDS.includes(faction)) return res.status(400).json({ error: 'Pick a faction' });
  if (!gender || !GENDERS.includes(gender)) return res.status(400).json({ error: 'Pick a gender' });
  const avatarVal = (avatar || '').trim();
  if (avatarVal && !AVATARS.includes(avatarVal)) return res.status(400).json({ error: 'Invalid avatar' });
  const trimmed = String(name).trim();
  if (trimmed.length < 2 || trimmed.length > 32) return res.status(400).json({ error: 'Name length 2-32' });
  const sv = validateStartingStats(stats);
  if (!sv.ok) return res.status(400).json({ error: sv.error });
  const starterCheck2 = validateStarter(starter, city);
  if (!starterCheck2.ok) return res.status(400).json({ error: starterCheck2.error });
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
      name = ?, avatar = ?, city = ?, faction = ?, gender = ?,
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
    trimmed, avatarVal, city, faction, gender,
    maxEnergy, maxEnergy,
    maxNerve, maxNerve,
    maxHealth, maxHealth,
    sv.stats.strength, sv.stats.defence, sv.stats.speed, sv.stats.intelligence,
    now, now, now, now, now,
    ch.id,
  );

  applyFactionPerks(ch.id, faction);
  applyStarterPack(ch.id, city, starterCheck2.picks);
  writeLog(ch.id, 'system', `${trimmed} starts fresh — level 10. Welcome to ${cityById(city).name}. Starter pack: ${starterCheck2.picks.car.name}, ${starterCheck2.picks.house.name}, ${starterCheck2.picks.biz.name}.`);
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

// Upload a player profile picture. Body: { image: data URL }. We
// validate the prefix + size on the server (client should already
// resize to ~256px webp ≤ 50KB) and write the data URL straight to
// the avatar_image column.
const AVATAR_MAX_BYTES = 200_000;     // ~200KB, generous headroom
const AVATAR_PREFIX_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;
router.post('/avatar', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const image = req.body?.image;
  if (typeof image !== 'string' || !AVATAR_PREFIX_RE.test(image)) {
    return res.status(400).json({ error: 'Image must be a PNG, JPEG, WEBP or GIF data URL.' });
  }
  if (image.length > AVATAR_MAX_BYTES) {
    return res.status(413).json({ error: `Image too large (>${Math.round(AVATAR_MAX_BYTES/1024)}KB). Resize and try again.` });
  }
  ch.avatar_image = image;
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.delete('/avatar', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  ch.avatar_image = null;
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
