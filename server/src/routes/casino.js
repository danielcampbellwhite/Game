import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { rouletteColor, ROULETTE_PAYOUTS, rollSlot } from '../data-casino.js';
import { drawCard, cardLabel, handTotal, isBlackjack, dealerPlay, settle } from '../services/blackjack.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { factionBonusMul } from '../services/territories.js';

const router = Router();

// Casino games unlock gradually so a brand-new player isn't dumped
// at the high-stakes table on day one. Slots open from L1, blackjack
// at L5, roulette at L10. High-stakes (≥£50k) bets at any table
// require L15. All gates surface on GET /api/casino/state.
export const CASINO_GATES = {
  slots:        1,
  blackjack:    5,
  roulette:    10,
  high_stakes: 15,
};
const HIGH_STAKES_THRESHOLD = 50_000;
function gate(ch, game) {
  return (ch.level || 1) >= CASINO_GATES[game];
}
function gateHighStakes(ch, stake) {
  return stake < HIGH_STAKES_THRESHOLD || (ch.level || 1) >= CASINO_GATES.high_stakes;
}

router.get('/state', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  res.json({
    gates: CASINO_GATES,
    highStakesThreshold: HIGH_STAKES_THRESHOLD,
    yourLevel: ch.level || 1,
  });
});

//  Roulette

router.post('/roulette/spin', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const { betType, betValue, amount } = req.body || {};
  const stake = Math.max(1, parseInt(amount || 0, 10));
  if (!gate(ch, 'roulette')) return res.status(403).json({ error: `Roulette unlocks at level ${CASINO_GATES.roulette}.` });
  if (!gateHighStakes(ch, stake)) return res.status(403).json({ error: `High-stakes (£${HIGH_STAKES_THRESHOLD.toLocaleString()}+) bets unlock at level ${CASINO_GATES.high_stakes}.` });
  if (!ROULETTE_PAYOUTS[betType]) return res.status(400).json({ error: 'Bad bet type' });
  if (ch.cash < stake) return res.status(400).json({ error: `Need £${stake.toLocaleString()}` });

  const number = Math.floor(Math.random() * 37); // 0–36
  const color = rouletteColor(number);
  const oddEven = number === 0 ? null : (number % 2 === 0 ? 'even' : 'odd');
  const lowHigh = number === 0 ? null : (number <= 18 ? 'low' : 'high');
  const dozen   = number === 0 ? null : (number <= 12 ? 'dozen1' : number <= 24 ? 'dozen2' : 'dozen3');

  let won = false;
  if (betType === 'red' || betType === 'black') won = (color === betType);
  else if (betType === 'odd' || betType === 'even') won = (oddEven === betType);
  else if (betType === 'low' || betType === 'high') won = (lowHigh === betType);
  else if (betType === 'dozen1' || betType === 'dozen2' || betType === 'dozen3') won = (dozen === betType);
  else if (betType === 'number') won = (parseInt(betValue, 10) === number);

  ch.cash -= stake;
  // Faction-controlled gambling territory in this city → bonus on wins.
  const gamblingMul = factionBonusMul(ch.faction, ch.city, 'gambling');
  const payout = won ? Math.floor(stake * ROULETTE_PAYOUTS[betType] * gamblingMul) : 0;
  ch.cash += payout;

  writeLog(ch.id, 'casino',
    won ? `Roulette: ${number} ${color} — ${betType} bet won £${payout.toLocaleString()}${gamblingMul > 1 ? ` (turf +${Math.round((gamblingMul - 1) * 100)}%)` : ''}.`
        : `Roulette: ${number} ${color} — ${betType} bet lost £${stake.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, number, color, won, payout, character: publicCharacter(ch) });
});

//  Slots 

router.post('/slots/spin', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const stake = Math.max(1, parseInt(req.body?.amount || 0, 10));
  if (!gateHighStakes(ch, stake)) return res.status(403).json({ error: `High-stakes (£${HIGH_STAKES_THRESHOLD.toLocaleString()}+) bets unlock at level ${CASINO_GATES.high_stakes}.` });
  if (ch.cash < stake) return res.status(400).json({ error: `Need £${stake.toLocaleString()}` });
  ch.cash -= stake;

  const reels = [rollSlot(), rollSlot(), rollSlot()];
  const allMatch = reels[0].id === reels[1].id && reels[1].id === reels[2].id;
  const gamblingMul = factionBonusMul(ch.faction, ch.city, 'gambling');
  const payout = allMatch ? Math.floor(stake * reels[0].mul * gamblingMul) : 0;
  ch.cash += payout;

  writeLog(ch.id, 'casino',
    allMatch
      ? `Slots: ${reels.map(r => r.emoji).join(' ')} — JACKPOT £${payout.toLocaleString()}!`
      : `Slots: ${reels.map(r => r.emoji).join(' ')} — lost £${stake.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, reels, won: allMatch, payout, character: publicCharacter(ch) });
});

//  Blackjack 

function loadHand(charId) {
  const row = db.prepare('SELECT * FROM blackjack_hands WHERE char_id = ?').get(charId);
  if (!row) return null;
  return {
    bet: row.bet,
    playerCards: JSON.parse(row.player_cards),
    dealerCards: JSON.parse(row.dealer_cards),
    status: row.status,
    result: row.result,
    message: row.message,
  };
}

function saveHand(charId, hand) {
  db.prepare(`
    INSERT INTO blackjack_hands (char_id, bet, player_cards, dealer_cards, status, result, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(char_id) DO UPDATE SET
      bet = excluded.bet,
      player_cards = excluded.player_cards,
      dealer_cards = excluded.dealer_cards,
      status = excluded.status,
      result = excluded.result,
      message = excluded.message
  `).run(charId, hand.bet,
    JSON.stringify(hand.playerCards),
    JSON.stringify(hand.dealerCards),
    hand.status,
    hand.result || null,
    hand.message || null,
    Date.now());
}

// Outgoing format: dealer first card hidden until status != 'playing'.
function publicHand(hand) {
  if (!hand) return null;
  const dealerVisible = hand.status === 'playing'
    ? [hand.dealerCards[0], { hidden: true }]
    : hand.dealerCards;
  return {
    bet: hand.bet,
    playerCards: hand.playerCards.map(cardLabel),
    dealerCards: dealerVisible.map(c => c.hidden ? '' : cardLabel(c)),
    playerTotal: handTotal(hand.playerCards),
    dealerTotal: hand.status === 'playing' ? null : handTotal(hand.dealerCards),
    status: hand.status,
    result: hand.result,
    message: hand.message,
  };
}

router.get('/blackjack', requireAuth, requireCharacter, (req, res) => {
  res.json({ hand: publicHand(loadHand(req.character.id)) });
});

router.post('/blackjack/deal', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  if (!gate(ch, 'blackjack')) return res.status(403).json({ error: `Blackjack unlocks at level ${CASINO_GATES.blackjack}.` });
  const stake = Math.max(1, parseInt(req.body?.bet || 0, 10));
  if (!gateHighStakes(ch, stake)) return res.status(403).json({ error: `High-stakes (£${HIGH_STAKES_THRESHOLD.toLocaleString()}+) bets unlock at level ${CASINO_GATES.high_stakes}.` });
  const existing = loadHand(ch.id);
  if (existing && existing.status === 'playing') {
    return res.status(409).json({ error: 'Finish your current hand first.' });
  }
  if (ch.cash < stake) return res.status(400).json({ error: `Need £${stake.toLocaleString()}` });
  ch.cash -= stake;

  const playerCards = [drawCard(), drawCard()];
  const dealerCards = [drawCard(), drawCard()];
  let hand = { bet: stake, playerCards, dealerCards, status: 'playing' };

  // Auto-resolve if either side has natural blackjack
  if (isBlackjack(playerCards) || isBlackjack(dealerCards)) {
    const result = settle(playerCards, dealerCards, stake);
    ch.cash += result.payout;
    hand.status = 'finished';
    hand.result = result.result;
    hand.message = result.message;
  }

  saveHand(ch.id, hand);
  writeLog(ch.id, 'casino',
    hand.status === 'finished'
      ? `Blackjack: ${hand.message}`
      : `Blackjack: dealt £${stake.toLocaleString()} hand.`);
  saveCharacter(ch);
  res.json({ ok: true, hand: publicHand(hand), character: publicCharacter(ch) });
});

router.post('/blackjack/hit', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const hand = loadHand(ch.id);
  if (!hand || hand.status !== 'playing') return res.status(400).json({ error: 'No active hand' });
  hand.playerCards.push(drawCard());
  if (handTotal(hand.playerCards) > 21) {
    const result = settle(hand.playerCards, hand.dealerCards, hand.bet);
    hand.status = 'finished';
    hand.result = result.result;
    hand.message = result.message;
  }
  saveHand(ch.id, hand);
  res.json({ ok: true, hand: publicHand(hand), character: publicCharacter(ch) });
});

router.post('/blackjack/stand', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const hand = loadHand(ch.id);
  if (!hand || hand.status !== 'playing') return res.status(400).json({ error: 'No active hand' });
  hand.dealerCards = dealerPlay(hand.dealerCards);
  const result = settle(hand.playerCards, hand.dealerCards, hand.bet);
  ch.cash += result.payout;
  hand.status = 'finished';
  hand.result = result.result;
  hand.message = result.message;
  saveHand(ch.id, hand);
  writeLog(ch.id, 'casino', `Blackjack: ${hand.message}${result.payout ? ` (+£${result.payout.toLocaleString()})` : ''}.`);
  saveCharacter(ch);
  res.json({ ok: true, hand: publicHand(hand), character: publicCharacter(ch) });
});

router.post('/blackjack/double', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const hand = loadHand(ch.id);
  if (!hand || hand.status !== 'playing') return res.status(400).json({ error: 'No active hand' });
  if (hand.playerCards.length !== 2) return res.status(400).json({ error: 'Can only double on first action' });
  if (ch.cash < hand.bet) return res.status(400).json({ error: 'Need cash to match the bet' });
  ch.cash -= hand.bet;
  hand.bet *= 2;
  hand.playerCards.push(drawCard());
  if (handTotal(hand.playerCards) <= 21) {
    hand.dealerCards = dealerPlay(hand.dealerCards);
  }
  const result = settle(hand.playerCards, hand.dealerCards, hand.bet);
  ch.cash += result.payout;
  hand.status = 'finished';
  hand.result = result.result;
  hand.message = result.message;
  saveHand(ch.id, hand);
  writeLog(ch.id, 'casino', `Blackjack double: ${hand.message}${result.payout ? ` (+£${result.payout.toLocaleString()})` : ''}.`);
  saveCharacter(ch);
  res.json({ ok: true, hand: publicHand(hand), character: publicCharacter(ch) });
});

export default router;
