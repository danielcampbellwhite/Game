import { db } from '../db.js';
import { generateEvent, pickWinner } from '../data-bookmaker.js';
import { writeLog } from './log.js';

const TARGET_EVENT_COUNT = 8;

// Resolve any events whose deadline has passed; settle bets on them; top up
// the event pool to the target count. Called lazily on every bookmaker GET.
export function tickBookmaker() {
  const now = Date.now();

  // Resolve due events
  const due = db.prepare(
    `SELECT id, outcomes_json FROM bookmaker_events WHERE resolved_outcome IS NULL AND resolves_at <= ?`
  ).all(now);

  for (const ev of due) {
    const outcomes = JSON.parse(ev.outcomes_json);
    const winnerId = pickWinner(outcomes);
    db.prepare('UPDATE bookmaker_events SET resolved_outcome = ?, resolved_at = ? WHERE id = ?')
      .run(winnerId, now, ev.id);

    // Settle bets on this event
    const bets = db.prepare('SELECT * FROM bookmaker_bets WHERE event_id = ? AND settled = 0').all(ev.id);
    for (const bet of bets) {
      const won = bet.outcome === winnerId;
      const payout = won ? Math.floor(bet.amount * bet.odds_at_bet) : 0;
      db.prepare('UPDATE bookmaker_bets SET settled = 1, payout = ?, won = ?, settled_at = ? WHERE id = ?')
        .run(payout, won ? 1 : 0, now, bet.id);
      if (won) {
        db.prepare('UPDATE characters SET cash = cash + ? WHERE id = ?').run(payout, bet.char_id);
      }
      const winnerName = (outcomes.find(o => o.id === winnerId) || {}).name || winnerId;
      writeLog(bet.char_id, 'bookmaker',
        won
          ? `Won £${payout.toLocaleString()} on "${winnerName}".`
          : `Lost £${bet.amount.toLocaleString()} bet — winner was "${winnerName}".`,
        { event_id: ev.id, won }, true);
    }
  }

  // Top up to the target event count
  const activeCount = db.prepare(
    'SELECT COUNT(*) as n FROM bookmaker_events WHERE resolved_outcome IS NULL'
  ).get().n;

  for (let i = activeCount; i < TARGET_EVENT_COUNT; i++) {
    const ev = generateEvent();
    db.prepare(`
      INSERT INTO bookmaker_events
        (sport, name, description, outcomes_json, resolves_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      ev.sport, ev.name, ev.description,
      JSON.stringify(ev.outcomes),
      now + ev.durationMs,
      now
    );
  }
}

// Strip true probabilities before sending outcomes to the client.
export function publicOutcomes(outcomes) {
  return outcomes.map(({ id, name, odds }) => ({ id, name, odds }));
}
