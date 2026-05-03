// One-shot admin actions for the dev/owner. Every endpoint here requires
// (a) a valid Bearer JWT (so we know whose character to mutate) and
// (b) an `X-Admin-Token` header matching `process.env.ADMIN_TOKEN`.
//
// If ADMIN_TOKEN isn't set, the entire router refuses — production deploys
// must explicitly opt in by setting the env var. Don't leak the token in
// logs; it's checked with a constant-time compare to avoid timing leaks.

import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { STAT_CAPS } from '../data.js';
import { saveCharacter, applyTick, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

function constantTimeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return res.status(403).json({ error: 'Admin endpoints disabled (ADMIN_TOKEN unset).' });
  const got = req.headers['x-admin-token'];
  if (!got || !constantTimeEq(got, expected)) return res.status(403).json({ error: 'Bad admin token.' });
  next();
}

// POST /api/admin/buff-self
// Body (all optional, defaults shown):
//   { level: 100, cashAdd: 100000000, maxStats: true }
// Mutates the caller's character. Returns the updated public character.
router.post('/buff-self', requireAuth, requireAdminToken, requireCharacter, (req, res) => {
  const ch = req.character;
  const { level = 100, cashAdd = 100_000_000, maxStats = true } = req.body || {};

  if (Number.isFinite(level) && level >= 1 && level <= 999) {
    ch.level = Math.floor(level);
    ch.xp = 0;
  }
  if (maxStats) {
    ch.strength     = STAT_CAPS.strength;
    ch.defence      = STAT_CAPS.defence;
    ch.speed        = STAT_CAPS.speed;
    ch.intelligence = STAT_CAPS.intelligence;
  }
  if (Number.isFinite(cashAdd) && cashAdd !== 0) {
    ch.cash = Math.max(0, (ch.cash || 0) + Math.floor(cashAdd));
  }

  // applyTick recomputes max_energy/max_nerve/max_health from the new
  // level. Top vitals up to the new caps so the buff feels immediate.
  applyTick(ch);
  ch.energy = ch.max_energy;
  ch.nerve  = ch.max_nerve;
  ch.health = ch.max_health;

  saveCharacter(ch);
  writeLog(ch.id, 'system', `Admin buff applied: lvl=${ch.level}, cash+£${cashAdd.toLocaleString()}, stats maxed.`);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
