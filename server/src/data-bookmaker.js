// Templates that generate random betting events for the bookmaker.
// Each generator returns { sport, name, description, outcomes, durationMs }
// where outcomes is [{ id, name, prob, odds }].
//
// `prob` is the TRUE probability used at resolution (server-only).
// `odds` is the displayed payout multiplier (with house margin baked in).
// Sum of (1/odds) across outcomes ≈ 1.08 — bookmaker keeps ~8% as edge.

const FOOTBALL_TEAMS = [
  'Manchester United', 'Liverpool', 'Real Madrid', 'Bayern Munich',
  'Barcelona', 'Juventus', 'PSG', 'Chelsea', 'Arsenal', 'Inter Milan',
  'Atlético Madrid', 'AC Milan', 'Borussia Dortmund', 'Tottenham',
  'Manchester City', 'Ajax', 'Porto', 'Benfica', 'Napoli', 'Roma',
];

const BOXERS = [
  '"Iron" Mike Travers',     '"Lightning" Marcus Reed',
  '"The Hammer" Jake Diaz',  '"Phantom" Eddie Cole',
  'Big Joe Malone',          'Sean "The Wraith" O\'Connor',
  'Vladimir "Bear" Petrov',  '"Cobra" Carlos Vega',
  '"The Ghost" Anton Reyes', 'Ruslan "Hammerfist" Volkov',
  '"Mad Dog" Jimmy Pratt',   'Tito "El Rayo" Salazar',
];

const HORSES = [
  'Lightning Bolt', 'Thunder Strike', 'Royal Heritage',
  'Midnight Express', 'Silver Bullet', 'Black Magic',
  'Gold Rush', 'Victory Lane', 'Sea Mist', 'Iron Heart',
  'Cosmic Dancer', 'Northern Star', 'Storm Chaser',
  'Velvet Knight', 'Wildfire', 'Crimson Dawn',
];

const F1_DRIVERS = [
  'Lando Hartley', 'Marcus Volpi', 'Diego Romero', 'Akira Tanaka',
  'Sebastian Voss', 'Jules Belmont', 'Hans Müller', 'Pedro Almeida',
];

function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function generateOdds(rawWeights, marginOverround = 1.08) {
  const sum = rawWeights.reduce((a, b) => a + b, 0);
  const probs = rawWeights.map(w => w / sum);
  const odds = probs.map(p => Math.max(1.05, parseFloat((1 / (p * marginOverround)).toFixed(2))));
  return { probs, odds };
}

function rand(min, max) { return min + Math.random() * (max - min); }

const generators = {
  football: () => {
    const [home, away] = pickN(FOOTBALL_TEAMS, 2);
    // Random strength weights — home/away/draw probabilities
    const weights = [rand(1, 3), rand(1, 3), rand(0.6, 1.4)];
    const { probs, odds } = generateOdds(weights);
    return {
      sport: '⚽ Football',
      name: `${home} vs ${away}`,
      description: 'Premier league fixture. Bet on the result.',
      outcomes: [
        { id: 'home', name: `${home} win`,  prob: probs[0], odds: odds[0] },
        { id: 'away', name: `${away} win`,  prob: probs[1], odds: odds[1] },
        { id: 'draw', name: 'Draw',         prob: probs[2], odds: odds[2] },
      ],
      durationMs: (5 + Math.random() * 10) * 60 * 1000, // 5–15 min
    };
  },

  boxing: () => {
    const [a, b] = pickN(BOXERS, 2);
    const weights = [rand(0.8, 2.4), rand(0.8, 2.4)];
    const { probs, odds } = generateOdds(weights, 1.06);
    return {
      sport: '🥊 Boxing',
      name: `${a} vs ${b}`,
      description: '12-round championship fight.',
      outcomes: [
        { id: 'a', name: `${a} wins`, prob: probs[0], odds: odds[0] },
        { id: 'b', name: `${b} wins`, prob: probs[1], odds: odds[1] },
      ],
      durationMs: (3 + Math.random() * 7) * 60 * 1000, // 3–10 min
    };
  },

  horserace: () => {
    const horses = pickN(HORSES, 6);
    const weights = horses.map(() => rand(0.3, 2.5));
    const { probs, odds } = generateOdds(weights, 1.12);
    return {
      sport: '🐎 Horse Racing',
      name: `${horses[0].split(' ').slice(-1)[0]} Stakes`,
      description: '6-horse field at Ascot.',
      outcomes: horses.map((h, i) => ({
        id: `h${i}`, name: h, prob: probs[i], odds: odds[i],
      })),
      durationMs: (2 + Math.random() * 6) * 60 * 1000, // 2–8 min
    };
  },

  f1: () => {
    const drivers = pickN(F1_DRIVERS, 5);
    const weights = drivers.map(() => rand(0.5, 2.0));
    const { probs, odds } = generateOdds(weights, 1.10);
    return {
      sport: '🏁 Formula 1',
      name: `Grand Prix — ${pickN(['Monaco','Silverstone','Monza','Spa','Suzuka'], 1)[0]}`,
      description: 'Race winner — top 5 contenders.',
      outcomes: drivers.map((d, i) => ({
        id: `d${i}`, name: d, prob: probs[i], odds: odds[i],
      })),
      durationMs: (4 + Math.random() * 8) * 60 * 1000, // 4–12 min
    };
  },
};

const SPORT_KEYS = Object.keys(generators);

export function generateEvent() {
  const key = SPORT_KEYS[Math.floor(Math.random() * SPORT_KEYS.length)];
  return generators[key]();
}

// Resolve an event: pick a winning outcome based on stored true probabilities.
export function pickWinner(outcomes) {
  const r = Math.random();
  let acc = 0;
  for (const o of outcomes) {
    acc += o.prob;
    if (r <= acc) return o.id;
  }
  return outcomes[outcomes.length - 1].id;
}
