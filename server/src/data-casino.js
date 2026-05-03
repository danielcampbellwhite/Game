// Roulette — European single-zero wheel.
// Red set is the classic European/American wheel.
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function rouletteColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// Each bet kind returns this multiplier × stake (incl. stake) on win.
export const ROULETTE_PAYOUTS = {
  red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2,
  dozen1: 3, dozen2: 3, dozen3: 3,
  number: 36,
};

// Slots — 3 reels, weighted symbols, three-of-a-kind payouts only.
export const SLOT_SYMBOLS = [
  { id: 'cherry', emoji: '', weight: 30, mul: 5    },
  { id: 'lemon',  emoji: '', weight: 25, mul: 8    },
  { id: 'orange', emoji: '', weight: 20, mul: 12   },
  { id: 'grape',  emoji: '', weight: 15, mul: 25   },
  { id: 'bell',   emoji: '', weight: 8,  mul: 75   },
  { id: 'seven',  emoji: '7️⃣', weight: 2,  mul: 250  },
];
const SLOT_TOTAL = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);

export function rollSlot() {
  let r = Math.random() * SLOT_TOTAL;
  for (const s of SLOT_SYMBOLS) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SLOT_SYMBOLS[0];
}
