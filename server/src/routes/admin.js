// Admin / "god mode" endpoints. Two-step gate model:
//
//   1. ADMIN_TOKEN env var bootstraps the FIRST admin via /promote-self.
//      Without ADMIN_TOKEN set, the bootstrap path refuses outright.
//   2. After that, the users.is_admin DB flag is the source of truth.
//      All ongoing endpoints use requireAdmin (no token header needed).
//
// This means the env var only has to exist briefly (one bootstrap call),
// then can be removed. Day-to-day admin work runs purely off the JWT.

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

// Header-token gate, used only by /promote-self for bootstrap.
function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return res.status(403).json({ error: 'Admin bootstrap disabled (ADMIN_TOKEN unset).' });
  const got = req.headers['x-admin-token'];
  if (!got || !constantTimeEq(got, expected)) return res.status(403).json({ error: 'Bad admin token.' });
  next();
}

// DB-backed gate, used by every ongoing admin endpoint.
function requireAdmin(req, res, next) {
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!row?.is_admin) return res.status(403).json({ error: 'Admin only.' });
  next();
}

// ── Bootstrap ────────────────────────────────────────────────────────
// One-shot: grants admin to the calling user. Idempotent — safe to call
// repeatedly. Once any user has the flag set you can remove ADMIN_TOKEN
// from the env (the flag persists in the DB).
router.post('/promote-self', requireAuth, requireAdminToken, (req, res) => {
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(req.user.id);
  res.json({ ok: true, user_id: req.user.id, message: 'You are now an admin. ADMIN_TOKEN can be removed.' });
});

// ── Self-buff (legacy / convenience) ─────────────────────────────────
router.post('/buff-self', requireAuth, requireAdmin, requireCharacter, (req, res) => {
  const ch = req.character;
  applyEdits(ch, req.body || {}, { defaults: { level: 100, cashAdd: 100_000_000, maxStats: true } });
  saveCharacter(ch);
  writeLog(ch.id, 'system', `Admin self-buff applied.`);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// ── List players ─────────────────────────────────────────────────────
router.get('/players', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT
      c.id, c.user_id, c.name, c.city, c.level, c.status,
      c.cash, c.bank, c.dirty_cash,
      c.strength, c.defence, c.speed, c.intelligence,
      c.health, c.max_health, c.energy, c.max_energy, c.nerve, c.max_nerve,
      c.jail_until, c.hospital_until, c.created_at, c.last_active_at,
      u.username, u.is_admin
    FROM characters c
    JOIN users u ON u.id = c.user_id
    ORDER BY c.last_active_at DESC, c.id DESC
  `).all();
  res.json({ players: rows.map(r => ({ ...r, is_admin: !!r.is_admin })) });
});

// ── Fetch one player ─────────────────────────────────────────────────
router.get('/players/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ch = loadCharacterByCharacterId(id);
  if (!ch) return res.status(404).json({ error: 'No such player.' });
  res.json({ character: publicCharacter(ch) });
});

// ── Edit a player ────────────────────────────────────────────────────
//
// Body: any subset of editable fields. See applyEdits() below for the
// full menu. Mutations apply immediately; the response carries the
// updated public character so the admin UI can refresh in place.
router.post('/players/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ch = loadCharacterByCharacterId(id);
  if (!ch) return res.status(404).json({ error: 'No such player.' });
  const summary = applyEdits(ch, req.body || {});
  saveCharacter(ch);
  writeLog(ch.id, 'system', `Admin edit: ${summary || 'no changes'}.`, { admin_user_id: req.user.id });
  res.json({ ok: true, character: publicCharacter(ch), applied: summary });
});

// Loads a row by characters.id and runs applyTick so vitals reflect
// up-to-the-minute regen (otherwise editing energy/nerve looks stale).
function loadCharacterByCharacterId(id) {
  const row = db.prepare(`
    SELECT c.*, u.is_admin AS is_admin
    FROM characters c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(id);
  if (!row) return null;
  if (row.status === 'alive') applyTick(row);
  return row;
}

// Field whitelist + bounds. Anything outside this map is ignored, so the
// client (or a tampered request) can't write arbitrary columns.
const NUMERIC_FIELDS = {
  level:        { min: 1,  max: 999 },
  xp:           { min: 0,  max: 999_999_999 },
  cash:         { min: 0,  max: 999_999_999_999 },
  bank:         { min: 0,  max: 999_999_999_999 },
  dirty_cash:   { min: 0,  max: 999_999_999_999 },
  reputation:   { min: 0,  max: 999_999_999 },
  happiness:    { min: 0,  max: 100 },
  health:       { min: 0,  max: 999_999 },
  energy:       { min: 0,  max: 999_999 },
  nerve:        { min: 0,  max: 999_999 },
  strength:     { min: 1,  max: STAT_CAPS.strength },
  defence:      { min: 1,  max: STAT_CAPS.defence },
  speed:        { min: 1,  max: STAT_CAPS.speed },
  intelligence: { min: 1,  max: STAT_CAPS.intelligence },
};

function applyEdits(ch, body, opts = {}) {
  const def = opts.defaults || {};
  const changes = [];

  // Convenience flags. These are short-hands the buff-self endpoint uses
  // and the admin UI may also expose ("max stats", "+£X cash").
  if (body.maxStats || (def.maxStats && body.maxStats !== false)) {
    ch.strength     = STAT_CAPS.strength;
    ch.defence      = STAT_CAPS.defence;
    ch.speed        = STAT_CAPS.speed;
    ch.intelligence = STAT_CAPS.intelligence;
    changes.push('stats=max');
  }
  const cashAdd = body.cashAdd ?? def.cashAdd;
  if (Number.isFinite(cashAdd) && cashAdd !== 0) {
    ch.cash = Math.max(0, (ch.cash || 0) + Math.floor(cashAdd));
    changes.push(`cash+£${Math.floor(cashAdd).toLocaleString()}`);
  }
  if (body.releaseFromJail) {
    ch.jail_until = null;
    ch.jail_reason = null;
    changes.push('released from jail');
  }
  if (body.releaseFromHospital) {
    ch.hospital_until = null;
    ch.hospital_reason = null;
    ch.health = ch.max_health;
    changes.push('discharged from hospital');
  }
  if (body.fullVitals) {
    ch.energy = ch.max_energy;
    ch.nerve  = ch.max_nerve;
    ch.health = ch.max_health;
    ch.happiness = 100;
    changes.push('vitals=full');
  }

  // Direct numeric writes — clamped to bounds.
  for (const [field, { min, max }] of Object.entries(NUMERIC_FIELDS)) {
    if (body[field] != null) {
      const n = Math.floor(Number(body[field]));
      if (Number.isFinite(n)) {
        const clamped = Math.max(min, Math.min(max, n));
        if (ch[field] !== clamped) {
          ch[field] = clamped;
          changes.push(`${field}=${clamped}`);
        }
      }
    }
  }

  // Apply default level if neither the body nor an explicit level was
  // set, but only when the caller used buff-self (which seeds defaults).
  if (def.level && body.level == null) {
    ch.level = def.level;
    ch.xp = 0;
    changes.push(`level=${def.level}`);
  }

  // Re-derive max vitals from level. Top up energy/nerve/health if the
  // caller bumped level so the buff feels immediate.
  applyTick(ch);
  if (changes.find(c => c.startsWith('level='))) {
    ch.energy = ch.max_energy;
    ch.nerve  = ch.max_nerve;
    ch.health = ch.max_health;
  }

  return changes.join(', ');
}

export default router;
