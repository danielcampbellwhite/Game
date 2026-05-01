// Simplified single-deck blackjack:
//  - Dealer hits on soft 17
//  - Blackjack pays 3:2
//  - Player can hit / stand / double (no split)
//  - One active hand per character; deal again to start fresh

const SUITS = ['♠','♥','♦','♣'];

export function drawCard() {
  return {
    rank: 1 + Math.floor(Math.random() * 13),  // 1=A, 11=J, 12=Q, 13=K
    suit: SUITS[Math.floor(Math.random() * 4)],
  };
}

export function cardLabel(c) {
  const ranks = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  return `${ranks[c.rank] || c.rank}${c.suit}`;
}

function cardValue(c) {
  if (c.rank === 1) return 11;
  if (c.rank > 10) return 10;
  return c.rank;
}

export function handTotal(cards) {
  let total = cards.reduce((a, c) => a + cardValue(c), 0);
  let aces = cards.filter(c => c.rank === 1).length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export function isBlackjack(cards) {
  return cards.length === 2 && handTotal(cards) === 21;
}

export function dealerPlay(dealer) {
  const cards = [...dealer];
  while (handTotal(cards) < 17) cards.push(drawCard());
  return cards;
}

// Returns { result, payout, message }. payout = total $ returned to player
// (so on a 1:1 win with a £100 bet, payout is £200). On loss, payout is 0.
// On push, payout is the original bet.
export function settle(playerCards, dealerCards, bet) {
  const pTotal = handTotal(playerCards);
  const dTotal = handTotal(dealerCards);
  const pBJ = isBlackjack(playerCards);
  const dBJ = isBlackjack(dealerCards);

  if (pTotal > 21)   return { result: 'lost',      payout: 0,                      message: `Bust at ${pTotal}` };
  if (dTotal > 21)   return { result: 'won',       payout: bet * 2,                message: `Dealer busts at ${dTotal}` };
  if (pBJ && !dBJ)   return { result: 'blackjack', payout: Math.floor(bet * 2.5),  message: 'Blackjack!' };
  if (dBJ && !pBJ)   return { result: 'lost',      payout: 0,                      message: 'Dealer blackjack' };
  if (pTotal > dTotal) return { result: 'won',     payout: bet * 2,                message: `${pTotal} beats ${dTotal}` };
  if (pTotal < dTotal) return { result: 'lost',    payout: 0,                      message: `${dTotal} beats ${pTotal}` };
  return { result: 'push', payout: bet, message: `Push at ${pTotal}` };
}
