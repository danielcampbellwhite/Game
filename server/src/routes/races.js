// Street races — live PvP request. Challenger picks a tier + stake;
// opponent has 60s to accept before it expires. On accept the server
// rolls a winner using car stats + driving skill + variance, settles
// cash both ways, and applies 5–20% condition damage to both cars
// (dampened by each driver's driving skill).

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { vehicleById, applyVehicleMods, cityById } from '../data.js';
import { saveCharacter, loadCharacterById, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { sendEvent } from '../services/events.js';

const router = Router();

const RACE_TTL_MS = 60 * 1000;            // 60s to accept
const RACE_MIN_STAKE = 100;
const RACE_DAMAGE_MIN = 5;                // condition % — both cars
const RACE_DAMAGE_MAX = 20;

function expireStale() {
  const now = Date.now();
  db.prepare(`UPDATE races SET status='expired', ended_at=? WHERE status='pending' AND expires_at < ?`).run(now, now);
}

function resolveActiveCar(charId) {
  const ch = loadCharacterById(charId);
  if (!ch?.active_vehicle_id) return null;
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(ch.active_vehicle_id, ch.id);
  if (!row) return null;
  const base = vehicleById(row.vehicle_id);
  if (!base) return null;
  const mods = applyVehicleMods(base, row.mods_json);
  return { ch, row, base, mods };
}

function publicRace(race, viewerId) {
  if (!race) return null;
  const result = race.result_json ? JSON.parse(race.result_json) : null;
  const youAre = race.challenger_id === viewerId
    ? 'challenger'
    : race.opponent_id === viewerId
      ? 'opponent'
      : 'observer';
  return {
    id: race.id,
    status: race.status,
    tier: race.tier,
    stake: race.stake,
    city: race.city,
    challenger_id: race.challenger_id,
    opponent_id: race.opponent_id,
    winner_id: race.winner_id || null,
    you: youAre,
    expires_at: race.expires_at,
    result,
  };
}

function resolveRace(challenger, opponent, race) {
  const cInfo = resolveActiveCar(challenger.id);
  const oInfo = resolveActiveCar(opponent.id);
  if (!cInfo) return { error: 'Challenger no longer has an active car.' };
  if (!oInfo) return { error: 'Opponent no longer has an active car.' };
  if (cInfo.base.tier !== race.tier) return { error: `Challenger's active car isn't tier ${race.tier} anymore.` };
  if (oInfo.base.tier !== race.tier) return { error: `Your active car isn't tier ${race.tier} anymore.` };

  // Win odds: 50/50 base, with per-stat advantages capped at ±45% so
  // the underdog always has a real shot.
  const carEdge   = ((cInfo.mods.power || 0) + (cInfo.mods.handling || 0))
                  - ((oInfo.mods.power || 0) + (oInfo.mods.handling || 0));
  const skillEdge = (challenger.driving || 1) - (opponent.driving || 1);
  // Power+handling on stock tier-1 ≈ 20-30, on tier-7 ≈ 200+. A 50pt
  // delta between same-tier cars (e.g. one fully modded, one stock) is
  // worth about 20% — meaningful but not crushing.
  const carWeight = 0.004;
  const skillWeight = 0.012;
  const advantage = carEdge * carWeight + skillEdge * skillWeight;
  let chance = 0.5 + advantage;
  chance = Math.max(0.05, Math.min(0.95, chance));
  const challengerWon = Math.random() < chance;

  // Condition damage 5–20%, halved by driving skill: skill 1 keeps
  // damage at ~99% of base; skill 80 (cap) keeps it at 60%.
  const baseRoll = () => RACE_DAMAGE_MIN + Math.random() * (RACE_DAMAGE_MAX - RACE_DAMAGE_MIN);
  const dampener = (drv) => Math.max(0.4, 1 - (drv || 1) * 0.005);
  const cDmg = baseRoll() * dampener(challenger.driving);
  const oDmg = baseRoll() * dampener(opponent.driving);
  const cAfter = Math.max(0, cInfo.row.condition - cDmg);
  const oAfter = Math.max(0, oInfo.row.condition - oDmg);

  // Settle pot. Both sides put up `stake`; loser already paid in by
  // staking, winner takes both pots.
  const pot = race.stake * 2;
  if (challengerWon) {
    challenger.cash += pot - race.stake;       // net +stake
    opponent.cash   -= race.stake;
  } else {
    opponent.cash   += pot - race.stake;       // net +stake
    challenger.cash -= race.stake;
  }

  db.prepare('UPDATE vehicles_owned SET condition = ? WHERE id = ?').run(cAfter, cInfo.row.id);
  db.prepare('UPDATE vehicles_owned SET condition = ? WHERE id = ?').run(oAfter, oInfo.row.id);
  saveCharacter(challenger);
  saveCharacter(opponent);

  return {
    ok: true,
    winner_id: challengerWon ? challenger.id : opponent.id,
    chance,
    challenger: {
      car: `${cInfo.base.maker} ${cInfo.base.name}`,
      condition_before: cInfo.row.condition,
      condition_after: cAfter,
      damage: cDmg,
    },
    opponent: {
      car: `${oInfo.base.maker} ${oInfo.base.name}`,
      condition_before: oInfo.row.condition,
      condition_after: oAfter,
      damage: oDmg,
    },
  };
}

// GET /api/races — pending races involving the caller (incoming +
// outgoing) plus the most recent few completed ones for history.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  expireStale();
  const ch = req.character;
  const incoming = db.prepare(`
    SELECT * FROM races
    WHERE opponent_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `).all(ch.id);
  const outgoing = db.prepare(`
    SELECT * FROM races
    WHERE challenger_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `).all(ch.id);
  const recent = db.prepare(`
    SELECT * FROM races
    WHERE (challenger_id = ? OR opponent_id = ?) AND status != 'pending'
    ORDER BY ended_at DESC LIMIT 10
  `).all(ch.id, ch.id);
  res.json({
    incoming: incoming.map(r => publicRace(r, ch.id)),
    outgoing: outgoing.map(r => publicRace(r, ch.id)),
    recent: recent.map(r => publicRace(r, ch.id)),
  });
});

// POST /api/races — challenge another player. Body: { opponent_id, tier, stake }.
router.post('/', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  expireStale();
  const ch = req.character;
  const opponentId = parseInt(req.body?.opponent_id, 10);
  const tier = parseInt(req.body?.tier, 10);
  const stake = Math.max(0, parseInt(req.body?.stake, 10) || 0);

  if (!Number.isFinite(opponentId) || opponentId === ch.id) {
    return res.status(400).json({ error: 'Pick another player.' });
  }
  if (stake < RACE_MIN_STAKE) {
    return res.status(400).json({ error: `Minimum stake is £${RACE_MIN_STAKE}.` });
  }
  if (ch.cash < stake) return res.status(400).json({ error: `Need £${stake.toLocaleString()}.` });

  const opponent = loadCharacterById(opponentId);
  if (!opponent) return res.status(404).json({ error: 'Opponent not found.' });
  if (opponent.city !== ch.city) {
    return res.status(400).json({ error: 'You both have to be in the same city to race.' });
  }
  // Tier is implied by the challenger's active car (server doesn't
  // trust client). Opponent must be driving a same-tier car.
  const cInfo = resolveActiveCar(ch.id);
  const oInfo = resolveActiveCar(opponent.id);
  if (!cInfo)               return res.status(400).json({ error: 'You need an active car to race.' });
  if (!oInfo)               return res.status(400).json({ error: 'They have no active car.' });
  const raceTier = cInfo.base.tier;
  if (Number.isFinite(tier) && tier !== raceTier) {
    return res.status(400).json({ error: `Your active car is tier ${raceTier}, not ${tier}.` });
  }
  if (oInfo.base.tier !== raceTier) {
    return res.status(400).json({ error: `Their active car is tier ${oInfo.base.tier}; you'd need a tier-${raceTier} match.` });
  }

  // Don't spam: only one outgoing pending race at a time per pairing.
  const existing = db.prepare(`
    SELECT id FROM races WHERE status = 'pending'
      AND ((challenger_id = ? AND opponent_id = ?) OR (challenger_id = ? AND opponent_id = ?))
  `).get(ch.id, opponentId, opponentId, ch.id);
  if (existing) return res.status(409).json({ error: 'There is already a pending race between you two.' });

  const now = Date.now();
  const r = db.prepare(`
    INSERT INTO races (challenger_id, opponent_id, tier, stake, status, city, created_at, expires_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(ch.id, opponentId, raceTier, stake, ch.city, now, now + RACE_TTL_MS);
  const race = db.prepare('SELECT * FROM races WHERE id = ?').get(r.lastInsertRowid);

  sendEvent(opponentId, 'race.challenged', { race: publicRace(race, opponentId) });
  sendEvent(ch.id, 'race.sent', { race: publicRace(race, ch.id) });

  writeLog(ch.id, 'pvp', `Challenged ${opponent.name} to a tier-${raceTier} race for £${stake.toLocaleString()}.`);
  res.json({ ok: true, race: publicRace(race, ch.id) });
});

// POST /api/races/:id/accept — opponent confirms; race resolves now.
router.post('/:id/accept', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  expireStale();
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const race = db.prepare('SELECT * FROM races WHERE id = ?').get(id);
  if (!race || race.opponent_id !== ch.id) return res.status(404).json({ error: 'Race not found.' });
  if (race.status !== 'pending') return res.status(409).json({ error: 'Race is no longer pending.' });

  const challenger = loadCharacterById(race.challenger_id);
  if (!challenger) {
    db.prepare(`UPDATE races SET status='expired', ended_at=? WHERE id=?`).run(Date.now(), id);
    return res.status(404).json({ error: 'Challenger is no longer available.' });
  }
  if (ch.cash < race.stake)        return res.status(400).json({ error: `Need £${race.stake.toLocaleString()} to cover the stake.` });
  if (challenger.cash < race.stake) return res.status(400).json({ error: 'Challenger can no longer cover the stake.' });
  if (challenger.city !== ch.city) return res.status(400).json({ error: 'You both need to be in the same city.' });

  const result = resolveRace(challenger, ch, race);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  db.prepare(`
    UPDATE races SET status='completed', winner_id=?, result_json=?, ended_at=? WHERE id=?
  `).run(result.winner_id, JSON.stringify(result), Date.now(), id);

  const finalRace = db.prepare('SELECT * FROM races WHERE id = ?').get(id);
  sendEvent(challenger.id, 'race.completed', { race: publicRace(finalRace, challenger.id) });
  sendEvent(ch.id, 'race.completed', { race: publicRace(finalRace, ch.id) });

  const winnerName = result.winner_id === challenger.id ? challenger.name : ch.name;
  writeLog(challenger.id, 'pvp', `Raced ${ch.name} (tier-${race.tier}, £${race.stake.toLocaleString()}). ${winnerName} took the pot.`, { race_id: id });
  writeLog(ch.id, 'pvp', `Raced ${challenger.name} (tier-${race.tier}, £${race.stake.toLocaleString()}). ${winnerName} took the pot.`, { race_id: id });

  res.json({ ok: true, race: publicRace(finalRace, ch.id), character: publicCharacter(ch) });
});

// POST /api/races/:id/decline — opponent rejects.
router.post('/:id/decline', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const race = db.prepare('SELECT * FROM races WHERE id = ?').get(id);
  if (!race || race.opponent_id !== ch.id) return res.status(404).json({ error: 'Race not found.' });
  if (race.status !== 'pending') return res.status(409).json({ error: 'Race is no longer pending.' });
  db.prepare(`UPDATE races SET status='declined', ended_at=? WHERE id=?`).run(Date.now(), id);
  sendEvent(race.challenger_id, 'race.declined', { id });
  res.json({ ok: true });
});

// POST /api/races/:id/cancel — challenger pulls back before accept.
router.post('/:id/cancel', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const race = db.prepare('SELECT * FROM races WHERE id = ?').get(id);
  if (!race || race.challenger_id !== ch.id) return res.status(404).json({ error: 'Race not found.' });
  if (race.status !== 'pending') return res.status(409).json({ error: 'Race is no longer pending.' });
  db.prepare(`UPDATE races SET status='cancelled', ended_at=? WHERE id=?`).run(Date.now(), id);
  sendEvent(race.opponent_id, 'race.cancelled', { id });
  res.json({ ok: true });
});

export default router;
