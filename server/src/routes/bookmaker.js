import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { tickBookmaker, publicOutcomes } from '../services/bookmaker.js';
import { writeLog } from '../services/log.js';

const router = Router();

function decorateEvent(row) {
  const outcomes = JSON.parse(row.outcomes_json);
  return {
    id: row.id,
    sport: row.sport,
    name: row.name,
    description: row.description,
    outcomes: publicOutcomes(outcomes),
    resolves_at: row.resolves_at,
    resolved_outcome: row.resolved_outcome,
    resolved_outcome_name: row.resolved_outcome
      ? (outcomes.find(o => o.id === row.resolved_outcome) || {}).name
      : null,
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  tickBookmaker();

  const ch = req.character;
  const events = db.prepare(`
    SELECT * FROM bookmaker_events
    WHERE resolved_outcome IS NULL
    ORDER BY resolves_at ASC
  `).all().map(decorateEvent);

  // Open bets + recent settled bets (last 20) for the user
  const myBets = db.prepare(`
    SELECT b.*, e.name AS event_name, e.outcomes_json
    FROM bookmaker_bets b
    JOIN bookmaker_events e ON e.id = b.event_id
    WHERE b.char_id = ?
    ORDER BY b.created_at DESC
    LIMIT 20
  `).all(ch.id).map(b => {
    const outcomes = JSON.parse(b.outcomes_json);
    const pickName = (outcomes.find(o => o.id === b.outcome) || {}).name || b.outcome;
    return {
      id: b.id,
      event_id: b.event_id,
      event_name: b.event_name,
      outcome: b.outcome,
      pickName,
      amount: b.amount,
      odds: b.odds_at_bet,
      potential: Math.floor(b.amount * b.odds_at_bet),
      settled: !!b.settled,
      won: b.won === 1,
      payout: b.payout,
      created_at: b.created_at,
    };
  });

  res.json({ events, myBets });
});

router.post('/bet', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  tickBookmaker();
  const { event_id, outcome, amount } = req.body || {};
  const stake = Math.max(1, parseInt(amount || 0, 10));
  const ev = db.prepare('SELECT * FROM bookmaker_events WHERE id = ?').get(event_id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  if (ev.resolved_outcome) return res.status(409).json({ error: 'Event already resolved' });
  if (Date.now() >= ev.resolves_at) return res.status(409).json({ error: 'Betting closed for this event' });

  const outcomes = JSON.parse(ev.outcomes_json);
  const pick = outcomes.find(o => o.id === outcome);
  if (!pick) return res.status(400).json({ error: 'Invalid outcome' });
  if (ch.cash < stake) return res.status(400).json({ error: `Need £${stake.toLocaleString()}` });

  ch.cash -= stake;
  db.prepare(`
    INSERT INTO bookmaker_bets (char_id, event_id, outcome, amount, odds_at_bet, settled, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(ch.id, ev.id, outcome, stake, pick.odds, Date.now());
  writeLog(ch.id, 'bookmaker', `Bet £${stake.toLocaleString()} on "${pick.name}" @ ${pick.odds}.`,
    { event_id: ev.id, outcome, amount: stake, odds: pick.odds });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
