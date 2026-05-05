// Bounty board — wanted-dead-or-alive postings. Anyone can post cash
// on another player's head. The amount is held in escrow until the
// target is murdered (auto-payout to the killer) or the placer
// cancels (refunded). Multiple stacking bounties allowed per target.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { RANKS, rankFor } from '../data.js';
import { saveCharacter, loadCharacterById, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { sendEvent } from '../services/events.js';

const router = Router();

// Minimum bounty scales with the target's rank tier — burning a Boss
// is dramatically more expensive than burning a Hustler. Index into
// the RANKS array; £1k base, doubling per tier, capped at £500k.
function minBountyForRep(rep) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (rep >= RANKS[i].rep) idx = i;
  return Math.min(500_000, 1000 * Math.pow(2, idx));
}

function publicBounty(row, viewerId) {
  return {
    id: row.id,
    target: { id: row.target_id, name: row.target_name, avatar: row.target_avatar, rank: rankFor(row.target_rep || 0).name },
    placer: { id: row.placer_id, name: row.placer_name },
    amount: row.amount,
    status: row.status,
    placed_at: row.placed_at,
    ended_at: row.ended_at,
    you_placed: row.placer_id === viewerId,
    you_target: row.target_id === viewerId,
  };
}

const BASE_QUERY = `
  SELECT b.*,
         t.name AS target_name, t.avatar AS target_avatar, t.reputation AS target_rep,
         p.name AS placer_name
  FROM bounties b
  JOIN characters t ON t.id = b.target_id
  JOIN characters p ON p.id = b.placer_id
`;

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  // Active wall — most recent first, big-money first as a secondary key.
  const open = db.prepare(`${BASE_QUERY} WHERE b.status = 'open' ORDER BY b.amount DESC, b.placed_at DESC`).all();
  // The caller's own postings (any status, last 30).
  const mine = db.prepare(`${BASE_QUERY} WHERE b.placer_id = ? ORDER BY b.placed_at DESC LIMIT 30`).all(ch.id);
  res.json({
    bounties: open.map(r => publicBounty(r, ch.id)),
    mine: mine.map(r => publicBounty(r, ch.id)),
  });
});

router.get('/min/:targetId', requireAuth, requireCharacter, (req, res) => {
  const target = loadCharacterById(parseInt(req.params.targetId, 10));
  if (!target) return res.status(404).json({ error: 'Target not found.' });
  res.json({ min: minBountyForRep(target.reputation || 0), targetRank: rankFor(target.reputation || 0).name });
});

router.post('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.body?.target_id, 10);
  const amount = Math.max(0, parseInt(req.body?.amount, 10) || 0);
  if (!Number.isFinite(targetId) || targetId === ch.id) {
    return res.status(400).json({ error: 'Pick another player.' });
  }
  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Target not found.' });
  const min = minBountyForRep(target.reputation || 0);
  if (amount < min) {
    return res.status(400).json({ error: `Minimum bounty on a ${rankFor(target.reputation || 0).name} is £${min.toLocaleString()}.` });
  }
  if (ch.cash < amount) return res.status(400).json({ error: `Need £${amount.toLocaleString()}.` });

  ch.cash -= amount;
  saveCharacter(ch);
  const r = db.prepare(`
    INSERT INTO bounties (placer_id, target_id, amount, status, placed_at)
    VALUES (?, ?, ?, 'open', ?)
  `).run(ch.id, targetId, amount, Date.now());

  writeLog(ch.id, 'pvp', `Posted a £${amount.toLocaleString()} bounty on ${target.name}.`, { target: targetId, amount });
  sendEvent(targetId, 'bounty.placed', { amount, by: ch.name });

  const row = db.prepare(`${BASE_QUERY} WHERE b.id = ?`).get(r.lastInsertRowid);
  res.json({ ok: true, bounty: publicBounty(row, ch.id), character: publicCharacter(ch) });
});

router.post('/:id/cancel', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM bounties WHERE id = ?').get(id);
  if (!row || row.placer_id !== ch.id) return res.status(404).json({ error: 'Bounty not found.' });
  if (row.status !== 'open') return res.status(409).json({ error: 'Bounty is no longer open.' });
  db.prepare(`UPDATE bounties SET status='cancelled', ended_at=? WHERE id=?`).run(Date.now(), id);
  ch.cash += row.amount;
  saveCharacter(ch);
  writeLog(ch.id, 'pvp', `Cancelled a bounty — £${row.amount.toLocaleString()} refunded.`, { bounty_id: id });
  res.json({ ok: true, character: publicCharacter(ch) });
});

// Settle every open bounty on `targetId` — paying the killer for each
// one. Called from the murder route on a successful kill. Returns the
// total cash credited so the route can include it in its response.
export function settleBountiesOnKill(killerId, targetId) {
  const open = db.prepare(`SELECT * FROM bounties WHERE target_id = ? AND status = 'open'`).all(targetId);
  if (!open.length) return { count: 0, total: 0 };
  const now = Date.now();
  let total = 0;
  for (const b of open) {
    db.prepare(`UPDATE bounties SET status='claimed', collector_id=?, ended_at=? WHERE id=?`)
      .run(killerId, now, b.id);
    total += b.amount;
    sendEvent(b.placer_id, 'bounty.claimed', { id: b.id, amount: b.amount });
  }
  db.prepare(`UPDATE characters SET cash = cash + ? WHERE id = ?`).run(total, killerId);
  return { count: open.length, total };
}

export default router;
