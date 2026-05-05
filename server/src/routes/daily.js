import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { RANKS } from '../data.js';

const router = Router();

// Index into the RANKS ladder for the player's current reputation.
// Drives the rank multiplier on the daily reward — a Kingpin pulls
// 9× the base of a Nobody, on top of the per-level scaling.
function rankIndexFor(rep) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (rep >= RANKS[i].rep) idx = i;
  return idx;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// For brand new characters, last_daily is null — fall back to the account
// creation time so the first claim isn't available until 24h after signup.
const lastClaimable = (ch) => ch.last_daily || ch.created_at || 0;

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  const last = lastClaimable(ch);
  const ready = (now - last) >= DAY_MS;
  const streakAlive = ch.last_daily && (now - ch.last_daily) < 2 * DAY_MS;
  const base = 400 + ch.level * 100;
  const rankMul = 1 + rankIndexFor(ch.reputation || 0);
  res.json({
    ready,
    streak: streakAlive ? ch.login_streak : 0,
    last_daily: ch.last_daily,
    nextClaimAt: last + DAY_MS,
    nextReward: Math.floor(base * rankMul),
    rankMultiplier: rankMul,
  });
});

router.post('/claim', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  const last = lastClaimable(ch);
  if ((now - last) < DAY_MS) return res.status(400).json({ error: 'Daily reward not ready yet — come back tomorrow.' });
  const streakAlive = (now - last) < 2 * DAY_MS && last > 0;
  ch.login_streak = streakAlive ? ch.login_streak + 1 : 1;
  ch.last_daily = now;
  // Per-level base + a rank multiplier so veterans see the daily scale
  // with their criminal standing (1× at Nobody → 9× at Kingpin). Streak
  // still tracked for the day-7 vital refill bonus.
  const base = 400 + ch.level * 100;
  const rankMul = 1 + rankIndexFor(ch.reputation || 0);
  const reward = Math.floor(base * rankMul);
  ch.cash += reward;
  // Day 7 bonus: full energy + nerve refill
  if (ch.login_streak % 7 === 0) {
    ch.energy = ch.max_energy;
    ch.nerve = ch.max_nerve;
    ch.health = ch.max_health;
    writeLog(ch.id, 'daily', `Claimed daily +£${reward} (streak ${ch.login_streak}). Day ${ch.login_streak} bonus: full refill!`);
  } else {
    writeLog(ch.id, 'daily', `Claimed daily +£${reward} (streak ${ch.login_streak}).`);
  }
  saveCharacter(ch);
  res.json({ ok: true, reward, streak: ch.login_streak, character: publicCharacter(ch) });
});

export default router;
