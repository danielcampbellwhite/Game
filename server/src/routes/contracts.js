// Daily contracts. One anonymous tip per UTC day, single attempt,
// payout 3× the underlying crime's normal range. Picks from major +
// cyber crimes the player can already access. Locked to a city so
// the player has to travel to claim it.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CRIMES, crimeById, cityById, CITIES } from '../data.js';
import { saveCharacter, awardXp, publicCharacter, applyJailSentence } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

const PAYOUT_MUL = 3.0;
function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

// Pool of contract-eligible crimes — the chunky ones that feel worth
// flying for. Filtered by player level so a brand-new character isn't
// offered a £200k score they can't accept.
function pickCrime(level) {
  const pool = CRIMES.filter(c => (c.tier === 'major' || c.tier === 'cyber') && c.level <= level);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
function pickCity(currentCity) {
  // Anywhere, including the player's current city — gives the
  // home-bound player something useful day one.
  const ids = CITIES.map(c => c.id);
  return ids[Math.floor(Math.random() * ids.length)];
}

function ensureContract(ch) {
  const day = dayKey();
  const existing = db.prepare('SELECT * FROM daily_contracts WHERE char_id = ? AND day_key = ?').get(ch.id, day);
  if (existing) return existing;
  const crime = pickCrime(ch.level);
  if (!crime) return null;
  const city = pickCity(ch.city);
  db.prepare(`
    INSERT INTO daily_contracts (char_id, day_key, crime_id, city, payout_mul, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(ch.id, day, crime.id, city, PAYOUT_MUL, Date.now());
  return db.prepare('SELECT * FROM daily_contracts WHERE char_id = ? AND day_key = ?').get(ch.id, day);
}

function publicContract(row) {
  if (!row) return null;
  const c = crimeById(row.crime_id);
  if (!c) return null;
  return {
    crime: { id: c.id, name: c.name, tier: c.tier, energy: c.energy, risk: c.risk, base: c.base, min: c.min, max: c.max },
    city: row.city,
    cityName: cityById(row.city)?.name,
    payoutMul: row.payout_mul,
    status: row.status,
    minPayout: Math.floor((c.min || 0) * row.payout_mul),
    maxPayout: Math.floor((c.max || 0) * row.payout_mul),
    expiresAt: Date.UTC(...new Date().toISOString().slice(0,10).split('-').map((v,i)=>i===2?+v+1:i===1?+v-1:+v)),
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const row = ensureContract(ch);
  res.json({ contract: publicContract(row) });
});

router.post('/attempt', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const row = ensureContract(ch);
  if (!row) return res.status(404).json({ error: 'No contract available right now.' });
  if (row.status !== 'open') return res.status(409).json({ error: 'Today\'s contract is already done. Come back tomorrow.' });
  const crime = crimeById(row.crime_id);
  if (!crime) return res.status(500).json({ error: 'Contract crime missing from catalogue.' });
  if (ch.city !== row.city) return res.status(400).json({ error: `Travel to ${cityById(row.city)?.name || row.city} to take the job.` });
  if (ch.energy < crime.energy) return res.status(400).json({ error: `Need ${crime.energy} energy.` });

  // Roll success the same way regular crimes do (base + INT + level).
  const success = Math.max(5, Math.min(95, crime.base + ch.intelligence * 0.3 + ch.level * 0.4));
  const roll = Math.random() * 100;
  ch.energy -= crime.energy;
  const now = Date.now();
  if (roll < success) {
    const min = (crime.min || 0) * row.payout_mul;
    const max = (crime.max || 0) * row.payout_mul;
    const payout = Math.floor(min + Math.random() * (max - min));
    if (crime.dirty) ch.dirty_cash += payout; else ch.cash += payout;
    const xpGain = Math.floor((crime.xp || 0) * row.payout_mul);
    const lvls = awardXp(ch, xpGain);
    ch.reputation += Math.floor((crime.xp || 0) / 2);
    db.prepare(`UPDATE daily_contracts SET status='completed', ended_at=? WHERE char_id=? AND day_key=?`).run(now, ch.id, row.day_key);
    writeLog(ch.id, 'crime', `Daily contract: pulled "${crime.name}" — +£${payout.toLocaleString()} ${crime.dirty ? 'illegal' : ''} (3× tip), +${xpGain}xp.`, { crime: crime.id, contract: true, payout, xp: xpGain });
    saveCharacter(ch);
    return res.json({ ok: true, success: true, payout, xp: xpGain, levels: lvls, character: publicCharacter(ch) });
  }

  // Failure path: same risk profile as the underlying crime — but
  // contract-flavoured logging.
  const riskTable = { tiny: 3, low: 5, med: 10, high: 18, extreme: 30 };
  const fallback = riskTable[crime.risk] ?? 8;
  const jailMin = Math.max(2, fallback + Math.floor(Math.random() * fallback));
  applyJailSentence(ch, jailMin * 60 * 1000, `Daily contract botched — caught attempting "${crime.name}". ${jailMin}m inside.`);
  db.prepare(`UPDATE daily_contracts SET status='failed', ended_at=? WHERE char_id=? AND day_key=?`).run(now, ch.id, row.day_key);
  writeLog(ch.id, 'crime', `Daily contract: blew "${crime.name}" — jailed ${jailMin}m.`, { crime: crime.id, contract: true, jailMin }, true);
  saveCharacter(ch);
  res.json({ ok: true, success: false, jailMin, character: publicCharacter(ch) });
});

export default router;
