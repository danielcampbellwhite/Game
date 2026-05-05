// All static game content lives here so designers can tune balance in one file.

export { VEHICLES, VEHICLE_BY_ID, VEHICLES_BY_TIER, TIER_NAMES, tierEmoji, rollVehicleFromTier } from './data-vehicles.js';
import { VEHICLE_BY_ID } from './data-vehicles.js';
export const vehicleById = id => VEHICLE_BY_ID[id];

// Curated 14-city roster — top picks across the major regions.
// Reduced from 34 in 2026-05; the migration in db.js remaps any data
// rows still pointing at culled cities to their nearest replacement.
// Property catalogue entries for dropped cities are intentionally left
// in PROPERTIES below — they're unreachable now (their `city` field
// won't match any current city) and harmless.
export const CITIES = [
  //  Americas 
  { id: 'new_york',    name: 'New York',     emoji: '', drugMul: 1.10, businessMul: 1.20, flightBase: 1500 },
  { id: 'los_angeles', name: 'Los Angeles',  emoji: '', drugMul: 1.20, businessMul: 1.25, flightBase: 1600 },
  { id: 'miami',       name: 'Miami',        emoji: '', drugMul: 1.15, businessMul: 1.10, flightBase: 1200 },
  { id: 'kingston',    name: 'Kingston',     emoji: '', drugMul: 0.85, businessMul: 0.80, flightBase: 1700 },
  { id: 'rio',         name: 'Rio',          emoji: '', drugMul: 0.80, businessMul: 0.85, flightBase: 1800 },
  //  Europe 
  { id: 'london',      name: 'London',       emoji: '', drugMul: 1.05, businessMul: 1.15, flightBase: 1400 },
  { id: 'paris',       name: 'Paris',        emoji: '', drugMul: 1.00, businessMul: 1.10, flightBase: 1400 },
  { id: 'berlin',      name: 'Berlin',       emoji: '', drugMul: 0.95, businessMul: 1.00, flightBase: 1500 },
  { id: 'moscow',      name: 'Moscow',       emoji: '', drugMul: 0.90, businessMul: 0.95, flightBase: 2000 },
  //  Middle East 
  { id: 'dubai',       name: 'Dubai',        emoji: '', drugMul: 1.40, businessMul: 1.50, flightBase: 2800 },
  //  Asia 
  { id: 'tokyo',       name: 'Tokyo',        emoji: '', drugMul: 1.25, businessMul: 1.30, flightBase: 2200 },
  { id: 'hong_kong',   name: 'Hong Kong',    emoji: '', drugMul: 1.30, businessMul: 1.35, flightBase: 2400 },
  //  Oceania 
  { id: 'sydney',      name: 'Sydney',       emoji: '', drugMul: 1.20, businessMul: 1.05, flightBase: 2600 },
  //  Africa 
  { id: 'cape_town',   name: 'Cape Town',    emoji: '', drugMul: 0.75, businessMul: 0.80, flightBase: 2100 },
];

// Drivable land routes between cities — undirected edges with a
// rough real-world km distance. Pairs not listed here are water-locked
// (or so far apart by road that nobody would drive). The graph is
// disjoint by design: islands like Tokyo, Sydney, Kingston, Cape Town
// and Rio have no edges and can only be reached by flight.
export const LAND_EDGES = [
  // US triangle
  { a: 'new_york',    b: 'los_angeles', km: 4500 },
  { a: 'new_york',    b: 'miami',       km: 2100 },
  { a: 'los_angeles', b: 'miami',       km: 4400 },
  // Eurasian chain
  { a: 'london',      b: 'paris',       km: 470  }, // via Channel Tunnel
  { a: 'paris',       b: 'berlin',      km: 1050 },
  { a: 'berlin',      b: 'moscow',      km: 1800 },
  { a: 'moscow',      b: 'dubai',       km: 3500 }, // via Iran
  { a: 'moscow',      b: 'hong_kong',   km: 7300 }, // via China
];

// Adjacency map: city -> [{ to, km }]
const _ADJ = {};
for (const e of LAND_EDGES) {
  (_ADJ[e.a] = _ADJ[e.a] || []).push({ to: e.b, km: e.km });
  (_ADJ[e.b] = _ADJ[e.b] || []).push({ to: e.a, km: e.km });
}

// Dijkstra over LAND_EDGES. Returns the total km between two cities
// via the shortest road path, or null if there's no path (e.g. the
// destination is on a different continent / island).
export function landDistanceBetween(from, to) {
  if (!from || !to || from === to) return null;
  const dist = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    queue.sort((a, b) => dist[a] - dist[b]);
    const cur = queue.shift();
    if (cur === to) return dist[to];
    for (const { to: nbr, km } of (_ADJ[cur] || [])) {
      const alt = dist[cur] + km;
      if (alt < (dist[nbr] ?? Infinity)) {
        dist[nbr] = alt;
        if (!queue.includes(nbr)) queue.push(nbr);
      }
    }
  }
  return null;
}

// Returns the list of cities reachable by road from `from`, with their
// km distance. Excludes the origin itself. Used to populate the drive
// picker in /api/travel.
export function landReachableFrom(from) {
  if (!_ADJ[from]) return [];
  const reachable = [];
  for (const c of CITIES) {
    if (c.id === from) continue;
    const km = landDistanceBetween(from, c.id);
    if (km != null) reachable.push({ city: c.id, name: c.name, km });
  }
  return reachable.sort((a, b) => a.km - b.km);
}

// Serious / criminal / mysterious. Suits, silhouettes, sterner faces — no
// smileys, astronauts, rockstars, etc.
export const AVATARS = ['', '', '', '', '', '', '', '', '', '', '', ''];

// Factions — picked at character creation, locked for the life of the
// character. Identity drives future systems: turf control, member-only
// crimes, faction-vs-faction wars over locations within cities.
//
// `palette` keys map to the custom Tailwind colours in tailwind.config.js
// (gold/blood/money) so badges/borders stay consistent across the UI.
export const FACTIONS = [
  {
    id: 'fraudster',
    name: 'Fraudster',
    blurb: 'Sophisticated grifters. Brain over brawn — paper crimes, social engineering, long cons.',
    palette: 'gold',
    perks: {
      stats: { intelligence: 5, strength: -2 },
      cash: 10000,
      items: [{ kind: 'misc', item_id: 'burner_phone', qty: 2 }],
      pros: ['+5 Intelligence', '+£10,000 starting cash', '2× Burner Phone'],
      cons: ['-2 Strength'],
    },
  },
  {
    id: 'mafia',
    name: 'Mafia',
    blurb: 'Old-world crime families. Loyalty, honour, and a reputation that opens doors and breaks legs.',
    palette: 'blood',
    perks: {
      stats: { strength: 3, defence: 2, intelligence: -3 },
      cash: 3000,
      equip_weapon: 'switchblade',
      items: [{ kind: 'weapon', item_id: 'switchblade', qty: 1 }],
      pros: ['+3 Strength', '+2 Defence', 'Switchblade equipped'],
      cons: ['-3 Intelligence'],
    },
  },
  {
    id: 'cartel',
    name: 'Cartel',
    blurb: 'Latin American syndicates. Volume, distribution, and ruthless control of supply lines.',
    palette: 'money',
    perks: {
      stats: { strength: 2, speed: 2, defence: -2 },
      dirty_cash: 5000,
      items: [{ kind: 'drug', item_id: 'weed', qty: 50 }],
      pros: ['+2 Strength', '+2 Speed', '+£5,000 dirty cash', '50× Weed'],
      cons: ['-2 Defence'],
    },
  },
];

export const factionById = id => FACTIONS.find(f => f.id === id) || null;
export const FACTION_IDS = FACTIONS.map(f => f.id);

// Gender — picked at creation, locked thereafter. Display-only; doesn't
// affect mechanics today. Two-option set; expand here if you ever want
// non-binary / unspecified.
export const GENDERS = ['male', 'female'];

// Territories — named locations inside cities that aligned gangs fight
// to control. Three locations per city, each with a distinct bonus.
//
// Bonus shape: { type, pct } where type ∈ { 'crime_cash', 'gambling',
// 'business' } and pct is the multiplier delta (0.05 = +5%). Held by a
// faction → applies to every faction member operating in that city.
//
// Stacking: hold multiple locations of the same type in a city → the
// pcts sum (so all-three Crime locations would be +15% if we ever add
// duplicates; today each city has one of each type).
//
// Faction-wide aggregate (see services/territories.js): faction global
// crime-cash multiplier scales with the unique cities they hold at
// least one location in.
const TERR = (id, city, name, blurb, type, pct) => ({ id, city, name, blurb, bonus: { type, pct } });

export const TERRITORIES = [
  // ── New York ───────────────────────────────────────────────────────
  TERR('ny_docks',    'new_york',    'The East River Docks',     'Container ships, longshoremen, and very flexible customs paperwork.',     'crime_cash', 0.05),
  TERR('ny_strip',    'new_york',    'Atlantic City Strip',      'Casinos and the limos that ferry whales between them.',                   'gambling',   0.05),
  TERR('ny_wallst',   'new_york',    'Wall Street Penthouses',   'Fronts, fixers, and a discreet line into every brokerage.',               'business',   0.05),
  // ── Los Angeles ────────────────────────────────────────────────────
  TERR('la_studio',   'los_angeles', 'The Studio Backlot',       'Film backlot doubling as a wholly legitimate cash-laundering venue.',     'crime_cash', 0.05),
  TERR('la_sunset',   'los_angeles', 'Sunset Strip Casinos',     'Pool parties, baccarat tables, and quiet rooms upstairs.',                'gambling',   0.05),
  TERR('la_beverly',  'los_angeles', 'Beverly Hills Offices',    'Boutique law firms, talent agencies, and shell-company HQs.',             'business',   0.05),
  // ── Miami ──────────────────────────────────────────────────────────
  TERR('mia_marina',  'miami',       'South Beach Marina',       'Yachts in, product out. The water doesn\'t ask questions.',               'crime_cash', 0.05),
  TERR('mia_collins', 'miami',       'Collins Avenue Casinos',   'Neon, mojitos, and high-stakes poker until sunrise.',                     'gambling',   0.05),
  TERR('mia_brickell','miami',       'Brickell Skyscrapers',     'Banks, condos, and a perfect view of the offshore lanes.',                'business',   0.05),
  // ── Kingston ───────────────────────────────────────────────────────
  TERR('kgn_yard',    'kingston',    'Trench Town Yard',         'Where the dub plates spin and the herb moves at volume.',                 'crime_cash', 0.05),
  TERR('kgn_strip',   'kingston',    'Half Way Tree Bookies',    'Reggae bass and roulette wheels in equal measure.',                       'gambling',   0.05),
  TERR('kgn_newkings','kingston',    'New Kingston Towers',      'High-rise hotels and the import-export agencies that prop them up.',      'business',   0.05),
  // ── Rio ────────────────────────────────────────────────────────────
  TERR('rio_rocinha', 'rio',         'Rocinha Rooftops',         'Highest favela in the city — every line of sight is a checkpoint.',       'crime_cash', 0.05),
  TERR('rio_copa',    'rio',         'Copacabana Casinos',       'Beachfront slots and the tourists who can\'t look away.',                 'gambling',   0.05),
  TERR('rio_centro',  'rio',         'Centro Office Towers',     'Skyscrapers full of registered fronts and unregistered owners.',          'business',   0.05),
  // ── London ─────────────────────────────────────────────────────────
  TERR('ldn_docks',   'london',      'Canary Wharf Docks',       'Old wharves, new buildings — both moving cash unseen.',                   'crime_cash', 0.05),
  TERR('ldn_mayfair', 'london',      'Mayfair Members\' Clubs',  'High-stakes poker rooms behind doors that won\'t open for you.',          'gambling',   0.05),
  TERR('ldn_square',  'london',      'The Square Mile',          'Banks, courts, and a quiet line into every City brokerage.',              'business',   0.05),
  // ── Paris ──────────────────────────────────────────────────────────
  TERR('par_pigalle', 'paris',       'Pigalle Backstreets',      'Showgirls on the strip, fences in the alleys behind them.',               'crime_cash', 0.05),
  TERR('par_casino',  'paris',       'Le Casino du Palais',      'Belle Époque tables and very modern money behind them.',                  'gambling',   0.05),
  TERR('par_opera',   'paris',       'The Opera District',       'Art auctions on top, fence networks below.',                              'business',   0.05),
  // ── Berlin ─────────────────────────────────────────────────────────
  TERR('ber_depot',   'berlin',      'Warschauer Depot',         'Converted rail depot — techno raves on top, quiet pickups underneath.',   'crime_cash', 0.05),
  TERR('ber_kudamm',  'berlin',      'Kurfürstendamm Casinos',   'Cold marble, colder dealers. Plenty of money to launder.',                'gambling',   0.05),
  TERR('ber_mitte',   'berlin',      'Mitte Office District',    'Glass towers, lawyers in dark suits, holding companies stacked deep.',    'business',   0.05),
  // ── Moscow ─────────────────────────────────────────────────────────
  TERR('msk_kremlin', 'moscow',      'Kremlin Quarter',          'Adjacent to power, adjacent to wealth, adjacent to the bratva basement.', 'crime_cash', 0.05),
  TERR('msk_arbat',   'moscow',      'New Arbat Casinos',        'Glass facades hiding very old card games.',                               'gambling',   0.05),
  TERR('msk_moscow_city','moscow',   'Moscow City Towers',       'Neo-soviet skyline housing oligarch holding companies.',                  'business',   0.05),
  // ── Dubai ──────────────────────────────────────────────────────────
  TERR('dxb_souk',    'dubai',       'The Gold Souk',            'Where dirty cash becomes 24-carat receipts.',                             'crime_cash', 0.05),
  TERR('dxb_atlantis','dubai',       'Atlantis Casinos',         'Underwater rooms and overground stakes.',                                 'gambling',   0.05),
  TERR('dxb_difc',    'dubai',       'DIFC Towers',              'The Financial Centre. Where old families park their new money.',          'business',   0.05),
  // ── Tokyo ──────────────────────────────────────────────────────────
  TERR('tok_shibuya', 'tokyo',       'Shibuya Backstreets',      'The yakuza\'s home turf. Bright lights, darker alleys.',                  'crime_cash', 0.05),
  TERR('tok_kabuki',  'tokyo',       'Kabukichō Pachinko',       'Three thousand machines and a money-laundering pipeline behind every wall.','gambling', 0.05),
  TERR('tok_marunouchi','tokyo',     'Marunouchi District',      'Banks, conglomerates, and the boardrooms above them.',                    'business',   0.05),
  // ── Hong Kong ──────────────────────────────────────────────────────
  TERR('hk_wharf',    'hong_kong',   'Victoria Wharf',           'Container terminal at midnight. Triads run the cranes.',                  'crime_cash', 0.05),
  TERR('hk_jockey',   'hong_kong',   'Happy Valley Track',       'Horseraces, casinos in the suites, and ledgers nobody can read.',         'gambling',   0.05),
  TERR('hk_central',  'hong_kong',   'Central Skyscrapers',      'Concentrated wealth — banks stacked vertically into the clouds.',         'business',   0.05),
  // ── Sydney ─────────────────────────────────────────────────────────
  TERR('syd_harbour', 'sydney',      'Darling Harbour Pier',     'Sun, salt, and serious money flowing through the night clubs.',           'crime_cash', 0.05),
  TERR('syd_star',    'sydney',      'The Star Casino',          'Harbourside high-rollers and a back-of-house that\'s always busy.',       'gambling',   0.05),
  TERR('syd_cbd',     'sydney',      'Sydney CBD Towers',        'Mining money, harbour-view boardrooms, and the lawyers who know all of it.','business', 0.05),
  // ── Cape Town ──────────────────────────────────────────────────────
  TERR('cpt_waterfront','cape_town', 'Atlantic Waterfront',      'Tourists by day, smugglers by night. The harbour pays both.',             'crime_cash', 0.05),
  TERR('cpt_grand',   'cape_town',   'GrandWest Casino',         'Locals hit the slots, foreigners hit the high-roller rooms.',             'gambling',   0.05),
  TERR('cpt_century', 'cape_town',   'Century City Offices',     'Trade with Africa runs through here. So does the cash to back it.',       'business',   0.05),
];

export const territoryById = id => TERRITORIES.find(t => t.id === id) || null;
export const territoriesInCity = city => TERRITORIES.filter(t => t.city === city);

// ── Starter packages ──────────────────────────────────────────────
//
// Brand-new characters get a one-time STARTER_BUDGET to spend across
// three picks — a car, a house in their starting city, and a small
// business. Curated catalogues below restrict the choices to entry-
// tier items so nobody starts with a hyperexotic or a luxury hotel.
//
// All three picks are required and the total must not exceed the
// budget. Server-side validation in routes/character.js is the source
// of truth; the client mirrors the catalogues for the picker UI via
// /api/character/options.
export const STARTER_BUDGET = 100_000;

// Curated starter car catalogue. Spans cheap tier-1 beaters through
// mid-tier sedans up to a few tier-3 hot hatches so the priciest pick
// would bust the £100k starter budget once paired with a house and a
// business — picking the top of every category isn't possible.
export const STARTER_CAR_IDS = [
  // Tier 1 — beaters
  'ford_fiesta', 'toyota_yaris', 'chevy_spark',
  'kia_rio',     'nissan_versa', 'honda_fit',
  // Tier 2 — daily drivers
  'ford_focus',  'vw_golf',      'honda_accord', 'mazda_6',
  // Tier 3 — performance bargains
  'mazda_mx5',   'vw_gti',       'civic_type_r',
];

// Cheapest businesses by baseCost. Level gates skipped for the
// starter pick — it's a one-shot allowance, not a discovery shop.
export const STARTER_BUSINESS_IDS = [
  'cafe', 'car_wash', 'diner', 'pawn_shop',
];

export function starterCars() {
  return STARTER_CAR_IDS
    .map(id => {
      const v = vehicleById(id);
      return v ? { id, name: `${v.maker} ${v.name}`, price: v.bookPrice, tier: v.tier } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.price - b.price);
}

// Cheapest tier-1 properties in the chosen starting city, capped at 4.
// Player must own a property in their starting city so the bonus
// applies where they live.
export function starterHousesForCity(city) {
  return PROPERTIES
    .filter(p => p.city === city && p.tier === 1)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 4)
    .map(p => ({ id: p.id, name: p.name, address: p.address || null, price: p.cost }));
}

export function starterBusinesses() {
  return STARTER_BUSINESS_IDS
    .map(id => {
      const b = BUSINESSES.find(x => x.id === id);
      return b ? { id, name: b.name, price: b.baseCost, illegal: !!b.illegal } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.price - b.price);
}

// Crimes — energy/nerve cost, level gate, success base, payout range, xp
export const CRIMES = [
  //  Street crimes 
  { id: 'pickpocket',     name: 'Pickpocket',           tier: 'street', energy: 1, nerve: 0, level: 1,  base: 75, min: 20,    max: 80,    xp: 4,   risk: 'tiny' },
  { id: 'shoplift',       name: 'Shoplift',             tier: 'street', energy: 2, nerve: 0, level: 1,  base: 70, min: 50,    max: 200,   xp: 6,   risk: 'tiny' },
  { id: 'snatch_grab',    name: 'Phone Snatch',         tier: 'street', energy: 1, nerve: 0, level: 2,  base: 72, min: 40,    max: 180,   xp: 6,   risk: 'tiny' },
  { id: 'bike_theft',     name: 'Steal a Pushbike',     tier: 'street', energy: 2, nerve: 0, level: 2,  base: 68, min: 60,    max: 250,   xp: 8,   risk: 'tiny' },
  { id: 'mugging',        name: 'Mugging',              tier: 'street', energy: 4, nerve: 0, level: 4,  base: 60, min: 200,   max: 800,   xp: 12,  risk: 'low'  },
  { id: 'atm_skim',       name: 'ATM Skim',             tier: 'street', energy: 4, nerve: 0, level: 4,  base: 55, min: 280,   max: 1100,  xp: 14,  risk: 'low',  intelBonus: 0.8,
    requires: [{ kind: 'misc', item_id: 'atm_skimmer', qty: 1, consumed: true }] },
  { id: 'cat_converter',  name: 'Cat Converter Theft',  tier: 'street', energy: 4, nerve: 0, level: 5,  base: 60, min: 250,   max: 950,   xp: 14,  risk: 'low'  },
  { id: 'scam',           name: 'Online Scam',          tier: 'street', energy: 3, nerve: 0, level: 5,  base: 50, min: 400,   max: 1800,  xp: 18,  risk: 'low',  intelBonus: 1.0 },
  { id: 'breakin',        name: 'House Break-In',       tier: 'street', energy: 5, nerve: 0, level: 6,  base: 55, min: 600,   max: 2200,  xp: 20,  risk: 'low'  },
  { id: 'loan_collect',   name: 'Loan Shark Collection',tier: 'street', energy: 5, nerve: 0, level: 8,  base: 65, min: 450,   max: 1800,  xp: 22,  risk: 'low'  },
  { id: 'store_holdup',   name: 'Convenience Holdup',   tier: 'street', energy: 6, nerve: 0, level: 9,  base: 55, min: 700,   max: 2800,  xp: 28,  risk: 'med'  },

  //  Cybercrime — intelligence-driven, lower energy, scales hard 
  { id: 'phishing',       name: 'Email Phishing',       tier: 'cyber',  energy: 2, nerve: 0, level: 5,  base: 50, min: 220,   max: 850,    xp: 16,  risk: 'low',  intelBonus: 1.0 },
  { id: 'social_eng',     name: 'Social Engineering',   tier: 'cyber',  energy: 4, nerve: 0, level: 8,  base: 55, min: 600,   max: 2200,   xp: 32,  risk: 'low',  intelBonus: 1.2 },
  { id: 'card_fraud',     name: 'Stolen Card Fraud',    tier: 'cyber',  energy: 4, nerve: 0, level: 12, base: 50, min: 1600,  max: 5800,   xp: 65,  risk: 'low',  intelBonus: 1.0, dirty: true },
  { id: 'darkweb',        name: 'Dark Web Fraud Ring',  tier: 'cyber',  energy: 6, nerve: 0, level: 16, base: 50, min: 4500,  max: 16000,  xp: 140, risk: 'med',  intelBonus: 1.3, dirty: true },
  { id: 'ransomware',     name: 'Ransomware Drop',      tier: 'cyber',  energy: 8, nerve: 0, level: 22, base: 45, min: 8000,  max: 30000,  xp: 290, risk: 'med',  intelBonus: 1.4, dirty: true, cooldownSec: 3600   /* 1h */ },
  { id: 'crypto_drain',   name: 'Crypto Wallet Drain',  tier: 'cyber',  energy: 9, nerve: 0, level: 30, base: 45, min: 18000, max: 60000,  xp: 620, risk: 'high', intelBonus: 1.5, dirty: true, cooldownSec: 7200   /* 2h */ },
  { id: 'ddos_ext',       name: 'DDoS Extortion',       tier: 'cyber',  energy: 11, nerve: 0, level: 38, base: 40, min: 40000, max: 130000, xp: 1100,risk: 'high', intelBonus: 1.4, dirty: true, cooldownSec: 14400  /* 4h */ },

  { id: 'jewellery',      name: 'Jewellery Heist',      tier: 'major',  energy: 12, nerve: 0, level: 20, base: 40, min: 12000, max: 35000,  xp: 220, risk: 'high', cooldownSec: 3600  /* 1h */ },
  { id: 'bank_rob',     name: 'Bank Robbery',        tier: 'major', energy: 16, nerve: 0, level: 25, base: 35, min: 22000,  max: 70000,  xp: 380, risk: 'high',                    cooldownSec: 7200  /* 2h */ },
  { id: 'smuggle',      name: 'Smuggling Run',       tier: 'major', energy: 14, nerve: 0, level: 28, base: 45, min: 18000,  max: 55000,  xp: 320, risk: 'high', dirty: true,        cooldownSec: 9000  /* 2.5h */ },
  { id: 'art_heist',    name: 'Art Gallery Heist',   tier: 'major', energy: 19, nerve: 0, level: 35, base: 38, min: 35000,  max: 130000, xp: 600, risk: 'high', intelBonus: 1.2,    cooldownSec: 14400 /* 4h */ },
  { id: 'casino_score', name: 'Casino Score',        tier: 'major', energy: 23, nerve: 0, level: 45, base: 32, min: 60000,  max: 220000, xp: 950, risk: 'extreme',                  cooldownSec: 28800 /* 8h */ },
  { id: 'cargo_hijack', name: 'Cargo Ship Hijack',   tier: 'major', energy: 26, nerve: 0, level: 55, base: 30, min: 140000, max: 450000, xp: 1500, risk: 'extreme', dirty: true,    cooldownSec: 36000 /* 10h */ },
  { id: 'cyber_bank',   name: 'Crypto Exchange Hack',tier: 'major', energy: 30, nerve: 0, level: 65, base: 28, min: 250000, max: 900000, xp: 2400, risk: 'extreme', intelBonus: 1.0, dirty: true, cooldownSec: 43200 /* 12h */ },

  // GTA — Grand Theft Auto. On success: a vehicle from the matched tier
  // lands in your garage. No cash payout — the car IS the prize. Fail
  // outcomes use the standard risk table (jail / hospital / escape).
  { id: 'gta_beater',   name: 'Hotwire a Beater',     tier: 'gta', energy: 5, nerve: 0,  level: 3,  base: 70, vehicleTier: 1, xp: 18,   risk: 'low' },
  { id: 'gta_compact',  name: 'Steal a Sedan',        tier: 'gta', energy: 7, nerve: 0,  level: 8,  base: 60, vehicleTier: 2, xp: 50,   risk: 'low' },
  { id: 'gta_hothatch', name: 'Carjack a Hot Hatch',  tier: 'gta', energy: 10, nerve: 0,  level: 14, base: 55, vehicleTier: 3, xp: 110,  risk: 'med' },
  { id: 'gta_premium',  name: 'Snatch a Premium',     tier: 'gta', energy: 13, nerve: 0,  level: 22, base: 50, vehicleTier: 4, xp: 240,  risk: 'med' },
  { id: 'gta_luxury',   name: 'Valet Grab',           tier: 'gta', energy: 18, nerve: 0,  level: 32, base: 45, vehicleTier: 5, xp: 520,  risk: 'high',     cooldownSec: 5400  /* 1.5h */ },
  { id: 'gta_exotic',   name: 'Showroom Heist',       tier: 'gta', energy: 25, nerve: 0,  level: 45, base: 38, vehicleTier: 6, xp: 1200, risk: 'high',     cooldownSec: 14400 /* 4h */ },
  { id: 'gta_hyper',    name: 'Midnight Run',         tier: 'gta', energy: 32, nerve: 0, level: 60, base: 32, vehicleTier: 7, xp: 2400, risk: 'extreme',  cooldownSec: 36000 /* 10h */ },
];

export const DRUGS = [
  { id: 'weed',    name: 'Weed',    base: 100,    levelGate: 1  },
  { id: 'mdma',    name: 'MDMA',    base: 350,    levelGate: 8  },
  { id: 'cocaine', name: 'Cocaine', base: 1200,   levelGate: 12 },
  { id: 'meth',    name: 'Meth',    base: 900,    levelGate: 15 },
  { id: 'heroin',  name: 'Heroin',  base: 2200,   levelGate: 20 },
];

// Real-world weapons grouped by category. The `ammoType` column drives
// the combat ammo check — buy the matching rounds at the gun store.
export const WEAPONS = [
  //  Melee — no ammo 
  { id: 'fists',          name: 'Fists',                                       category: 'melee',    dmg: 4,   level: 1,  cost: 0,      ammoType: null    },
  { id: 'knuckles',       name: 'Brass Knuckles',                              category: 'melee',    dmg: 7,   level: 1,  cost: 80,     ammoType: null    },
  { id: 'switchblade',    name: 'Switchblade',                                 category: 'melee',    dmg: 9,   level: 1,  cost: 160,    ammoType: null    },
  { id: 'knife',          name: 'Combat Knife',                                category: 'melee',    dmg: 10,  level: 1,  cost: 220,    ammoType: null    },
  { id: 'machete',        name: 'Machete',                                     category: 'melee',    dmg: 14,  level: 3,  cost: 480,    ammoType: null    },
  { id: 'bat',            name: 'Baseball Bat',                                category: 'melee',    dmg: 14,  level: 3,  cost: 520,    ammoType: null    },
  { id: 'crowbar',        name: 'Crowbar',                                     category: 'melee',    dmg: 16,  level: 4,  cost: 720,    ammoType: null    },
  { id: 'katana',         name: 'Katana',                                      category: 'melee',    dmg: 22,  level: 8,  cost: 3500,   ammoType: null    },

  //  Pistols — 9mm 
  { id: 'glock_17',       name: 'Glock 17',          maker: 'Glock',           category: 'pistol',   dmg: 18,  level: 6,  cost: 2800,   ammoType: '9mm'   },
  { id: 'beretta_cheetah',name: 'Cheetah 84FS',      maker: 'Beretta',         category: 'pistol',   dmg: 19,  level: 7,  cost: 3500,   ammoType: '9mm'   },
  { id: 'beretta_92fs',   name: '92FS',              maker: 'Beretta',         category: 'pistol',   dmg: 21,  level: 8,  cost: 3900,   ammoType: '9mm'   },
  { id: 'glock_19',       name: 'Glock 19',          maker: 'Glock',           category: 'pistol',   dmg: 21,  level: 8,  cost: 4200,   ammoType: '9mm'   },
  { id: 'sig_p226',       name: 'P226',              maker: 'SIG Sauer',       category: 'pistol',   dmg: 23,  level: 9,  cost: 4800,   ammoType: '9mm'   },
  { id: 'hk_usp9',        name: 'USP 9',             maker: 'Heckler & Koch',  category: 'pistol',   dmg: 24,  level: 10, cost: 5500,   ammoType: '9mm'   },
  //  Pistols — .45 ACP 
  { id: 'colt_1911',      name: 'M1911',             maker: 'Colt',            category: 'pistol',   dmg: 27,  level: 11, cost: 6500,   ammoType: '45acp' },
  { id: 'hk_usp45',       name: 'USP .45',           maker: 'Heckler & Koch',  category: 'pistol',   dmg: 30,  level: 13, cost: 8200,   ammoType: '45acp' },

  //  Revolvers — .357 Magnum 
  { id: 'sw_686',         name: 'Model 686',         maker: 'Smith & Wesson',  category: 'revolver', dmg: 32,  level: 14, cost: 9500,   ammoType: '357'   },
  { id: 'colt_python',    name: 'Python',            maker: 'Colt',            category: 'revolver', dmg: 36,  level: 16, cost: 14000,  ammoType: '357'   },

  //  SMGs — 9mm / .45 ACP 
  { id: 'uzi',            name: 'Uzi',               maker: 'IMI',             category: 'smg',      dmg: 32,  level: 14, cost: 12000,  ammoType: '9mm'   },
  { id: 'mp5',            name: 'MP5A3',             maker: 'Heckler & Koch',  category: 'smg',      dmg: 38,  level: 16, cost: 18000,  ammoType: '9mm'   },
  { id: 'thompson',       name: 'M1A1 Thompson',     maker: 'Auto-Ordnance',   category: 'smg',      dmg: 42,  level: 18, cost: 24000,  ammoType: '45acp' },

  //  Shotguns — 12 gauge 
  { id: 'remington_870',  name: '870 Express',       maker: 'Remington',       category: 'shotgun',  dmg: 38,  level: 16, cost: 18000,  ammoType: 'shells'},
  { id: 'mossberg_500',   name: '500 Tactical',      maker: 'Mossberg',        category: 'shotgun',  dmg: 40,  level: 18, cost: 22000,  ammoType: 'shells'},
  { id: 'benelli_m4',     name: 'M4 Super 90',       maker: 'Benelli',         category: 'shotgun',  dmg: 46,  level: 22, cost: 35000,  ammoType: 'shells'},
  { id: 'spas_12',        name: 'SPAS-12',           maker: 'Franchi',         category: 'shotgun',  dmg: 50,  level: 25, cost: 48000,  ammoType: 'shells'},

  //  Assault Rifles — 5.56mm 
  { id: 'm4a1',           name: 'M4A1',              maker: 'Colt',            category: 'rifle',    dmg: 52,  level: 25, cost: 55000,  ammoType: '556'   },
  { id: 'steyr_aug',      name: 'AUG A3',            maker: 'Steyr',           category: 'rifle',    dmg: 56,  level: 28, cost: 72000,  ammoType: '556'   },
  { id: 'famas',          name: 'FAMAS F1',          maker: 'Nexter',          category: 'rifle',    dmg: 58,  level: 30, cost: 85000,  ammoType: '556'   },
  //  Battle Rifles — 7.62mm 
  { id: 'ak47',           name: 'AK-47',             maker: 'Kalashnikov',     category: 'rifle',    dmg: 62,  level: 32, cost: 75000,  ammoType: '762'   },
  { id: 'akm',            name: 'AKM',               maker: 'Kalashnikov',     category: 'rifle',    dmg: 65,  level: 34, cost: 88000,  ammoType: '762'   },
  { id: 'fn_fal',         name: 'FAL',               maker: 'FN Herstal',      category: 'rifle',    dmg: 72,  level: 38, cost: 120000, ammoType: '762'   },
  { id: 'hk_g3',          name: 'G3A3',              maker: 'Heckler & Koch',  category: 'rifle',    dmg: 75,  level: 40, cost: 140000, ammoType: '762'   },

  //  Sniper Rifles — .308 / .50 cal 
  { id: 'remington_700',  name: '700 Tactical',      maker: 'Remington',       category: 'sniper',   dmg: 82,  level: 45, cost: 200000, ammoType: '308'   },
  { id: 'hk_psg1',        name: 'PSG-1',             maker: 'Heckler & Koch',  category: 'sniper',   dmg: 90,  level: 50, cost: 320000, ammoType: '308'   },
  { id: 'barrett_m82',    name: 'M82A1',             maker: 'Barrett',         category: 'sniper',   dmg: 105, level: 55, cost: 380000, ammoType: '50cal' },
  { id: 'mcmillan_tac50', name: 'TAC-50',            maker: 'McMillan',        category: 'sniper',   dmg: 130, level: 65, cost: 620000, ammoType: '50cal' },

  //  Expansion 
  //  Melee — extra variety 
  { id: 'tire_iron',      name: 'Tire Iron',                                    category: 'melee',    dmg: 11,  level: 2,  cost: 95,     ammoType: null    },
  { id: 'wrench',         name: 'Pipe Wrench',                                  category: 'melee',    dmg: 13,  level: 2,  cost: 180,    ammoType: null    },
  { id: 'taser',          name: 'Stun Baton',                                   category: 'melee',    dmg: 17,  level: 5,  cost: 950,    ammoType: null    },
  { id: 'tomahawk',       name: 'Tomahawk',                                     category: 'melee',    dmg: 19,  level: 7,  cost: 1800,   ammoType: null    },
  { id: 'kukri',          name: 'Kukri',                                        category: 'melee',    dmg: 24,  level: 10, cost: 4200,   ammoType: null    },

  //  Pistols — 9mm continued 
  { id: 'walther_ppk',    name: 'PPK',               maker: 'Walther',         category: 'pistol',   dmg: 17,  level: 5,  cost: 2200,   ammoType: '9mm'   },
  { id: 'cz_75',          name: 'CZ 75 SP-01',       maker: 'CZ',              category: 'pistol',   dmg: 22,  level: 9,  cost: 4500,   ammoType: '9mm'   },
  { id: 'fn_fnx9',        name: 'FNX-9',             maker: 'FN Herstal',      category: 'pistol',   dmg: 25,  level: 11, cost: 6000,   ammoType: '9mm'   },
  //  Pistols — .45 ACP continued 
  { id: 'desert_eagle',   name: 'Desert Eagle',      maker: 'Magnum Research', category: 'pistol',   dmg: 34,  level: 15, cost: 11000,  ammoType: '45acp' },
  { id: 'fn_57',          name: 'Five-seveN',        maker: 'FN Herstal',      category: 'pistol',   dmg: 28,  level: 12, cost: 7400,   ammoType: '45acp' },

  //  Revolvers — extra 
  { id: 'sw_500',         name: 'Model 500',         maker: 'Smith & Wesson',  category: 'revolver', dmg: 42,  level: 19, cost: 18000,  ammoType: '357'   },
  { id: 'ruger_redhawk',  name: 'Redhawk',           maker: 'Ruger',           category: 'revolver', dmg: 38,  level: 17, cost: 15500,  ammoType: '357'   },

  //  SMGs continued 
  { id: 'mac10',          name: 'MAC-10',            maker: 'Cobray',          category: 'smg',      dmg: 30,  level: 12, cost: 9500,   ammoType: '45acp' },
  { id: 'p90',            name: 'P90',               maker: 'FN Herstal',      category: 'smg',      dmg: 44,  level: 20, cost: 28000,  ammoType: '9mm'   },
  { id: 'vector',         name: 'Vector .45',        maker: 'KRISS',           category: 'smg',      dmg: 48,  level: 23, cost: 36000,  ammoType: '45acp' },

  //  Shotguns continued 
  { id: 'sawn_off',       name: 'Sawn-off Double-Barrel',                     category: 'shotgun',  dmg: 36,  level: 12, cost: 9500,   ammoType: 'shells'},
  { id: 'aa12',           name: 'AA-12',             maker: 'Auto Assault',    category: 'shotgun',  dmg: 56,  level: 30, cost: 75000,  ammoType: 'shells'},

  //  Rifles continued 
  { id: 'sig_mcx',        name: 'MCX Spear',         maker: 'SIG Sauer',       category: 'rifle',    dmg: 60,  level: 30, cost: 95000,  ammoType: '556'   },
  { id: 'hk416',          name: 'HK416',             maker: 'Heckler & Koch',  category: 'rifle',    dmg: 64,  level: 33, cost: 105000, ammoType: '556'   },
  { id: 'galil',          name: 'Galil ACE',         maker: 'IWI',             category: 'rifle',    dmg: 68,  level: 35, cost: 95000,  ammoType: '762'   },
  { id: 'sig_716',        name: 'SIG 716i',          maker: 'SIG Sauer',       category: 'rifle',    dmg: 78,  level: 42, cost: 165000, ammoType: '762'   },

  //  Sniper Rifles continued 
  { id: 'awm',            name: 'AWM',               maker: 'Accuracy Int.',   category: 'sniper',   dmg: 95,  level: 52, cost: 380000, ammoType: '308'   },
  { id: 'cheytac_m200',   name: 'M200 Intervention', maker: 'CheyTac',         category: 'sniper',   dmg: 115, level: 58, cost: 480000, ammoType: '50cal' },
  { id: 'barrett_m107',   name: 'M107',              maker: 'Barrett',         category: 'sniper',   dmg: 145, level: 75, cost: 850000, ammoType: '50cal' },
];

export const WEAPON_CATEGORIES = {
  melee:    { name: 'Melee',         emoji: '' },
  pistol:   { name: 'Pistols',       emoji: '' },
  revolver: { name: 'Revolvers',     emoji: '' },
  smg:      { name: 'SMGs',          emoji: '' },
  shotgun:  { name: 'Shotguns',      emoji: '' },
  rifle:    { name: 'Rifles',        emoji: '' },
  sniper:   { name: 'Sniper Rifles', emoji: '' },
};

export const AMMO = [
  { id: '9mm',    name: '9mm Rounds',         cost: 5,   packSize: 30 },
  { id: '45acp',  name: '.45 ACP Rounds',     cost: 8,   packSize: 25 },
  { id: '357',    name: '.357 Magnum Rounds', cost: 14,  packSize: 18 },
  { id: 'shells', name: '12 Gauge Shells',    cost: 12,  packSize: 24 },
  { id: '556',    name: '5.56mm Rounds',      cost: 18,  packSize: 30 },
  { id: '762',    name: '7.62mm Rounds',      cost: 24,  packSize: 30 },
  { id: '308',    name: '.308 Rounds',        cost: 45,  packSize: 20 },
  { id: '50cal',  name: '.50 Cal Rounds',     cost: 80,  packSize: 10 },
];

export const ARMOUR = [
  { id: 'none',     name: 'No Armour',       def: 0,  level: 1,  cost: 0    },
  { id: 'leather',  name: 'Leather Jacket',  def: 6,  level: 3,  cost: 800  },
  { id: 'kevlar',   name: 'Kevlar Vest',     def: 18, level: 12, cost: 12000},
  { id: 'tactical', name: 'Tactical Vest',   def: 32, level: 25, cost: 65000},
  { id: 'composite',name: 'Composite Plate', def: 55, level: 45, cost: 220000},
];

// Business templates. Players "found" a business by picking a template,
// naming it, and tuning sliders. computeBusiness() turns the (template,
// sliders, city) tuple into deterministic cost/hourly/raidChance, so the
// preview the player sees in the founder is exactly what they get.
export const BUSINESSES = [
  //  Legal (clean cash) 
  { id: 'cafe',         name: 'Café',                emoji: '',  illegal: false, baseCost: 25000,   baseHourly: 1100,  levelGate: 1  },
  { id: 'diner',        name: 'Diner',               emoji: '',  illegal: false, baseCost: 60000,   baseHourly: 2000,  levelGate: 5  },
  { id: 'car_wash',     name: 'Car Wash',            emoji: '',  illegal: false, baseCost: 35000,   baseHourly: 1300,  levelGate: 3  },
  { id: 'boutique',     name: 'Boutique',            emoji: '',  illegal: false, baseCost: 110000,  baseHourly: 3000,  levelGate: 10 },
  { id: 'auto_shop',    name: 'Auto Repair Shop',    emoji: '',  illegal: false, baseCost: 140000,  baseHourly: 3600,  levelGate: 12 },
  { id: 'taxi_firm',    name: 'Taxi Firm',           emoji: '',  illegal: false, baseCost: 200000,  baseHourly: 4800,  levelGate: 15 },
  { id: 'nightclub',    name: 'Nightclub',           emoji: '',  illegal: false, baseCost: 380000,  baseHourly: 8500,  levelGate: 22 },
  { id: 'tech_startup', name: 'Tech Startup',        emoji: '',  illegal: false, baseCost: 400000,  baseHourly: 7500,  levelGate: 24 },
  { id: 'real_estate',  name: 'Real Estate Office',  emoji: '',  illegal: false, baseCost: 600000,  baseHourly: 11000, levelGate: 30 },
  { id: 'luxury_hotel', name: 'Luxury Hotel',        emoji: '',  illegal: false, baseCost: 1500000, baseHourly: 25000, levelGate: 42 },
  //  Illegal (dirty cash, raid risk scales with sliders) 
  { id: 'pawn_shop',    name: 'Pawn Shop',           emoji: '',  illegal: true,  baseCost: 70000,   baseHourly: 2400,  levelGate: 6  },
  { id: 'smoke_shop',   name: 'Smoke Shop',          emoji: '',  illegal: true,  baseCost: 100000,  baseHourly: 3000,  levelGate: 9  },
  { id: 'chop_shop',    name: 'Chop Shop',           emoji: '',  illegal: true,  baseCost: 130000,  baseHourly: 4200,  levelGate: 12 },
  { id: 'strip_club',   name: 'Strip Club',          emoji: '',  illegal: true,  baseCost: 280000,  baseHourly: 5800,  levelGate: 18 },
  { id: 'counterfeit',  name: 'Counterfeit Lab',     emoji: '',  illegal: true,  baseCost: 350000,  baseHourly: 7200,  levelGate: 24 },
  { id: 'underground',  name: 'Underground Casino',  emoji: '',  illegal: true,  baseCost: 800000,  baseHourly: 14000, levelGate: 32 },
  // ── Drug producers ────────────────────────────────────────────────
  // baseHourly = 0 — these don't pay cash on collect. Instead the
  // `produces` field tells routes/businesses.js how many drug units
  // to deposit into the player's inventory each hour. Players sell
  // the drugs themselves via the Drugs page in any city of their
  // choice — the trade game is in WHERE they sell, not in production.
  { id: 'weed_farm',    name: 'Weed Farm',           emoji: '',  illegal: true,  baseCost: 180000,  baseHourly: 0, levelGate: 12, produces: { drug: 'weed',    perHour: 10 } },
  { id: 'mdma_lab',     name: 'MDMA Lab',            emoji: '',  illegal: true,  baseCost: 320000,  baseHourly: 0, levelGate: 18, produces: { drug: 'mdma',    perHour: 5  } },
  // drug_lab id kept for backwards-compat with existing rows; renamed
  // to "Meth Lab" and switched to producing meth instead of generic
  // dirty cash.
  { id: 'drug_lab',     name: 'Meth Lab',            emoji: '',  illegal: true,  baseCost: 420000,  baseHourly: 0, levelGate: 26, produces: { drug: 'meth',    perHour: 4  } },
  { id: 'coke_kitchen', name: 'Cocaine Kitchen',     emoji: '',  illegal: true,  baseCost: 900000,  baseHourly: 0, levelGate: 32, produces: { drug: 'cocaine', perHour: 3  } },
  // cartel_lab id kept for backwards-compat. Top-tier producer.
  { id: 'cartel_lab',   name: 'Cartel Operation',    emoji: '',  illegal: true,  baseCost: 1800000, baseHourly: 0, levelGate: 48, produces: { drug: 'heroin',  perHour: 2  } },
];

// Slider scoring. All callers must use this — never compute ad-hoc.
export function computeBusiness(template, scale, risk, quality, city) {
  const cityMul = cityById(city)?.businessMul || 1.0;
  const s = Math.max(1, Math.min(5, scale | 0));
  const r = Math.max(1, Math.min(5, risk | 0));
  const q = Math.max(1, Math.min(5, quality | 0));

  const costFactor = s * (1 + 0.18 * (q - 1));
  const cost = Math.floor(template.baseCost * cityMul * costFactor);

  let hourlyFactor = (0.6 + 0.4 * s) * (0.85 + 0.075 * q);
  if (template.illegal) hourlyFactor *= 1 + 0.18 * (r - 1);
  const hourly = Math.floor(template.baseHourly * cityMul * hourlyFactor);

  // Illegal businesses get raided. Base chance scales by quality:
  // q=1 → 5%, q=5 → 1% (linear). Risk slider amplifies on top: r=1 → 1×,
  // r=5 → 2×. So a max-quality, min-risk shop is 1%; min-quality,
  // max-risk is 10%.
  const baseRaid = 0.05 - 0.04 * ((q - 1) / 4);
  const riskMul = 1 + 0.25 * (r - 1);
  const raidChance = template.illegal ? Math.max(0, baseRaid * riskMul) : 0;

  const upgradeCost = Math.floor(cost * 0.45);

  return { cost, hourly, raidChance, upgradeCost };
}

// Standard tier bonuses — applied by tier so players can compare at a glance.
const PROPERTY_TIER_BONUS = {
  1: { max_energy: 5,  max_nerve: 1,  happiness: 5  }, // walk-up / flat
  2: { max_energy: 12, max_nerve: 2,  happiness: 10 }, // apartment / townhouse
  3: { max_energy: 25, max_nerve: 5,  happiness: 20 }, // mansion / penthouse
  4: { max_energy: 50, max_nerve: 10, happiness: 35 }, // estate / compound
};
// Garage capacity per property tier. Sums across all properties you own
// in a given city to determine how many vehicles can sit there at once.
export const PROPERTY_TIER_GARAGE = {
  1: 2,   // bedsit / walk-up has off-street parking
  2: 4,   // townhouse / apartment block
  3: 8,   // mansion / penthouse
  4: 12,  // estate / compound
};
const TIER_LABEL = { 1: 'Flat', 2: 'Townhouse', 3: 'Mansion', 4: 'Estate' };
const T = (tier) => ({ tier, tierLabel: TIER_LABEL[tier], bonuses: PROPERTY_TIER_BONUS[tier], garage: PROPERTY_TIER_GARAGE[tier] });

// City-locked property catalogue. To buy you must be physically in the city.
// Existing characters may also own legacy generic properties (`flat`, `house`,
// `mansion`, `compound`) — those still work but no longer appear in any
// estate agent's listing (they have no `city` field, so they're filtered out).
export const PROPERTIES = [
  // Legacy fallbacks — kept so already-owned rows resolve via propertyById.
  { id: 'flat',     name: 'Flat',     cost: 30000,   bonuses: PROPERTY_TIER_BONUS[1], garage: PROPERTY_TIER_GARAGE[1] },
  { id: 'house',    name: 'House',    cost: 150000,  bonuses: PROPERTY_TIER_BONUS[2], garage: PROPERTY_TIER_GARAGE[2] },
  { id: 'mansion',  name: 'Mansion',  cost: 800000,  bonuses: PROPERTY_TIER_BONUS[3], garage: PROPERTY_TIER_GARAGE[3] },
  { id: 'compound', name: 'Compound', cost: 5000000, bonuses: PROPERTY_TIER_BONUS[4], garage: PROPERTY_TIER_GARAGE[4] },

  //  New York 
  { id: 'ny_walkup',     city: 'new_york', name: 'Lower East Side Walk-up',  address: '147 Rivington St',     cost: 48000,    ...T(1) },
  { id: 'ny_brownstone', city: 'new_york', name: 'Brooklyn Brownstone',      address: '284 Greene Ave',       cost: 380000,   ...T(2) },
  { id: 'ny_penthouse',  city: 'new_york', name: 'Park Avenue Penthouse',    address: '1041 Park Ave PH-A',   cost: 2400000,  ...T(3) },
  { id: 'ny_hamptons',   city: 'new_york', name: 'Hamptons Beach Estate',    address: '12 Further Lane, East Hampton', cost: 11000000, ...T(4) },

  //  London 
  { id: 'lon_flat',      city: 'london',   name: 'Whitechapel Flat',         address: '36b Vallance Rd',      cost: 52000,    ...T(1) },
  { id: 'lon_mews',      city: 'london',   name: 'Kensington Mews House',    address: '8 Cornwall Mews South', cost: 420000,  ...T(2) },
  { id: 'lon_mayfair',   city: 'london',   name: 'Mayfair Townhouse',        address: '17 Charles St, W1J',   cost: 2800000,  ...T(3) },
  { id: 'lon_kent',      city: 'london',   name: 'Kent Country Estate',      address: 'Greythorne Manor, Sevenoaks', cost: 9000000, ...T(4) },

  //  Tokyo 
  { id: 'tok_capsule',   city: 'tokyo',    name: 'Shinjuku Capsule Studio',  address: '2-14-9 Kabukichō',      cost: 42000,    ...T(1) },
  { id: 'tok_roppongi',  city: 'tokyo',    name: 'Roppongi High-Rise',       address: '6-10-1 Roppongi, Tower 32F', cost: 480000, ...T(2) },
  { id: 'tok_aoyama',    city: 'tokyo',    name: 'Aoyama Modernist Loft',    address: '5-4-44 Minami-Aoyama',  cost: 3200000,  ...T(3) },
  { id: 'tok_hakone',    city: 'tokyo',    name: 'Hakone Mountain Retreat',  address: '1300 Sengokuhara, Hakone', cost: 12000000, ...T(4) },

  //  Dubai 
  { id: 'dxb_studio',    city: 'dubai',    name: 'Deira Studio',             address: 'Al Rigga Rd, Tower 4 #708', cost: 55000,    ...T(1) },
  { id: 'dxb_downtown',  city: 'dubai',    name: 'Downtown High-Rise',       address: 'Sheikh Mohammed Blvd, 1804', cost: 620000,  ...T(2) },
  { id: 'dxb_burj',      city: 'dubai',    name: 'Burj Khalifa Sky Suite',   address: 'Burj Khalifa, Floor 121', cost: 4800000,    ...T(3) },
  { id: 'dxb_palm',      city: 'dubai',    name: 'Palm Jumeirah Villa',      address: 'Frond M, Villa 17',     cost: 15000000, ...T(4) },

  //  Liverpool 
  { id: 'lpl_terrace',   city: 'liverpool',name: 'Toxteth Terrace',          address: '23 Granby St, L8',      cost: 32000,    ...T(1) },
  { id: 'lpl_sefton',    city: 'liverpool',name: 'Sefton Park Manor',        address: '14 Aigburth Drive, L17',cost: 260000,   ...T(2) },
  { id: 'lpl_wirral',    city: 'liverpool',name: 'Wirral Estate',            address: 'Caldy Hall, West Kirby',cost: 1400000,  ...T(3) },
  { id: 'lpl_aigburth',  city: 'liverpool',name: 'Aigburth Compound',        address: 'Mossley Hill Manor',    cost: 5200000,  ...T(4) },

  //  Miami 
  { id: 'mia_bungalow',  city: 'miami',    name: 'Little Havana Bungalow',   address: '1814 SW 8th St',        cost: 42000,    ...T(1) },
  { id: 'mia_southbeach',city: 'miami',    name: 'South Beach Condo',        address: '450 Ocean Dr, #1102',   cost: 360000,   ...T(2) },
  { id: 'mia_coral',     city: 'miami',    name: 'Coral Gables Spanish',     address: '4801 Granada Blvd',     cost: 2200000,  ...T(3) },
  { id: 'mia_starisland',city: 'miami',    name: 'Star Island Mansion',      address: '46 Star Island Dr',     cost: 13000000, ...T(4) },

  //  Paris 
  { id: 'par_studio',    city: 'paris',    name: 'Bastille Studio',          address: '7 Rue de Lappe, 75011', cost: 50000,    ...T(1) },
  { id: 'par_marais',    city: 'paris',    name: 'Le Marais Apartment',      address: '24 Rue des Rosiers, 75004', cost: 440000, ...T(2) },
  { id: 'par_16e',       city: 'paris',    name: '16e Hôtel Particulier',    address: '88 Avenue Foch, 75116', cost: 2800000,  ...T(3) },
  { id: 'par_versailles',city: 'paris',    name: 'Versailles Château',       address: 'Domaine de Marly, 78160', cost: 14000000, ...T(4) },

  //  Bangkok 
  { id: 'bkk_shophouse', city: 'bangkok',  name: 'Klong Toey Shophouse',     address: '288/4 Phra Ram 4 Rd',   cost: 28000,    ...T(1) },
  { id: 'bkk_sukhumvit', city: 'bangkok',  name: 'Sukhumvit Apartment',      address: 'Soi 11, Tower 2 #2604', cost: 220000,   ...T(2) },
  { id: 'bkk_thonglor',  city: 'bangkok',  name: 'Thonglor Modern Villa',    address: '55 Soi Thonglor 13',    cost: 1200000,  ...T(3) },
  { id: 'bkk_phuket',    city: 'bangkok',  name: 'Phuket Beach Compound',    address: '8 Pansea Beach Rd, Surin', cost: 4800000, ...T(4) },

  //  Sydney 
  { id: 'syd_terrace',   city: 'sydney',   name: 'Surry Hills Terrace',      address: '142 Crown St, NSW 2010',cost: 46000,    ...T(1) },
  { id: 'syd_bondi',     city: 'sydney',   name: 'Bondi Beach Apartment',    address: '21 Notts Ave, Bondi',   cost: 340000,   ...T(2) },
  { id: 'syd_vaucluse',  city: 'sydney',   name: 'Vaucluse Harbour House',   address: '14 Wentworth Rd',       cost: 2600000,  ...T(3) },
  { id: 'syd_bluemtns',  city: 'sydney',   name: 'Blue Mountains Estate',    address: 'Govetts Leap Rd, Blackheath', cost: 9500000, ...T(4) },

  //  Rio 
  { id: 'rio_walkup',    city: 'rio',      name: 'Lapa Walk-up',             address: 'Rua dos Inválidos, 88', cost: 35000,    ...T(1) },
  { id: 'rio_copacabana',city: 'rio',      name: 'Copacabana Apartment',     address: 'Av. Atlântica, 2400 #1101', cost: 280000, ...T(2) },
  { id: 'rio_leblon',    city: 'rio',      name: 'Leblon Mansion',           address: 'Rua Aristides Espínola, 56', cost: 1800000, ...T(3) },
  { id: 'rio_buzios',    city: 'rio',      name: 'Búzios Beach Compound',    address: 'Praia do Forno, Búzios',cost: 6000000,  ...T(4) },

  //  Moscow 
  { id: 'mow_flat',      city: 'moscow',   name: 'Khrushchyovka Flat',       address: 'Ulitsa Bolshaya Sadovaya, 14', cost: 38000, ...T(1) },
  { id: 'mow_arbat',     city: 'moscow',   name: 'Arbat Apartment',          address: 'Stary Arbat 23, kv 7',  cost: 300000,   ...T(2) },
  { id: 'mow_patriarsh', city: 'moscow',   name: 'Patriarshiye Penthouse',   address: 'Bolshoy Patriarshiy 8, PH', cost: 1900000, ...T(3) },
  { id: 'mow_rublyovka', city: 'moscow',   name: 'Rublyovka Mansion',        address: 'Rublyovo-Uspenskoye Shosse', cost: 7500000, ...T(4) },

  //  Cape Town 
  { id: 'cpt_cottage',   city: 'cape_town',name: 'Salt River Cottage',       address: '23 Voortrekker Rd',     cost: 30000,    ...T(1) },
  { id: 'cpt_seapoint',  city: 'cape_town',name: 'Sea Point Apartment',      address: '142 Beach Rd, Mouille Point', cost: 250000, ...T(2) },
  { id: 'cpt_bantry',    city: 'cape_town',name: 'Bantry Bay Villa',         address: '8 Theresa Ave',         cost: 1600000,  ...T(3) },
  { id: 'cpt_campsbay',  city: 'cape_town',name: 'Camps Bay Compound',       address: 'Geneva Drive Estate',   cost: 5800000,  ...T(4) },

  //  Additional properties — 6 more per city 

  //  New York 
  { id: 'ny_bushwick',     city: 'new_york', name: 'Bushwick Studio',          address: '412 Knickerbocker Ave',         cost: 35000,    ...T(1) },
  { id: 'ny_harlem',       city: 'new_york', name: 'Harlem Brownstone Studio', address: '132 W 119th St',                cost: 62000,    ...T(1) },
  { id: 'ny_village',      city: 'new_york', name: 'Greenwich Village Apt',    address: '28 Bleecker St #4B',            cost: 520000,   ...T(2) },
  { id: 'ny_astoria',      city: 'new_york', name: 'Astoria Co-op',            address: '33-12 31st Ave, Queens',        cost: 310000,   ...T(2) },
  { id: 'ny_tribeca',      city: 'new_york', name: 'Tribeca Loft',             address: '92 Greenwich St PH',            cost: 1800000,  ...T(3) },
  { id: 'ny_westchester',  city: 'new_york', name: 'Westchester Mansion',      address: '88 Hudson Pointe Dr, Tarrytown',cost: 7500000,  ...T(4) },

  //  London 
  { id: 'lon_camberwell',  city: 'london',   name: 'Camberwell Bedsit',        address: '18 Coldharbour Ln, SE5',        cost: 42000,    ...T(1) },
  { id: 'lon_hackney',     city: 'london',   name: 'Hackney Conversion',       address: '64 Lower Clapton Rd, E5',       cost: 68000,    ...T(1) },
  { id: 'lon_chelsea',     city: 'london',   name: 'Chelsea Garden Flat',      address: '81 Sydney St, SW3',             cost: 580000,   ...T(2) },
  { id: 'lon_hampstead',   city: 'london',   name: 'Hampstead Apartment',      address: '14 Flask Walk, NW3',            cost: 490000,   ...T(2) },
  { id: 'lon_belgravia',   city: 'london',   name: 'Belgravia Garden House',   address: '47 Eaton Sq, SW1W',             cost: 3400000,  ...T(3) },
  { id: 'lon_cotswolds',   city: 'london',   name: 'Cotswolds Manor',          address: 'Westcote Hall, Stow-on-the-Wold', cost: 7000000, ...T(4) },

  //  Tokyo 
  { id: 'tok_shimokita',   city: 'tokyo',    name: 'Shimokitazawa Studio',     address: '2-25-3 Kitazawa, Setagaya',     cost: 48000,    ...T(1) },
  { id: 'tok_kichijoji',   city: 'tokyo',    name: 'Kichijōji Apartment',      address: '1-22-12 Kichijōji-honchō',      cost: 54000,    ...T(1) },
  { id: 'tok_omotesando',  city: 'tokyo',    name: 'Omotesandō Apt',           address: '5-3-10 Jingūmae, Shibuya',      cost: 620000,   ...T(2) },
  { id: 'tok_daikanyama',  city: 'tokyo',    name: 'Daikanyama Loft',          address: '14-9 Sarugakuchō, Shibuya',     cost: 540000,   ...T(2) },
  { id: 'tok_minato',      city: 'tokyo',    name: 'Akasaka Penthouse',        address: '1-7-1 Akasaka, Tower 35F',      cost: 4100000,  ...T(3) },
  { id: 'tok_karuizawa',   city: 'tokyo',    name: 'Karuizawa Mountain Villa', address: '1234 Naka-Karuizawa',           cost: 9500000,  ...T(4) },

  //  Dubai 
  { id: 'dxb_satwa',       city: 'dubai',    name: 'Satwa Studio',             address: '4 Pearl Building, Block C',     cost: 40000,    ...T(1) },
  { id: 'dxb_bur',         city: 'dubai',    name: 'Bur Dubai Apartment',      address: 'Khalid Bin Al Waleed Rd #1208', cost: 58000,    ...T(1) },
  { id: 'dxb_jbr',         city: 'dubai',    name: 'JBR Walk Apartment',       address: 'Sadaf 7 Tower #1402',           cost: 720000,   ...T(2) },
  { id: 'dxb_marina',      city: 'dubai',    name: 'Marina Apartment',         address: 'Marina Promenade Tower #2204',  cost: 580000,   ...T(2) },
  { id: 'dxb_emirates',    city: 'dubai',    name: 'Emirates Hills Villa',     address: 'Sector E, Villa 28',            cost: 5600000,  ...T(3) },
  { id: 'dxb_jumeirah_islands', city: 'dubai', name: 'Jumeirah Islands Estate',address: 'Cluster 14, Villa 5',           cost: 13000000, ...T(4) },

  //  Liverpool 
  { id: 'lpl_kensington',  city: 'liverpool',name: 'Kensington Bedsit',        address: '217 Kensington Rd, L7',         cost: 24000,    ...T(1) },
  { id: 'lpl_anfield',     city: 'liverpool',name: 'Anfield Terrace',          address: '18 Skerries Rd, L4',            cost: 38000,    ...T(1) },
  { id: 'lpl_woolton',     city: 'liverpool',name: 'Woolton Semi',             address: '8 Allerton Rd, L25',            cost: 290000,   ...T(2) },
  { id: 'lpl_crosby',      city: 'liverpool',name: 'Crosby House',             address: '14 Coronation Rd, L23',         cost: 245000,   ...T(2) },
  { id: 'lpl_calderstones',city: 'liverpool',name: 'Calderstones Mansion',     address: '92 Menlove Ave, L18',           cost: 1600000,  ...T(3) },
  { id: 'lpl_southport',   city: 'liverpool',name: 'Southport Manor',          address: 'Birkdale Hall, PR8',            cost: 4200000,  ...T(4) },

  //  Miami 
  { id: 'mia_overtown',    city: 'miami',    name: 'Overtown Walk-up',         address: '1623 NW 3rd Ave',               cost: 36000,    ...T(1) },
  { id: 'mia_wynwood',     city: 'miami',    name: 'Wynwood Loft',             address: '250 NW 24th St',                cost: 58000,    ...T(1) },
  { id: 'mia_brickell',    city: 'miami',    name: 'Brickell Condo',           address: '485 Brickell Ave #1604',        cost: 480000,   ...T(2) },
  { id: 'mia_aventura',    city: 'miami',    name: 'Aventura Apartment',       address: '18101 Collins Ave #2806',       cost: 390000,   ...T(2) },
  { id: 'mia_pinecrest',   city: 'miami',    name: 'Pinecrest Estate',         address: '7250 SW 122nd St',              cost: 2800000,  ...T(3) },
  { id: 'mia_fisher_island',city: 'miami',   name: 'Fisher Island Mansion',    address: '6822 Valencia Dr',              cost: 14000000, ...T(4) },

  //  Paris 
  { id: 'par_belleville',  city: 'paris',    name: 'Belleville Studio',        address: '9 Rue de la Mare, 75020',       cost: 44000,    ...T(1) },
  { id: 'par_pigalle',     city: 'paris',    name: 'Pigalle Walk-up',          address: '21 Rue Frochot, 75009',         cost: 58000,    ...T(1) },
  { id: 'par_st_germain',  city: 'paris',    name: 'Saint-Germain Apt',        address: '14 Rue Jacob, 75006',           cost: 620000,   ...T(2) },
  { id: 'par_montmartre',  city: 'paris',    name: 'Montmartre Apartment',     address: '27 Rue des Abbesses, 75018',    cost: 480000,   ...T(2) },
  { id: 'par_etoile',      city: 'paris',    name: 'Étoile Mansion',           address: '8 Avenue Marceau, 75008',       cost: 3400000,  ...T(3) },
  { id: 'par_loire',       city: 'paris',    name: 'Loire Valley Château',     address: 'Domaine de Chambord, 41250',    cost: 11000000, ...T(4) },

  //  Bangkok 
  { id: 'bkk_silom',       city: 'bangkok',  name: 'Silom Studio',             address: '91 Pan Rd, Bangrak',            cost: 24000,    ...T(1) },
  { id: 'bkk_chinatown',   city: 'bangkok',  name: 'Yaowarat Shophouse',       address: '458 Charoen Krung Rd',          cost: 32000,    ...T(1) },
  { id: 'bkk_asok',        city: 'bangkok',  name: 'Asok Condo',               address: 'Sukhumvit Soi 21 #1804',        cost: 260000,   ...T(2) },
  { id: 'bkk_ari',         city: 'bangkok',  name: 'Ari Loft',                 address: 'Phaholyothin Soi 4',            cost: 185000,   ...T(2) },
  { id: 'bkk_riverside',   city: 'bangkok',  name: 'Chao Phraya Penthouse',    address: 'Mandarin Oriental Residences PH', cost: 1400000, ...T(3) },
  { id: 'bkk_koh_samui',   city: 'bangkok',  name: 'Koh Samui Beach Estate',   address: 'Bo Phut Beach Rd',              cost: 5400000,  ...T(4) },

  //  Sydney 
  { id: 'syd_kings_cross', city: 'sydney',   name: 'Kings Cross Studio',       address: '18 Macleay St, NSW 2011',       cost: 42000,    ...T(1) },
  { id: 'syd_newtown',     city: 'sydney',   name: 'Newtown Terrace Cottage',  address: '145 King St, NSW 2042',         cost: 58000,    ...T(1) },
  { id: 'syd_paddington',  city: 'sydney',   name: 'Paddington Terrace',       address: '92 Oxford St, NSW 2021',        cost: 410000,   ...T(2) },
  { id: 'syd_manly',       city: 'sydney',   name: 'Manly Beach Apt',          address: '12 The Esplanade, NSW 2095',    cost: 380000,   ...T(2) },
  { id: 'syd_pointpiper',  city: 'sydney',   name: 'Point Piper Mansion',      address: '14 Wolseley Cres',              cost: 3200000,  ...T(3) },
  { id: 'syd_hunter',      city: 'sydney',   name: 'Hunter Valley Estate',     address: 'Pokolbin Vineyard Hall',        cost: 7800000,  ...T(4) },

  //  Rio 
  { id: 'rio_santa_teresa',city: 'rio',      name: 'Santa Teresa Bedsit',      address: 'Rua Almte. Alexandrino, 412',   cost: 32000,    ...T(1) },
  { id: 'rio_botafogo',    city: 'rio',      name: 'Botafogo Apartment',       address: 'Rua São Clemente, 88',          cost: 48000,    ...T(1) },
  { id: 'rio_ipanema',     city: 'rio',      name: 'Ipanema Apt',              address: 'Rua Vinícius de Moraes, 132',   cost: 420000,   ...T(2) },
  { id: 'rio_barra',       city: 'rio',      name: 'Barra da Tijuca Apt',      address: 'Av. Lúcio Costa, 4500 #1101',   cost: 310000,   ...T(2) },
  { id: 'rio_gavea',       city: 'rio',      name: 'Gávea Mansion',            address: 'Estrada da Gávea, 924',         cost: 1500000,  ...T(3) },
  { id: 'rio_angra',       city: 'rio',      name: 'Angra dos Reis Compound',  address: 'Ilha do Tibau, Angra',          cost: 5500000,  ...T(4) },

  //  Moscow 
  { id: 'mow_chertanovo',  city: 'moscow',   name: 'Chertanovo Bedsit',        address: 'Sumskoy Proyezd, 6',            cost: 28000,    ...T(1) },
  { id: 'mow_basmanny',    city: 'moscow',   name: 'Basmanny Walk-up',         address: 'Pokrovka Ulitsa, 18',           cost: 44000,    ...T(1) },
  { id: 'mow_zamoskvorech',city: 'moscow',   name: 'Zamoskvorechye Apt',       address: 'Bolshaya Ordynka, 41',          cost: 360000,   ...T(2) },
  { id: 'mow_tverskoy',    city: 'moscow',   name: 'Tverskoy Apartment',       address: 'Tverskaya Ulitsa, 27',          cost: 440000,   ...T(2) },
  { id: 'mow_skolkovo',    city: 'moscow',   name: 'Skolkovo Mansion',         address: 'Ulitsa Lugovaya, 12',           cost: 2400000,  ...T(3) },
  { id: 'mow_zhukovka',    city: 'moscow',   name: 'Zhukovka Country Estate',  address: 'Pyatnitskoye Shosse, km 8',     cost: 6500000,  ...T(4) },

  //  Cape Town 
  { id: 'cpt_woodstock',   city: 'cape_town',name: 'Woodstock Loft',           address: '312 Albert Rd',                 cost: 34000,    ...T(1) },
  { id: 'cpt_obs',         city: 'cape_town',name: 'Observatory Cottage',      address: '18 Trill Rd',                   cost: 42000,    ...T(1) },
  { id: 'cpt_greenpoint',  city: 'cape_town',name: 'Green Point Apt',          address: '142 Beach Rd',                  cost: 310000,   ...T(2) },
  { id: 'cpt_kloof',       city: 'cape_town',name: 'Kloof Street Apt',         address: '92 Kloof St',                   cost: 260000,   ...T(2) },
  { id: 'cpt_clifton',     city: 'cape_town',name: 'Clifton Beachfront',       address: '21 Victoria Rd, Bungalow 4',    cost: 2200000,  ...T(3) },
  { id: 'cpt_franschhoek', city: 'cape_town',name: 'Franschhoek Wine Estate',  address: '234 Franschhoek Pass Rd',       cost: 5300000,  ...T(4) },

  //  Las Vegas 
  { id: 'lv_henderson_studio', city: 'las_vegas', name: 'Henderson Bedsit',      address: '312 Sunset Rd',                 cost: 42000,    ...T(1) },
  { id: 'lv_strip_studio',     city: 'las_vegas', name: 'Strip-Side Studio',     address: '4847 Las Vegas Blvd #618',      cost: 52000,    ...T(1) },
  { id: 'lv_spring_valley',    city: 'las_vegas', name: 'Spring Valley Walk-up', address: '8801 W Sahara Ave',             cost: 48000,    ...T(1) },
  { id: 'lv_summerlin',        city: 'las_vegas', name: 'Summerlin Townhouse',   address: '11240 Hidden Peak Ave',         cost: 480000,   ...T(2) },
  { id: 'lv_paradise',         city: 'las_vegas', name: 'Paradise Apt',          address: '4625 Dean Martin Dr #2202',     cost: 360000,   ...T(2) },
  { id: 'lv_henderson_house',  city: 'las_vegas', name: 'Henderson House',       address: '2515 Sunridge Heights Pkwy',    cost: 320000,   ...T(2) },
  { id: 'lv_strip_penthouse',  city: 'las_vegas', name: 'Strip Penthouse',       address: 'The Cosmopolitan #5005',        cost: 3400000,  ...T(3) },
  { id: 'lv_lake',             city: 'las_vegas', name: 'Lake Las Vegas Estate', address: '14 Foothill Dr',                cost: 2800000,  ...T(3) },
  { id: 'lv_redrock',          city: 'las_vegas', name: 'Red Rock Compound',     address: '1423 Calico Hills',             cost: 11000000, ...T(4) },
  { id: 'lv_mountains_edge',   city: 'las_vegas', name: 'Mountain\'s Edge Manor',address: '8910 Coronet Hills',            cost: 9500000,  ...T(4) },

  //  Hong Kong 
  { id: 'hk_ssp',          city: 'hong_kong', name: 'Sham Shui Po Studio',    address: '188 Tai Po Rd',                 cost: 45000,    ...T(1) },
  { id: 'hk_kowloon',      city: 'hong_kong', name: 'Kowloon Walk-up',        address: '12 Reclamation St',             cost: 62000,    ...T(1) },
  { id: 'hk_mong_kok',     city: 'hong_kong', name: 'Mong Kok Cubicle',       address: '24 Argyle St #15B',             cost: 58000,    ...T(1) },
  { id: 'hk_wan_chai',     city: 'hong_kong', name: 'Wan Chai Apartment',     address: "88 Queen's Rd East #2104",      cost: 720000,   ...T(2) },
  { id: 'hk_causeway',     city: 'hong_kong', name: 'Causeway Bay Apt',       address: '22 Times Square Tower',         cost: 580000,   ...T(2) },
  { id: 'hk_tst',          city: 'hong_kong', name: 'Tsim Sha Tsui High-Rise',address: '12 Salisbury Rd #3306',         cost: 640000,   ...T(2) },
  { id: 'hk_midlevels',    city: 'hong_kong', name: 'Mid-Levels Penthouse',   address: 'The Peak Tower #PH3',           cost: 4200000,  ...T(3) },
  { id: 'hk_repulse_bay',  city: 'hong_kong', name: 'Repulse Bay Villa',      address: '109 Repulse Bay Rd',            cost: 5800000,  ...T(3) },
  { id: 'hk_peak',         city: 'hong_kong', name: 'The Peak Mansion',       address: "8 Black's Link Rd",             cost: 16000000, ...T(4) },
  { id: 'hk_stanley',      city: 'hong_kong', name: 'Stanley Compound',       address: '1 Stanley Beach Rd',            cost: 13000000, ...T(4) },

  //  Berlin 
  { id: 'ber_kreuzberg',   city: 'berlin', name: 'Kreuzberg Bedsit',          address: 'Görlitzer Str. 18',             cost: 36000,    ...T(1) },
  { id: 'ber_neukolln',    city: 'berlin', name: 'Neukölln Walk-up',          address: 'Karl-Marx-Str. 142',            cost: 42000,    ...T(1) },
  { id: 'ber_friedrich',   city: 'berlin', name: 'Friedrichshain Studio',     address: 'Rigaer Str. 88',                cost: 48000,    ...T(1) },
  { id: 'ber_mitte',       city: 'berlin', name: 'Mitte Apartment',           address: 'Torstraße 145',                 cost: 360000,   ...T(2) },
  { id: 'ber_prenzlauer',  city: 'berlin', name: 'Prenzlauer Berg Loft',      address: 'Kollwitzstr. 64',               cost: 410000,   ...T(2) },
  { id: 'ber_charlotten',  city: 'berlin', name: 'Charlottenburg Apt',        address: 'Kurfürstendamm 215',            cost: 480000,   ...T(2) },
  { id: 'ber_grunewald',   city: 'berlin', name: 'Grunewald Mansion',         address: 'Bismarckallee 23',              cost: 2400000,  ...T(3) },
  { id: 'ber_wannsee',     city: 'berlin', name: 'Wannsee Lakehouse',         address: 'Am Großen Wannsee 18',          cost: 2800000,  ...T(3) },
  { id: 'ber_potsdam',     city: 'berlin', name: 'Potsdam Estate',            address: 'Am Neuen Garten 31',            cost: 7200000,  ...T(4) },
  { id: 'ber_brandenburg', city: 'berlin', name: 'Brandenburg Country Manor', address: 'Schloss Sanssouci Park',        cost: 8500000,  ...T(4) },

  //  Mexico City 
  { id: 'mex_tepito',      city: 'mexico_city', name: 'Tepito Walk-up',         address: 'Calle Tenochtitlán 142',     cost: 24000,    ...T(1) },
  { id: 'mex_iztapalapa',  city: 'mexico_city', name: 'Iztapalapa Studio',      address: 'Eje 5 Sur 88',               cost: 28000,    ...T(1) },
  { id: 'mex_doctores',    city: 'mexico_city', name: 'Doctores Bedsit',        address: 'Dr. Andrade 203',            cost: 32000,    ...T(1) },
  { id: 'mex_roma',        city: 'mexico_city', name: 'Roma Norte Apt',         address: 'Av. Álvaro Obregón 88',      cost: 260000,   ...T(2) },
  { id: 'mex_condesa',     city: 'mexico_city', name: 'Condesa Loft',           address: 'Calle Amsterdam 142',        cost: 310000,   ...T(2) },
  { id: 'mex_polanco',     city: 'mexico_city', name: 'Polanco Apt',            address: 'Av. Presidente Masaryk 405', cost: 420000,   ...T(2) },
  { id: 'mex_lomas',       city: 'mexico_city', name: 'Lomas de Chapultepec Mansion', address: 'Sierra Madre 210',     cost: 1400000,  ...T(3) },
  { id: 'mex_san_angel',   city: 'mexico_city', name: 'San Ángel Estate',       address: 'Av. de la Paz 24',           cost: 1600000,  ...T(3) },
  { id: 'mex_las_lomas',   city: 'mexico_city', name: 'Las Lomas Compound',     address: 'Bosques de la Reforma 850',  cost: 5200000,  ...T(4) },
  { id: 'mex_cuernavaca',  city: 'mexico_city', name: 'Cuernavaca Country Estate', address: 'Avenida Diana 14',        cost: 4800000,  ...T(4) },

  //  Amsterdam 
  { id: 'ams_jordaan',     city: 'amsterdam', name: 'Jordaan Walk-up',          address: 'Lindengracht 65',           cost: 48000,    ...T(1) },
  { id: 'ams_de_pijp',     city: 'amsterdam', name: 'De Pijp Studio',           address: 'Albert Cuypstraat 188',     cost: 52000,    ...T(1) },
  { id: 'ams_oost',        city: 'amsterdam', name: 'Oost Bedsit',              address: 'Javastraat 24',             cost: 44000,    ...T(1) },
  { id: 'ams_canal',       city: 'amsterdam', name: 'Canal-Side Apartment',     address: 'Herengracht 401',           cost: 540000,   ...T(2) },
  { id: 'ams_vondelpark',  city: 'amsterdam', name: 'Vondelpark Apt',           address: 'Vondelstraat 92',           cost: 480000,   ...T(2) },
  { id: 'ams_zuidas',      city: 'amsterdam', name: 'Zuidas Modern Loft',       address: 'Gustav Mahlerlaan 14',      cost: 620000,   ...T(2) },
  { id: 'ams_koningslaan', city: 'amsterdam', name: 'Vondelpark Mansion',       address: 'Koningslaan 28',            cost: 2600000,  ...T(3) },
  { id: 'ams_apollolaan',  city: 'amsterdam', name: 'Apollolaan Townhouse',     address: 'Apollolaan 142',            cost: 3200000,  ...T(3) },
  { id: 'ams_wassenaar',   city: 'amsterdam', name: 'Wassenaar Estate',         address: 'Van Dishoeckpark 8',        cost: 7500000,  ...T(4) },
  { id: 'ams_loosdrecht',  city: 'amsterdam', name: 'Loosdrecht Lakeside Compound', address: 'Oud-Loosdrechtsedijk 12', cost: 6800000, ...T(4) },

  //  Detroit 
  { id: 'det_highland',    city: 'detroit', name: 'Highland Park Bedsit',       address: '12450 Hamilton Ave',        cost: 18000,    ...T(1) },
  { id: 'det_brightmoor',  city: 'detroit', name: 'Brightmoor Walk-up',         address: '18024 Lamphere St',         cost: 22000,    ...T(1) },
  { id: 'det_8mile',       city: 'detroit', name: '8 Mile Studio',              address: '19015 W 8 Mile Rd',         cost: 28000,    ...T(1) },
  { id: 'det_corktown',    city: 'detroit', name: 'Corktown Townhouse',         address: '1845 Trumbull Ave',         cost: 180000,   ...T(2) },
  { id: 'det_midtown',     city: 'detroit', name: 'Midtown Loft',               address: '4220 Cass Ave #408',        cost: 220000,   ...T(2) },
  { id: 'det_indian_vill', city: 'detroit', name: 'Indian Village Apt',         address: '8127 Burns St',             cost: 260000,   ...T(2) },
  { id: 'det_grosse',      city: 'detroit', name: 'Grosse Pointe Mansion',      address: '880 Lakeshore Rd',          cost: 1100000,  ...T(3) },
  { id: 'det_bloomfield',  city: 'detroit', name: 'Bloomfield Hills Estate',    address: '2200 Long Lake Rd',         cost: 1400000,  ...T(3) },
  { id: 'det_birmingham',  city: 'detroit', name: 'Birmingham Compound',        address: '1834 Stanley Blvd',         cost: 4200000,  ...T(4) },
  { id: 'det_st_clair',    city: 'detroit', name: 'Lake St. Clair Country Estate', address: '22 Tashmoo Dr',         cost: 4800000,  ...T(4) },

  //  Chicago 
  { id: 'chi_pilsen',     city: 'chicago', name: 'Pilsen Walk-up',           address: '1721 W 18th St',           cost: 56000,    ...T(1) },
  { id: 'chi_uptown',     city: 'chicago', name: 'Uptown Greystone',         address: '4520 N Magnolia Ave',      cost: 320000,   ...T(2) },
  { id: 'chi_gold_coast', city: 'chicago', name: 'Gold Coast Penthouse',     address: '1300 N State Pkwy PH',     cost: 2100000,  ...T(3) },
  { id: 'chi_lincoln',    city: 'chicago', name: 'Lincoln Park Mansion',     address: '2230 N Lakeview Ave',      cost: 9500000,  ...T(4) },

  //  Los Angeles
  { id: 'la_boyleheights',city: 'los_angeles', name: 'Boyle Heights Walk-up',address: '2840 E 4th St',            cost: 45000,    ...T(1) },
  { id: 'la_echo',        city: 'los_angeles', name: 'Echo Park Bungalow',   address: '1418 Lemoyne St',          cost: 72000,    ...T(1) },
  { id: 'la_silverlake',  city: 'los_angeles', name: 'Silver Lake Bungalow', address: '2317 Sunset Blvd',         cost: 220000,   ...T(1) },
  { id: 'la_weho',        city: 'los_angeles', name: 'West Hollywood Condo', address: '8717 Burton Way #4B',      cost: 850000,   ...T(2) },
  { id: 'la_bel_air',     city: 'los_angeles', name: 'Bel Air Hilltop',      address: '10100 Sunset Blvd',        cost: 5800000,  ...T(3) },
  { id: 'la_beverly',     city: 'los_angeles', name: 'Beverly Hills Estate', address: '1011 N Roxbury Dr',        cost: 18000000, ...T(4) },

  //  Kingston
  { id: 'kgn_trench',     city: 'kingston',    name: 'Trench Town Walk-up',  address: '15 Whitfield Town',        cost: 28000,    ...T(1) },
  { id: 'kgn_mona',       city: 'kingston',    name: 'Mona Heights Bungalow',address: '17 Hopefield Ave',         cost: 56000,    ...T(1) },
  { id: 'kgn_uptown',     city: 'kingston',    name: 'New Kingston Apt',     address: '6 Knutsford Blvd',         cost: 240000,   ...T(2) },
  { id: 'kgn_stonyhill',  city: 'kingston',    name: 'Stony Hill House',     address: '38 Stony Hill Rd',         cost: 1500000,  ...T(3) },
  { id: 'kgn_jackshill',  city: 'kingston',    name: 'Jacks Hill Estate',    address: '12 Skyline Dr',            cost: 5500000,  ...T(4) },

  //  Seoul 
  { id: 'seo_hongdae',    city: 'seoul', name: 'Hongdae Studio',             address: '352 Yanghwa-ro',           cost: 78000,    ...T(1) },
  { id: 'seo_itaewon',    city: 'seoul', name: 'Itaewon Apt',                address: '180 Itaewon-ro',           cost: 480000,   ...T(2) },
  { id: 'seo_gangnam',    city: 'seoul', name: 'Gangnam High-rise',          address: '521 Teheran-ro',           cost: 3400000,  ...T(3) },
  { id: 'seo_seongbuk',   city: 'seoul', name: 'Seongbuk-dong Estate',       address: '88 Seongbukro 30-gil',     cost: 12500000, ...T(4) },

  //  Shanghai 
  { id: 'sha_jingan',     city: 'shanghai', name: 'Jing\'an Lane House',     address: '328 Anyi Rd',              cost: 92000,    ...T(1) },
  { id: 'sha_xuhui',      city: 'shanghai', name: 'Xuhui Apartment',         address: '1788 Hengshan Rd',         cost: 560000,   ...T(2) },
  { id: 'sha_bund',       city: 'shanghai', name: 'The Bund Penthouse',      address: '120 Zhongshan E1 Rd PH',   cost: 4200000,  ...T(3) },
  { id: 'sha_sheshan',    city: 'shanghai', name: 'Sheshan Villa Compound',  address: '288 Yuxiu Rd',             cost: 14500000, ...T(4) },

  //  Mumbai 
  { id: 'mum_dharavi',    city: 'mumbai', name: 'Dharavi Bedsit',            address: 'Lane 4, 90 Feet Rd',       cost: 14000,    ...T(1) },
  { id: 'mum_andheri',    city: 'mumbai', name: 'Andheri 1BHK',              address: 'Lokhandwala Complex',      cost: 110000,   ...T(2) },
  { id: 'mum_bandra',     city: 'mumbai', name: 'Bandra Sea-facing Flat',    address: '32 Pali Hill',             cost: 720000,   ...T(3) },
  { id: 'mum_malabar',    city: 'mumbai', name: 'Malabar Hill Bungalow',     address: '11 Walkeshwar Rd',         cost: 3800000,  ...T(4) },

  //  Istanbul 
  { id: 'ist_kadikoy',    city: 'istanbul', name: 'Kadıköy Studio',          address: 'Moda Caddesi 84',          cost: 36000,    ...T(1) },
  { id: 'ist_beyoglu',    city: 'istanbul', name: 'Beyoğlu Walk-up',         address: 'İstiklal Caddesi 220',     cost: 240000,   ...T(2) },
  { id: 'ist_bebek',      city: 'istanbul', name: 'Bebek Bosphorus Apt',     address: 'Cevdetpaşa Caddesi 14',    cost: 1700000,  ...T(3) },
  { id: 'ist_yali',       city: 'istanbul', name: 'Bosphorus Yalı',          address: 'Yeniköy Caddesi 88',       cost: 7800000,  ...T(4) },

  //  Johannesburg 
  { id: 'jhb_yeoville',   city: 'johannesburg', name: 'Yeoville Bedsit',     address: '12 Rockey St',             cost: 16000,    ...T(1) },
  { id: 'jhb_melville',   city: 'johannesburg', name: 'Melville Townhouse',  address: '7th Street, House 32',     cost: 140000,   ...T(2) },
  { id: 'jhb_sandton',    city: 'johannesburg', name: 'Sandton Penthouse',   address: 'Rivonia Rd PH-12',         cost: 980000,   ...T(3) },
  { id: 'jhb_bryanston',  city: 'johannesburg', name: 'Bryanston Compound',  address: '184 Main Rd',              cost: 4200000,  ...T(4) },

  //  Monaco 
  { id: 'mco_studio',     city: 'monaco', name: 'Fontvieille Studio',        address: '4 Avenue des Papalins',    cost: 380000,   ...T(1) },
  { id: 'mco_condamine',  city: 'monaco', name: 'La Condamine Apt',          address: '17 Rue Princesse Caroline',cost: 1800000,  ...T(2) },
  { id: 'mco_carre_or',   city: 'monaco', name: 'Carré d\'Or Penthouse',     address: '1 Avenue Princesse Grace PH', cost: 12500000, ...T(3) },
  { id: 'mco_roc',        city: 'monaco', name: 'Cap d\'Ail Cliff Villa',    address: '88 Boulevard du Général de Gaulle', cost: 35000000, ...T(4) },

  //  Singapore 
  { id: 'sgp_geylang',    city: 'singapore', name: 'Geylang HDB',            address: '88 Geylang Lor 24',        cost: 110000,   ...T(1) },
  { id: 'sgp_tiong',      city: 'singapore', name: 'Tiong Bahru Loft',       address: '78 Eng Hoon St #06-12',    cost: 720000,   ...T(2) },
  { id: 'sgp_orchard',    city: 'singapore', name: 'Orchard Penthouse',      address: '1 Cuscaden Rd PH',         cost: 4800000,  ...T(3) },
  { id: 'sgp_sentosa',    city: 'singapore', name: 'Sentosa Cove Villa',     address: '12 Cove Way',              cost: 16500000, ...T(4) },

  //  Manila 
  { id: 'mnl_tondo',      city: 'manila', name: 'Tondo Walk-up',             address: '215 Juan Luna St',         cost: 12000,    ...T(1) },
  { id: 'mnl_makati',     city: 'manila', name: 'Makati Studio',             address: '6750 Ayala Ave #1408',     cost: 95000,    ...T(2) },
  { id: 'mnl_bgc',        city: 'manila', name: 'BGC High-rise Apt',         address: '32nd St, Fort Bonifacio',  cost: 720000,   ...T(3) },
  { id: 'mnl_forbes',     city: 'manila', name: 'Forbes Park Mansion',       address: '128 Acacia Ave',           cost: 3400000,  ...T(4) },

  //  Havana 
  { id: 'hav_centro',     city: 'havana', name: 'Centro Habana Bedsit',      address: 'Calle Galiano 312',        cost: 22000,    ...T(1) },
  { id: 'hav_vedado',     city: 'havana', name: 'Vedado Apartment',          address: 'Calle 23 #1455',           cost: 180000,   ...T(2) },
  { id: 'hav_miramar',    city: 'havana', name: 'Miramar Villa',             address: '5ta Avenida y Calle 28',   cost: 1100000,  ...T(3) },
  { id: 'hav_country',    city: 'havana', name: 'Cubanacán Country Estate',  address: 'Calle 188 esquina 13',     cost: 4200000,  ...T(4) },

  //  Marseille 
  { id: 'mrs_panier',     city: 'marseille', name: 'Le Panier Walk-up',      address: 'Rue du Refuge 12',         cost: 38000,    ...T(1) },
  { id: 'mrs_endoume',    city: 'marseille', name: 'Endoume Apt',            address: 'Boulevard Tellene 88',     cost: 280000,   ...T(2) },
  { id: 'mrs_corniche',   city: 'marseille', name: 'Corniche Sea-View',      address: 'Promenade J.F. Kennedy 220', cost: 1900000, ...T(3) },
  { id: 'mrs_cassis',     city: 'marseille', name: 'Cassis Cliff Villa',     address: 'Route des Crêtes',         cost: 6800000,  ...T(4) },

  //  Naples 
  { id: 'nap_quartieri',  city: 'naples', name: 'Quartieri Spagnoli Bedsit', address: 'Vico Lungo Gelso 14',      cost: 30000,    ...T(1) },
  { id: 'nap_vomero',     city: 'naples', name: 'Vomero Apartment',          address: 'Via Luca Giordano 88',     cost: 220000,   ...T(2) },
  { id: 'nap_posillipo',  city: 'naples', name: 'Posillipo Sea View',        address: 'Via Petrarca 145',         cost: 1500000,  ...T(3) },
  { id: 'nap_capri',      city: 'naples', name: 'Capri Cliff Compound',      address: 'Via Tragara 12',           cost: 8200000,  ...T(4) },

  //  Prague 
  { id: 'prg_zizkov',     city: 'prague', name: 'Žižkov Walk-up',            address: 'Bořivojova 88',            cost: 42000,    ...T(1) },
  { id: 'prg_vinohrady',  city: 'prague', name: 'Vinohrady Apt',             address: 'Korunní 22',               cost: 320000,   ...T(2) },
  { id: 'prg_mala',       city: 'prague', name: 'Malá Strana Loft',          address: 'Nerudova 14',              cost: 1700000,  ...T(3) },
  { id: 'prg_strahov',    city: 'prague', name: 'Strahov Hilltop Villa',     address: 'Strahovská 220',           cost: 5800000,  ...T(4) },

  //  Dublin 
  { id: 'dub_libertys',   city: 'dublin', name: 'The Liberties Bedsit',      address: 'Cork St 88',               cost: 56000,    ...T(1) },
  { id: 'dub_temple',     city: 'dublin', name: 'Temple Bar Apt',            address: 'Eustace St 14',            cost: 380000,   ...T(2) },
  { id: 'dub_ballsbridge',city: 'dublin', name: 'Ballsbridge Townhouse',     address: 'Shrewsbury Rd 22',         cost: 1900000,  ...T(3) },
  { id: 'dub_killiney',   city: 'dublin', name: 'Killiney Hill Estate',      address: 'Killiney Hill Rd',         cost: 8500000,  ...T(4) },

  //  São Paulo 
  { id: 'sao_bras',       city: 'sao_paulo', name: 'Brás Walk-up',           address: 'Rua Oriente 220',          cost: 24000,    ...T(1) },
  { id: 'sao_pinheiros',  city: 'sao_paulo', name: 'Pinheiros Loft',         address: 'Rua Teodoro Sampaio 88',   cost: 180000,   ...T(2) },
  { id: 'sao_jardins',    city: 'sao_paulo', name: 'Jardins Penthouse',      address: 'Alameda Lorena 1255 PH',   cost: 1200000,  ...T(3) },
  { id: 'sao_morumbi',    city: 'sao_paulo', name: 'Morumbi Mansion',        address: 'Rua Itacolomi 388',        cost: 5500000,  ...T(4) },
];

// Tickers across sectors. `vol` controls how spiky the random walk is — low
// vol = stable utility/tobacco, high vol = crypto/EV/biotech swings.
export const STOCKS = [
  // Finance
  { id: 'METRO', name: 'MetroBank',          sector: 'Finance',     base: 120,  vol: 0.04 },
  { id: 'VAULT', name: 'Vaultline Holdings', sector: 'Finance',     base: 185,  vol: 0.05 },
  { id: 'GLDT',  name: 'Goldteller Securities', sector: 'Finance',  base: 360,  vol: 0.06 },
  // Defence / Arms
  { id: 'TITAN', name: 'Titan Arms',         sector: 'Defence',     base: 450,  vol: 0.06 },
  { id: 'IRNS',  name: 'Ironsight Munitions',sector: 'Defence',     base: 240,  vol: 0.07 },
  // Aviation / Aerospace
  { id: 'SKYJ',  name: 'SkyJet',             sector: 'Aerospace',   base: 80,   vol: 0.05 },
  { id: 'ORBT',  name: 'Orbita Aerospace',   sector: 'Aerospace',   base: 320,  vol: 0.07 },
  // Energy
  { id: 'NOVA',  name: 'Nova Oil',           sector: 'Energy',      base: 220,  vol: 0.07 },
  { id: 'HLIO',  name: 'Helio Solar',        sector: 'Energy',      base: 95,   vol: 0.08 },
  // Tech
  { id: 'BYTE',  name: 'Bytecast Cloud',     sector: 'Tech',        base: 280,  vol: 0.06 },
  { id: 'NEUR',  name: 'Neura Systems',      sector: 'Tech',        base: 540,  vol: 0.08 },
  // Pharma & Telecom
  { id: 'ZNTH',  name: 'Zenith Pharma',      sector: 'Pharma',      base: 330,  vol: 0.05 },
  { id: 'FBRX',  name: 'Fibrex Networks',    sector: 'Telecom',     base: 165,  vol: 0.03 },
  // Vice
  { id: 'ASHN',  name: 'Ashen Tobacco',      sector: 'Vice',        base: 145,  vol: 0.03 },
  { id: 'VEGA',  name: 'Vega Casinos',       sector: 'Vice',        base: 290,  vol: 0.07 },
  // Auto + Crypto + Mining (high volatility tail)
  { id: 'THND',  name: 'Thunderwheel Motors',sector: 'Auto',        base: 410,  vol: 0.09 },
  { id: 'CRYP',  name: 'Cryptik Exchange',   sector: 'Crypto',      base: 75,   vol: 0.12 },
  { id: 'ORE',   name: 'Orestone Mining',    sector: 'Mining',      base: 130,  vol: 0.06 },
];

// IDs are kept stable for save-game compatibility; only display names and the
// early-tier stat blocks were softened to give level 2–9 players a fairer
// shot before they've ground out gym buffs and decent gear.
export const ENEMIES = [
  { id: 'street_thug',  name: 'Eddie Walsh',         level: 2,  str: 4,  def: 2,  spd: 5,  hp: 50,  weapon: 'knife',         armour: 'none',     loot: [80, 240]    },
  { id: 'corner_dealer',name: 'Marco Russo',         level: 5,  str: 7,  def: 5,  spd: 8,  hp: 75,  weapon: 'knife',         armour: 'leather',  loot: [300, 900]   },
  { id: 'gang_runner',  name: "Tommy O'Connor",      level: 9,  str: 12, def: 9,  spd: 12, hp: 110, weapon: 'glock_17',      armour: 'leather',  loot: [800, 2400]  },
  { id: 'made_man',     name: 'Vincent Marchetti',   level: 15, str: 26, def: 22, spd: 18, hp: 180, weapon: 'beretta_92fs',  armour: 'kevlar',   loot: [2500, 7500] },
  { id: 'cartel_lt',    name: 'Diego Salazar',       level: 25, str: 42, def: 38, spd: 28, hp: 260, weapon: 'remington_870', armour: 'kevlar',   loot: [9000, 28000]},
  { id: 'enforcer',     name: 'Frank Barone',        level: 38, str: 65, def: 60, spd: 38, hp: 360, weapon: 'm4a1',          armour: 'tactical', loot: [30000, 95000]},
  { id: 'underboss',    name: 'Salvatore Greco',     level: 55, str: 95, def: 90, spd: 50, hp: 520, weapon: 'ak47',          armour: 'tactical', loot: [120000, 380000]},
  { id: 'kingpin',      name: 'Giovanni Castellano', level: 75, str: 150,def: 145,spd: 70, hp: 800, weapon: 'barrett_m82',   armour: 'composite',loot: [500000, 1800000]},
];

// Gym machines — temporary str/def/spd buffs that decay 1 point per hour.
// Buffs stack: training again before the previous fades adds on top, capped
// at MAX_BUFF (see services/buffs.js).
export const GYM_MACHINES = [
  { id: 'dumbbells',   name: 'Dumbbells',         emoji: '', energy: 2, cost: 80,   buffs: { strength: 1 },                       desc: 'Light hypertrophy work.' },
  { id: 'bench',       name: 'Bench Press',       emoji: '', energy: 4, cost: 220,  buffs: { strength: 3 },                       desc: 'Classic chest press.' },
  { id: 'squat_rack',  name: 'Squat Rack',        emoji: '', energy: 6, cost: 420,  buffs: { strength: 3, defence: 1 },           desc: 'Heavy squats build strength and a tougher core.' },
  { id: 'deadlift',    name: 'Deadlift Platform', emoji: '', energy: 7, cost: 520,  buffs: { strength: 4, defence: 2 },           desc: 'Pull big weight off the floor.' },
  { id: 'punching',    name: 'Punching Bag',      emoji: '', energy: 3, cost: 160,  buffs: { speed: 2 },                          desc: 'Footwork and snap.' },
  { id: 'speed_bag',   name: 'Speed Bag',         emoji: '', energy: 3, cost: 220,  buffs: { speed: 3 },                          desc: 'Hand-eye coordination drill.' },
  { id: 'treadmill',   name: 'Treadmill',         emoji: '', energy: 4, cost: 260,  buffs: { speed: 2, defence: 1 },              desc: 'Cardio for stamina and burst speed.' },
  { id: 'heavy_bag',   name: 'Heavy Bag',         emoji: '', energy: 5, cost: 320,  buffs: { strength: 2, speed: 2 },             desc: 'Power and footwork together.' },
  { id: 'def_drills',  name: 'Defensive Drills',  emoji: '', energy: 4, cost: 260,  buffs: { defence: 3 },                        desc: 'Slip, block, parry — take a hit.' },
  { id: 'cross_train', name: 'Cross-Training',    emoji: '', energy: 8, cost: 850,  buffs: { strength: 2, defence: 2, speed: 2 }, desc: 'All-round circuit. Expensive and exhausting.' },
];

// Shooting range drills — consume rounds of the equipped weapon's ammo type.
// Train accuracy (a temp buff that affects ranged hit chance in combat).
export const RANGE_DRILLS = [
  { id: 'plinking',    name: 'Plinking',         emoji: '', energy: 2, ammo: 8,  buff: 1,  desc: 'Casual target practice with paper sheets.' },
  { id: 'quick_draw',  name: 'Quick Draw',       emoji: '', energy: 3, ammo: 15, buff: 3,  desc: 'Speed drills — holster to target.' },
  { id: 'steady_aim',  name: 'Steady Aim',       emoji: '', energy: 4, ammo: 25, buff: 5,  desc: 'Slow, controlled shooting at static targets.' },
  { id: 'marksman',    name: 'Marksman Course',  emoji: '', energy: 6, ammo: 50, buff: 9,  desc: 'Long-range precision, varied positions.' },
  { id: 'sniper_ex',   name: 'Sniper Exercises', emoji: '', energy: 8, ammo: 80, buff: 14, desc: 'Advanced extended-range work.' },
];

// University courses — permanent intelligence gain. Cost scales with current
// intelligence so each subsequent point is more expensive. Each course has
// a long cooldown to prevent spam — bigger gains take much longer.
export const UNIVERSITY_COURSES = [
  { id: 'online',     name: 'Online Course',       emoji: '',  energy: 4,  baseCost: 80,   gain: 1, cooldownSec: 4 * 3600,    desc: 'Self-paced, cheap, slow gains.' },             // 4h
  { id: 'community',  name: 'Community College',   emoji: '',  energy: 6,  baseCost: 280,  gain: 2, cooldownSec: 12 * 3600,   desc: 'Two-year programme crammed into one session.' },// 12h
  { id: 'university', name: 'University Lectures', emoji: '',  energy: 9,  baseCost: 800,  gain: 4, cooldownSec: 24 * 3600,   desc: 'Top-tier institution, real depth.' },           // 1 day
  { id: 'private',    name: 'Private Tutor',       emoji: '',  energy: 12, baseCost: 2200, gain: 7, cooldownSec: 72 * 3600,   desc: 'One-on-one with a specialist.' },               // 3 days
];

// Using your own stash. Drug effects mirror their street appeal — heroin = bliss + crash, meth = wired but miserable.
// Stronger effects come with longer cooldowns. No addiction model yet — easy to add later.
export const DRUG_USE_EFFECTS = {
  weed:    { effects: { happiness: 15, nerve: 2 },                    cooldownMin: 30 },
  mdma:    { effects: { happiness: 30, energy: 20 },                  cooldownMin: 90 },
  cocaine: { effects: { nerve: 8, energy: 25 },                       cooldownMin: 60 },
  meth:    { effects: { nerve: 5, energy: 40, happiness: -8 },        cooldownMin: 120 },
  heroin:  { effects: { happiness: 50, energy: -10 },                 cooldownMin: 180 },
};

export const RANKS = [
  { rep: 0,    name: 'Nobody'        },
  { rep: 100,  name: 'Hustler'       },
  { rep: 300,  name: 'Associate'     },
  { rep: 800,  name: 'Soldier'       },
  { rep: 2000, name: 'Made Man'      },
  { rep: 5000, name: 'Capo'          },
  { rep: 12000,name: 'Underboss'     },
  { rep: 30000,name: 'Boss'          },
  { rep: 80000,name: 'Kingpin'       },
];

// Helpers
export const byId = (arr, id) => arr.find(x => x.id === id);
export const cityById = id => byId(CITIES, id);
export const crimeById = id => byId(CRIMES, id);
export const drugById = id => byId(DRUGS, id);
export const weaponById = id => byId(WEAPONS, id);
export const armourById = id => byId(ARMOUR, id);
export const businessById = id => byId(BUSINESSES, id);
export const propertyById = id => byId(PROPERTIES, id);
export const stockById = id => byId(STOCKS, id);
export const enemyById = id => byId(ENEMIES, id);
export const ammoById = id => byId(AMMO, id);

export function rankFor(rep) {
  let r = RANKS[0];
  for (const x of RANKS) if (rep >= x.rep) r = x;
  return r;
}

// XP curve: level n requires 100 * n^1.5 XP from level n
export function xpForNext(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

// Permanent stat caps. Set just above the highest gate that gameplay asks
// for (executive job needs intelligence 100; bouncer/trainer top out at
// strength 25, defence 20, speed 20). Once at cap, the gym still applies
// its temporary buff but stops accruing permanent progress, and the
// university refuses to sell more courses.
// Gang levels — leaders spend the treasury to climb the ladder.
// Each level applies a perk and unlocks the next. Costs escalate
// fast so even an active gang takes weeks to top out.
//
// Perks listed here are referenced by the rest of the codebase;
// some are cosmetic, others integrate with the existing systems
// via specPerk-style queries (see gangPerk).
export const GANG_LEVELS = [
  { level: 1,  cost: 0,         perk: 'Founding tier — every gang starts here.' },
  { level: 2,  cost: 100_000,   perk: '+1 maximum member slot.' },
  { level: 3,  cost: 300_000,   perk: '+5% turf-bonus modifier when your gang holds territory.' },
  { level: 4,  cost: 1_000_000, perk: 'Gang chat is persistent across sessions; broadcast to all members.' },
  { level: 5,  cost: 3_000_000, perk: 'Free hospital treatment in turf cities for every member.' },
  { level: 6,  cost: 10_000_000, perk: '+1 officer slot (third lieutenant).' },
  { level: 7,  cost: 30_000_000, perk: 'Gang fence rate +5% (75% → 80%) when laundering in turf cities.' },
  { level: 8,  cost: 100_000_000, perk: '+5 garage slots in every turf city, shared across members.' },
  { level: 9,  cost: 300_000_000, perk: 'Unlock a faction-leader-only OC heist with a 10× payout band.' },
  { level: 10, cost: 1_000_000_000, perk: '★ Cartel — gang-wide cosmetic prestige and a permanent +5% to all members\' crime payouts.' },
];

export function gangLevelMeta(level) {
  return GANG_LEVELS.find(l => l.level === level) || GANG_LEVELS[0];
}
export function nextGangLevelMeta(level) {
  return GANG_LEVELS.find(l => l.level === level + 1) || null;
}

// Specialisation paths — picked at level 25, locked in for life
// (cleared on prestige / retire). Five nodes each, auto-unlocked by
// level: 25 / 35 / 50 / 65 / 80. Effects are passive multipliers
// the rest of the codebase consults via specPerk(ch, effect).
//
// Effect ids must be unique across the whole catalogue; multiple
// nodes of the same effect would sum, but we don't currently have any.
export const SPECIALISATIONS = [
  {
    id: 'wheelman',
    name: 'Wheelman',
    blurb: 'Behind the wheel — faster, smoother, harder to catch.',
    palette: 'gold',
    nodes: [
      { level: 25, name: 'Heavy foot',     effect: 'drive_condition_pct', value: -0.20, blurb: '-20% condition cost on inter-city drives.' },
      { level: 35, name: 'Smooth shifter', effect: 'race_winchance_pct',  value: 0.05,  blurb: '+5% street-race win odds.' },
      { level: 50, name: 'Hot wire',       effect: 'gta_payout_pct',      value: 0.25,  blurb: '+25% GTA crime stolen-car book value.' },
      { level: 65, name: 'Auto haulier',   effect: 'free_shipping',       value: 1,     blurb: 'Vehicle shipping is free.' },
      { level: 80, name: 'Customs runner', effect: 'no_customs',          value: 1,     blurb: 'Customs never seizes drugs at the airport.' },
    ],
  },
  {
    id: 'cleaner',
    name: 'Cleaner',
    blurb: 'Discreet, careful, immaculate. Less risk, less heat.',
    palette: 'money',
    nodes: [
      { level: 25, name: 'Trusted fence',  effect: 'fence_rate_bonus',    value: 0.05,  blurb: '+5% fence conversion rate (70% → 75%).' },
      { level: 35, name: 'Buyer reads',    effect: 'drug_bust_pct',       value: -0.25, blurb: '-25% drug-sell bust chance.' },
      { level: 50, name: 'Soaped lock',    effect: 'jail_escape_bonus',   value: 0.15,  blurb: '+15% jail escape success (50% → 65%).' },
      { level: 65, name: 'Iron lung',      effect: 'energy_regen_pct',    value: 0.25,  blurb: '+25% faster energy regen.' },
      { level: 80, name: 'Doctor in pocket', effect: 'hospital_cost_pct', value: -0.5,  blurb: '-50% hospital fees.' },
    ],
  },
  {
    id: 'boss',
    name: 'Boss',
    blurb: "You don't pull the trigger. You point.",
    palette: 'blood',
    nodes: [
      { level: 25, name: 'Lieutenant', effect: 'gang_treasury_share',  value: 0.25,  blurb: '+25% gang treasury share earned from your crimes.' },
      { level: 35, name: 'Earner',     effect: 'turf_bonus_mul',       value: 0.20,  blurb: '+20% bonus on turf-aligned income.' },
      { level: 50, name: 'Captain',    effect: 'gang_crime_cooldown',  value: -0.30, blurb: '-30% cooldown on gang-flagged crimes.' },
      { level: 65, name: 'Diplomat',   effect: 'faction_rep_mul',      value: 0.50,  blurb: '+50% faction-reputation gain.' },
      { level: 80, name: 'Don',        effect: 'oc_crew_slot',         value: 1,     blurb: '+1 OC heist crew slot.' },
    ],
  },
  {
    id: 'hacker',
    name: 'Hacker',
    blurb: 'Brain over brawn. Wires, screens, money.',
    palette: 'gold',
    nodes: [
      { level: 25, name: 'Quick fingers',  effect: 'cyber_payout_pct',    value: 0.15,  blurb: '+15% cyber crime payouts.' },
      { level: 35, name: 'Nightowl',       effect: 'cyber_cooldown_pct',  value: -0.25, blurb: '-25% cyber crime cooldowns.' },
      { level: 50, name: 'Inside source',  effect: 'contract_refresh_h',  value: 12,    blurb: 'Daily contract refreshes every 12h instead of 24h.' },
      { level: 65, name: 'Mainline',       effect: 'cyber_xp_mul',        value: 0.5,   blurb: '+50% XP from cyber crimes.' },
      { level: 80, name: 'Air gap',        effect: 'no_loan_compounding', value: 1,     blurb: 'Bank loans stop compounding when overdue.' },
    ],
  },
];

// Returns the cumulative value of every unlocked node with `effect` for
// the character's chosen path. Returns 0 when no path or no node matches
// (i.e. effect is harmless to consult anywhere — multiply or add freely).
export function specPerk(ch, effect) {
  if (!ch?.specialisation) return 0;
  const path = SPECIALISATIONS.find(p => p.id === ch.specialisation);
  if (!path) return 0;
  let sum = 0;
  for (const n of path.nodes) {
    if ((ch.level || 1) >= n.level && n.effect === effect) sum += n.value;
  }
  return sum;
}

export const STAT_CAPS = {
  strength:     35,
  defence:      30,
  speed:        30,
  intelligence: 110,
  driving:      80,
};

// Driving School — permanent gains to the `driving` stat. Same shape
// as UNIVERSITY_COURSES so the client can render them with one
// component. No temporary buffs; everything you earn here is forever.
export const DRIVING_COURSES = [
  { id: 'theory',  name: 'Theory Test',     emoji: '', energy: 3,  baseCost: 60,    gain: 1, cooldownSec: 4 * 3600,   desc: 'Highway code from the comfort of your phone.' },
  { id: 'lessons', name: 'Driving Lessons', emoji: '', energy: 5,  baseCost: 220,   gain: 2, cooldownSec: 12 * 3600,  desc: 'A patient instructor and a sensible saloon.' },
  { id: 'track',   name: 'Track Day',       emoji: '', energy: 9,  baseCost: 800,   gain: 4, cooldownSec: 24 * 3600,  desc: 'Apex hunting at a private circuit.' },
  { id: 'pro',     name: 'Pro Coaching',    emoji: '', energy: 12, baseCost: 2200,  gain: 7, cooldownSec: 72 * 3600,  desc: 'One-on-one with an ex-F1 driver.' },
];

//  Fight Club moves 
// Each turn the player picks one move; the enemy AI rolls its own from a
// weighted distribution. `dmgMul` scales (strength + weapon.dmg). `hit`
// is the base hit chance (further nudged by speed differential). `crit`
// rolls only on a successful hit and doubles the damage. `block` is the
// only defensive move — skips the player's attack but halves incoming
// damage on the enemy's reply.
export const COMBAT_MOVES = [
  { id: 'jab',      name: 'Jab',      emoji: '',  dmgMul: 0.6,  hit: 0.95, crit: 0.05, desc: 'Quick and almost always lands.' },
  { id: 'cross',    name: 'Cross',    emoji: '',  dmgMul: 0.85, hit: 0.85, crit: 0.10, desc: 'A solid straight punch.' },
  { id: 'hook',     name: 'Hook',     emoji: '',  dmgMul: 1.10, hit: 0.75, crit: 0.15, desc: 'Wider arc, harder hit.' },
  { id: 'uppercut', name: 'Uppercut', emoji: '',  dmgMul: 1.30, hit: 0.65, crit: 0.20, desc: 'Comes from below — easy to miss, brutal when it lands.' },
  { id: 'haymaker', name: 'Haymaker', emoji: '',  dmgMul: 1.60, hit: 0.50, crit: 0.30, desc: 'All-in. Telegraphed, devastating, rarely connects.' },
  { id: 'block',    name: 'Block',    emoji: '',  dmgMul: 0,    hit: 1.00, crit: 0,    desc: 'Brace. Skip your attack, take 50% reduced damage on reply.', defensive: true },
];

export const moveById = id => byId(COMBAT_MOVES, id);

// Enemy AI move distribution — favours mid-tier punches with the
// occasional heavy swing. Same weights for every enemy for now; tunable
// per-enemy later if combat needs more flavour.
export const ENEMY_MOVE_WEIGHTS = [
  ['jab', 30], ['cross', 30], ['hook', 20], ['uppercut', 12], ['haymaker', 8],
];

// Crime cooldown — uses the formula by default, but a `cooldownSec` field
// on the crime entry overrides it. Top-tier crimes set explicit hours-long
// cooldowns to stop end-game players hammering them for runaway income.
export function crimeCooldownSec(crime) {
  if (crime.cooldownSec) return crime.cooldownSec;
  const lvl = crime.level || 1;
  return Math.max(30, Math.round(20 + Math.pow(lvl, 1.6) * 4));
}

// Crime requirements — items the player must hold in inventory to commit
// the crime. See services/items.js for the consumption logic. Returns []
// for crimes that don't gate on items so callers don't need null checks.
export function crimeRequirements(crime) {
  return Array.isArray(crime?.requires) ? crime.requires : [];
}

//  General Store: miscellaneous items 
//
// `kind = 'misc'` rows in the inventory table. Most are mission props with
// no direct effect; a few have light vital effects so the page is useful
// outside missions. `effects` applies to vitals on /use; `oneShotCash`
// describes a randomised cash payout (lottery scratchers).
// `wholesale_only: true` items aren't shown in Murphy's General Store —
// they're stocked exclusively via the player-shop wholesaler at 60% of
// `cost`. Shop owners then resell at any retail price they choose.
// Mission props (lockpicks, gas cans, burner phones, etc.) stay in
// Murphy's so they don't get bottlenecked behind the player economy.
export const MISC_ITEMS = [
  //  Consumables — wholesaler-only, sold by player shops 
  { id: 'flowers',         name: 'Bouquet of Flowers', emoji: '', cost: 35,  desc: 'A cheap mood-lifter. Use to bump happiness.',  effects: { happiness: 5 },             wholesale_only: true },
  { id: 'chocolate_box',   name: 'Box of Chocolates',  emoji: '', cost: 80,  desc: 'A small indulgence.',                          effects: { happiness: 8 },             wholesale_only: true },
  { id: 'coffee',          name: 'Espresso Shot',      emoji: '', cost: 60,  desc: 'A jolt of caffeine to keep you grinding.',     effects: { energy: 10 },               wholesale_only: true },
  { id: 'energy_drink',    name: 'Energy Drink',       emoji: '', cost: 120, desc: 'Sugar and taurine in a can.',                  effects: { energy: 18 },               wholesale_only: true },
  { id: 'cigar',           name: 'Cuban Cigar',        emoji: '', cost: 90,  desc: 'Steadies your hand for the next move.',        effects: { nerve: 2, happiness: 4 },    wholesale_only: true },
  { id: 'whisky',          name: 'Single Malt',        emoji: '', cost: 160, desc: 'Fortifies your spirit, dents your liver.',     effects: { nerve: 3, happiness: 6, health: -3 }, wholesale_only: true },
  { id: 'sandwich',        name: 'Deli Sandwich',      emoji: '', cost: 50,  desc: 'A proper feed.',                               effects: { health: 8, happiness: 3 },   wholesale_only: true },
  { id: 'painkillers',     name: 'Painkillers',        emoji: '', cost: 140, desc: 'Knocks the edge off a beating.',               effects: { health: 18 },                wholesale_only: true },
  { id: 'lottery_ticket',  name: 'Lottery Scratcher',  emoji: '', cost: 50,  desc: 'Scratch & pray. Prizes from £50 all the way up to a £100,000 jackpot.',
    // Tiered weighted draw — see /general-store /use. Long-run EV is
    // £46.50, ~7% under the £50 ticket price, so the house edges ahead
    // over time while still giving players plenty of small wins and a
    // genuine (if microscopic) shot at the jackpot.
    prizes: [
      { chance: 0.50000, amount: 0      },
      { chance: 0.30060, amount: 50     },  // money back
      { chance: 0.08000, amount: 60     },
      { chance: 0.04000, amount: 70     },
      { chance: 0.02500, amount: 80     },
      { chance: 0.01800, amount: 90     },
      { chance: 0.01500, amount: 100    },
      { chance: 0.00800, amount: 200    },
      { chance: 0.00500, amount: 250    },
      { chance: 0.00300, amount: 300    },
      { chance: 0.00200, amount: 500    },
      { chance: 0.00150, amount: 1000   },
      { chance: 0.00100, amount: 2000   },
      { chance: 0.00050, amount: 5000   },
      { chance: 0.00025, amount: 10000  },
      { chance: 0.00010, amount: 25000  },
      { chance: 0.00004, amount: 50000  },
      { chance: 0.00001, amount: 100000 },
    ] },
  //  Crime tools — single-use props consumed when committing certain crimes 
  { id: 'atm_skimmer',     name: 'ATM Skimmer',        emoji: '', cost: 600, desc: 'Card-cloning rig glued over an ATM\'s reader. Consumed on use.', crimeTool: true },

  { id: 'lockpick_set',    name: 'Lockpick Set',       emoji: '', cost: 180, desc: 'Required for some jobs. Single-use.',          missionOnly: true },
  { id: 'burner_phone',    name: 'Burner Phone',       emoji: '', cost: 120, desc: 'Untraceable. Burned after one call.',          missionOnly: true },
  { id: 'duct_tape',       name: 'Duct Tape',          emoji: '', cost: 40,  desc: 'Holds the world together.',                    missionOnly: true },
  { id: 'gloves',          name: 'Leather Gloves',     emoji: '', cost: 80,  desc: 'No fingerprints, no problems.',                missionOnly: true },
  { id: 'ski_mask',        name: 'Ski Mask',           emoji: '', cost: 150, desc: 'For when subtlety is overrated.',              missionOnly: true },
  { id: 'zip_ties',        name: 'Zip Ties',           emoji: '', cost: 40,  desc: 'For uncooperative bystanders.',                missionOnly: true },
  { id: 'flashlight',      name: 'Tactical Flashlight',emoji: '', cost: 60,  desc: 'Dark places, bright ideas.',                   missionOnly: true },
  { id: 'gas_can',         name: 'Gas Can',            emoji: '', cost: 100, desc: 'Combustible. Not for the squeamish.',          missionOnly: true },
  { id: 'usb_drive',       name: 'USB Drive',          emoji: '', cost: 150, desc: 'Encrypted payload, ready to drop.',            missionOnly: true },

  //  Wholesale-only consumables (expansion) 
  { id: 'protein_shake',  name: 'Protein Shake',       emoji: '', cost: 110, desc: 'Post-gym fuel.',                           effects: { energy: 12, happiness: 2 },        wholesale_only: true },
  { id: 'pizza_slice',    name: 'Pizza Slice',         emoji: '', cost: 70,  desc: 'Greasy, glorious, immediate.',             effects: { energy: 6, happiness: 6 },          wholesale_only: true },
  { id: 'sushi_box',      name: 'Sushi Box',           emoji: '', cost: 220, desc: 'Premium fuel for the discerning hood.',    effects: { health: 6, energy: 8, happiness: 8 }, wholesale_only: true },
  { id: 'kebab',          name: 'Late-Night Kebab',    emoji: '', cost: 90,  desc: 'Soaks up the night.',                      effects: { energy: 8, happiness: 4 },          wholesale_only: true },
  { id: 'donut',          name: 'Glazed Donut',        emoji: '', cost: 30,  desc: 'Cop bait.',                                 effects: { energy: 4, happiness: 3 },          wholesale_only: true },
  { id: 'champagne_b',    name: 'Bottle of Champagne', emoji: '', cost: 800, desc: 'For the close of a big deal.',             effects: { happiness: 25, nerve: 2, health: -2 }, wholesale_only: true },
  { id: 'beer_six',       name: 'Six-Pack of Beer',    emoji: '', cost: 180, desc: 'Liquid courage at scale.',                 effects: { happiness: 10, nerve: 1 },          wholesale_only: true },
  { id: 'tequila',        name: 'Bottle of Tequila',   emoji: '', cost: 320, desc: 'For when whisky is too refined.',          effects: { nerve: 4, happiness: 8, health: -4 }, wholesale_only: true },
  { id: 'caviar',         name: 'Tin of Caviar',       emoji: '', cost: 1500, desc: 'Pure flex.',                              effects: { happiness: 35 },                    wholesale_only: true },
  { id: 'pre_workout',    name: 'Pre-Workout',         emoji: '', cost: 220, desc: 'Cracks open the throttle on your training.', effects: { energy: 26, nerve: 0 },           wholesale_only: true },
  { id: 'first_aid',      name: 'First Aid Kit',       emoji: '', cost: 380, desc: 'Patch yourself up after the alley scrap.', effects: { health: 35 },                       wholesale_only: true },
  { id: 'adrenaline',     name: 'Adrenaline Shot',     emoji: '', cost: 600, desc: 'Bring it.',                                 effects: { nerve: 6, health: 12 },             wholesale_only: true },
  { id: 'vitamins',       name: 'Daily Vitamins',      emoji: '', cost: 45,  desc: 'A small but consistent edge.',             effects: { health: 4, energy: 4 },             wholesale_only: true },
  { id: 'condoms',        name: 'Pack of Condoms',     emoji: '', cost: 25,  desc: 'A man\'s gotta plan.',                      effects: { happiness: 3 },                    wholesale_only: true },
  { id: 'concert_ticket', name: 'Concert Ticket',      emoji: '', cost: 250, desc: 'Two hours of glorious noise.',             effects: { happiness: 20 },                    wholesale_only: true },
  { id: 'movie_ticket',   name: 'Movie Ticket',        emoji: '', cost: 60,  desc: 'A bit of escapism.',                       effects: { happiness: 8 },                     wholesale_only: true },
  { id: 'spa_day',        name: 'Spa Day Voucher',     emoji: '', cost: 700, desc: 'Reset the body and mind.',                 effects: { happiness: 25, energy: 12, health: 12 }, wholesale_only: true },
  { id: 'massage',        name: 'Deep Tissue Massage', emoji: '', cost: 380, desc: 'Knots out, focus in.',                     effects: { health: 10, happiness: 14 },        wholesale_only: true },
  { id: 'sleeping_pills', name: 'Sleeping Pills',      emoji: '', cost: 90,  desc: 'Reset the energy meter.',                  effects: { energy: 35, happiness: -2 },        wholesale_only: true },
  { id: 'gym_membership', name: 'Day Pass — Iron Foundry', emoji: '', cost: 320, desc: 'Walk in fresh.',                effects: { energy: 18, health: 4 },            wholesale_only: true },

  //  New mission props (Murphy's catalogue) 
  { id: 'bolt_cutters',   name: 'Bolt Cutters',        emoji: '',  cost: 220, desc: 'Padlocks, fences, gates.',                missionOnly: true },
  { id: 'ski_goggles',    name: 'Ski Goggles',         emoji: '', cost: 90,  desc: 'For when the masks aren\'t enough.',       missionOnly: true },
  { id: 'rope',           name: 'Climbing Rope',       emoji: '', cost: 60,  desc: 'Fire-escape special.',                     missionOnly: true },
  { id: 'walkie',         name: 'Walkie-Talkie',       emoji: '', cost: 140, desc: 'Comms for the crew.',                       missionOnly: true },
  { id: 'fake_id',        name: 'Fake ID',             emoji: '', cost: 250, desc: 'New name, new face on paper.',             missionOnly: true },
  { id: 'cash_bag',       name: 'Money Bag',           emoji: '', cost: 30,  desc: 'For the cinematic getaway.',                missionOnly: true },
  { id: 'pry_bar',        name: 'Pry Bar',             emoji: '', cost: 80,  desc: 'Doors, windows, vending machines.',         missionOnly: true },
  { id: 'wire_cutters',   name: 'Wire Cutters',        emoji: '',  cost: 60,  desc: 'For alarm wires and other inconveniences.', missionOnly: true },
  { id: 'silencer',       name: 'Suppressor',          emoji: '', cost: 380, desc: 'For when subtlety is required.',           missionOnly: true },
  { id: 'crowbar2',       name: 'Crowbar',             emoji: '', cost: 120, desc: 'Old reliable.',                             missionOnly: true },

  //  Big-money one-shot prizes (rare expansion) 
  { id: 'scratch_gold',   name: 'Gold Scratcher',      emoji: '', cost: 250, desc: 'Premium card. £0 to £500,000 jackpot.',
    prizes: [
      { chance: 0.50000, amount: 0      },
      { chance: 0.30000, amount: 250    },
      { chance: 0.10000, amount: 500    },
      { chance: 0.05000, amount: 1000   },
      { chance: 0.03000, amount: 2500   },
      { chance: 0.01500, amount: 5000   },
      { chance: 0.00400, amount: 25000  },
      { chance: 0.00099, amount: 100000 },
      { chance: 0.00001, amount: 500000 },
    ] },
];

export const miscItemById = id => byId(MISC_ITEMS, id);

//  Player shops 
//
// Single-size, no rent, no slot cap. Friction is the upfront founding
// cost + the 5% sales tax skimmed off every sale. Identical items
// (same kind + item_id) stack into a single listing line, so a shop
// with 1,000 coffees still shows just one row.
export const SHOP_FOUNDING_COST = 10000;
// 5% sales tax disappears at every shop sale. Pure money-sink.
export const SHOP_SALES_TAX_PCT = 0.05;
// Wholesaler price is this fraction of base retail cost.
export const WHOLESALE_PRICE_PCT = 0.60;
// Maximum player businesses per character per city.
export const PLAYER_BIZ_PER_CITY_MAX = 5;
// Shop name length bounds.
export const SHOP_NAME_MIN = 3;
export const SHOP_NAME_MAX = 32;
// Optional shop description (newspaper-ad style blurb).
export const SHOP_DESC_MAX = 280;

//  Weapon customisation (Phase 2) 
//
// Each mod targets a specific slot and is compatible with one or more
// weapon categories. Stat deltas are applied additively on top of the
// base weapon's `dmg`. Cost is the install price (one-time, not refunded
// on uninstall). Paint mods are cosmetic-only — no stat delta, but the
// custom name appears in your loadout.
//
// Slots:
//   barrel    — biggest dmg lever
//   scope     — accuracy / dmg trade-offs (small)
//   magazine  — minor dmg or capacity-style buffs
//   grip      — small all-round bonus
//   paint     — cosmetic only
//
// Compatibility uses the `categories` field — any weapon whose
// `category` (from WEAPONS) is in the mod's list can wear it.
export const WEAPON_MOD_SLOTS = ['barrel', 'scope', 'magazine', 'grip', 'paint'];

export const WEAPON_MOD_CATALOGUE = [
  //  Pistols (and revolvers share their barrel/grip/paint mods) 
  { id: 'barrel_pistol_compact',  slot: 'barrel',   name: 'Compact Pistol Barrel',   emoji: '', cost: 600,   compat: ['pistol'],                       stats: { dmg: -1, accuracy: 6 } },
  { id: 'barrel_pistol_long',     slot: 'barrel',   name: 'Long Pistol Barrel',      emoji: '', cost: 850,   compat: ['pistol'],                       stats: { dmg: 3 } },
  { id: 'barrel_pistol_threaded', slot: 'barrel',   name: 'Threaded Pistol Barrel',  emoji: '', cost: 1200,  compat: ['pistol'],                       stats: { dmg: 1, accuracy: 2 } },
  { id: 'barrel_revolver_match',  slot: 'barrel',   name: 'Match-Grade Revolver Barrel', emoji: '', cost: 1400, compat: ['revolver'],                  stats: { dmg: 4, accuracy: 3 } },

  //  SMGs 
  { id: 'barrel_smg_compensator', slot: 'barrel',   name: 'SMG Compensator',         emoji: '', cost: 1100,  compat: ['smg'],                          stats: { dmg: 2, accuracy: 3 } },
  { id: 'barrel_smg_flash',       slot: 'barrel',   name: 'Flash Hider (SMG)',       emoji: '', cost: 900,   compat: ['smg'],                          stats: { dmg: 1, accuracy: 2 } },

  //  Shotguns 
  { id: 'barrel_shotgun_choke',   slot: 'barrel',   name: 'Choke Tube',              emoji: '', cost: 800,   compat: ['shotgun'],                      stats: { dmg: 2, accuracy: 4 } },
  { id: 'barrel_shotgun_sawn',    slot: 'barrel',   name: 'Sawn-off Conversion',     emoji: '', cost: 600,   compat: ['shotgun'],                      stats: { dmg: 5, accuracy: -4 } },

  //  Rifles 
  { id: 'barrel_rifle_heavy',     slot: 'barrel',   name: 'Heavy Rifle Barrel',      emoji: '', cost: 2200,  compat: ['rifle'],                        stats: { dmg: 6 } },
  { id: 'barrel_rifle_bull',      slot: 'barrel',   name: 'Bull Barrel (Rifle)',     emoji: '', cost: 2500,  compat: ['rifle'],                        stats: { dmg: 3, accuracy: 5 } },
  { id: 'barrel_rifle_threaded',  slot: 'barrel',   name: 'Threaded Rifle Barrel',   emoji: '', cost: 2000,  compat: ['rifle'],                        stats: { dmg: 2, accuracy: 2 } },

  //  Snipers 
  { id: 'barrel_sniper_match',    slot: 'barrel',   name: 'Match Sniper Barrel',     emoji: '', cost: 6000,  compat: ['sniper'],                       stats: { dmg: 10, accuracy: 4 } },
  { id: 'barrel_sniper_fluted',   slot: 'barrel',   name: 'Fluted Sniper Barrel',    emoji: '', cost: 5000,  compat: ['sniper'],                       stats: { dmg: 6, accuracy: 6 } },

  //  Scopes 
  { id: 'scope_micro_red_dot', slot: 'scope', name: 'Micro Red Dot',          emoji: '', cost: 600,  compat: ['pistol', 'smg', 'shotgun'],     stats: { accuracy: 5 } },
  { id: 'scope_reflex',        slot: 'scope', name: 'Reflex Sight',           emoji: '', cost: 1000, compat: ['pistol', 'smg', 'shotgun', 'rifle'], stats: { accuracy: 7 } },
  { id: 'scope_acog',          slot: 'scope', name: '4× ACOG',                emoji: '', cost: 2200, compat: ['rifle', 'sniper'],              stats: { dmg: 1, accuracy: 9 } },
  { id: 'scope_holographic',   slot: 'scope', name: 'Holographic Sight',      emoji: '', cost: 1500, compat: ['rifle', 'shotgun', 'smg'],      stats: { accuracy: 8 } },
  { id: 'scope_long_range',    slot: 'scope', name: '12× Long-Range Scope',   emoji: '', cost: 3500, compat: ['sniper'],                       stats: { dmg: 2, accuracy: 12 } },
  { id: 'scope_thermal',       slot: 'scope', name: 'Thermal Scope',          emoji: '', cost: 8000, compat: ['rifle', 'sniper'],              stats: { dmg: 3, accuracy: 10 } },

  //  Magazines 
  { id: 'mag_extended_pistol', slot: 'magazine', name: 'Extended Pistol Mag', emoji: '', cost: 350,  compat: ['pistol'],                          stats: { dmg: 1 } },
  { id: 'mag_extended_smg',    slot: 'magazine', name: 'Extended SMG Mag',    emoji: '', cost: 450,  compat: ['smg'],                             stats: { dmg: 1 } },
  { id: 'mag_drum_smg',        slot: 'magazine', name: 'SMG Drum Mag',        emoji: '', cost: 1200, compat: ['smg'],                             stats: { dmg: 2 } },
  { id: 'mag_extended_rifle',  slot: 'magazine', name: 'Extended Rifle Mag',  emoji: '', cost: 600,  compat: ['rifle'],                           stats: { dmg: 2 } },
  { id: 'mag_drum_rifle',      slot: 'magazine', name: 'Rifle Drum Mag',      emoji: '', cost: 1800, compat: ['rifle'],                           stats: { dmg: 3 } },
  { id: 'mag_tube_shotgun',    slot: 'magazine', name: 'Shotgun Tube Ext.',   emoji: '', cost: 700,  compat: ['shotgun'],                         stats: { dmg: 2 } },
  { id: 'mag_speedloader',     slot: 'magazine', name: 'Speedloader',         emoji: '', cost: 400,  compat: ['revolver'],                        stats: { dmg: 1 } },
  { id: 'mag_extended_sniper', slot: 'magazine', name: 'Extended Sniper Mag', emoji: '', cost: 2400, compat: ['sniper'],                          stats: { dmg: 3 } },

  //  Grips (most categories share) 
  { id: 'grip_rubber',         slot: 'grip', name: 'Rubber Grip',           emoji: '', cost: 250,  compat: ['pistol', 'revolver'],            stats: { accuracy: 3 } },
  { id: 'grip_hogue',          slot: 'grip', name: 'Hogue Grip',            emoji: '', cost: 450,  compat: ['pistol', 'revolver'],            stats: { accuracy: 5 } },
  { id: 'grip_vertical',       slot: 'grip', name: 'Vertical Foregrip',     emoji: '', cost: 600,  compat: ['rifle', 'smg', 'shotgun'],       stats: { accuracy: 4 } },
  { id: 'grip_angled',         slot: 'grip', name: 'Angled Foregrip',       emoji: '', cost: 700,  compat: ['rifle', 'smg', 'shotgun'],       stats: { accuracy: 5 } },
  { id: 'grip_bipod',          slot: 'grip', name: 'Bipod',                 emoji: '', cost: 1500, compat: ['rifle', 'sniper'],               stats: { accuracy: 8 } },
  { id: 'grip_wrapped_melee',  slot: 'grip', name: 'Wrapped Grip',          emoji: '', cost: 200,  compat: ['melee'],                         stats: { dmg: 2 } },

  //  Paint (cosmetic, all categories) 
  { id: 'paint_matte_black',   slot: 'paint', name: 'Matte Black Finish',    emoji: '', cost: 150,  compat: ['pistol','revolver','smg','shotgun','rifle','sniper','melee'], stats: {} },
  { id: 'paint_stainless',     slot: 'paint', name: 'Stainless Steel',       emoji: '', cost: 200,  compat: ['pistol','revolver','smg','shotgun','rifle','sniper','melee'], stats: {} },
  { id: 'paint_gold',          slot: 'paint', name: 'Gold Plated',           emoji: '', cost: 5000, compat: ['pistol','revolver','smg','shotgun','rifle','sniper','melee'], stats: {} },
  { id: 'paint_camo',          slot: 'paint', name: 'Woodland Camo',         emoji: '', cost: 350,  compat: ['rifle','sniper','smg','shotgun'],                              stats: {} },
  { id: 'paint_skull',         slot: 'paint', name: 'Skull Engraving',       emoji: '', cost: 800,  compat: ['pistol','revolver','melee'],                                   stats: {} },
];

export const weaponModById = id => WEAPON_MOD_CATALOGUE.find(m => m.id === id) || null;

// All mods compatible with a specific weapon, given its category.
export function modsForWeapon(weapon) {
  if (!weapon) return [];
  return WEAPON_MOD_CATALOGUE.filter(m => m.compat.includes(weapon.category));
}

// Apply a mods_json map to the base weapon's stats. Returns a copy with
// `dmg` (+ deltas), `accuracy` (sum of mod accuracies, default 0), plus
// a `mods` array describing what's installed for the UI.
export function applyMods(baseWeapon, modsJson) {
  let mods = {};
  try { mods = JSON.parse(modsJson || '{}'); } catch {}
  const installed = [];
  let dmgDelta = 0;
  let accuracy = 0;
  for (const slot of WEAPON_MOD_SLOTS) {
    const id = mods[slot];
    if (!id) continue;
    const def = weaponModById(id);
    if (!def) continue;
    installed.push({ slot, id, name: def.name, emoji: def.emoji });
    dmgDelta += def.stats?.dmg || 0;
    accuracy += def.stats?.accuracy || 0;
  }
  return {
    ...baseWeapon,
    dmg: Math.max(1, (baseWeapon.dmg || 0) + dmgDelta),
    accuracy,           // additive; absent on stock weapons (treat as 0)
    is_modified: installed.length > 0,
    mods: installed,
  };
}

//  Vehicle customisation (Phase 2D) 
//
// Vehicle mods don't affect any combat/gameplay system — driving
// mechanics don't exist in this game. Their value is purely:
//   1. Cosmetic / showcase — players can flex modded cars on profiles
//   2. Resale boost — modded cars are stuck in the player economy (chop
//      shop and the dealer refuse them) and the owner can list them at
//      higher prices. Mod stats sum into a `bookPrice` boost.
//
// Compatibility is by `min_tier` — cheap mods fit any car; high-end
// mods need a tier-N+ vehicle. Vehicle tiers run 1 (beater) to 7 (hyper).
export const VEHICLE_MOD_SLOTS = ['engine', 'tires', 'paint', 'body', 'exhaust', 'interior'];

export const VEHICLE_MOD_CATALOGUE = [
  //  Engine 
  { id: 'engine_turbo',         slot: 'engine',  name: 'Turbocharger',     emoji: '', cost: 15000, min_tier: 3, stats: { power: 25, value: 18000 } },
  { id: 'engine_supercharger',  slot: 'engine',  name: 'Supercharger',     emoji: '', cost: 28000, min_tier: 4, stats: { power: 40, value: 32000 } },
  { id: 'engine_race_tune',     slot: 'engine',  name: 'Race ECU Tune',    emoji: '', cost: 50000, min_tier: 5, stats: { power: 60, value: 60000 } },
  { id: 'engine_swap_v8',       slot: 'engine',  name: 'V8 Engine Swap',   emoji: '', cost: 95000, min_tier: 5, stats: { power: 90, value: 110000 } },

  //  Tires 
  { id: 'tires_performance',    slot: 'tires',   name: 'Performance Tires', emoji: '', cost: 4000,  min_tier: 1, stats: { handling: 15, value: 5000 } },
  { id: 'tires_summer',         slot: 'tires',   name: 'Summer Slicks',    emoji: '', cost: 8000,  min_tier: 3, stats: { handling: 22, value: 9500 } },
  { id: 'tires_racing',         slot: 'tires',   name: 'Racing Slicks',    emoji: '', cost: 14000, min_tier: 4, stats: { handling: 32, value: 16000 } },
  { id: 'tires_offroad',        slot: 'tires',   name: 'Off-Road Tires',   emoji: '', cost: 6500,  min_tier: 1, stats: { handling: 12, value: 7000 } },

  //  Paint 
  { id: 'paint_matte_car',      slot: 'paint',   name: 'Matte Black',      emoji: '', cost: 6000,  min_tier: 1, stats: { value: 8000 } },
  { id: 'paint_pearl_white',    slot: 'paint',   name: 'Pearl White',      emoji: '', cost: 9000,  min_tier: 1, stats: { value: 12000 } },
  { id: 'paint_candy',          slot: 'paint',   name: 'Candy Red',        emoji: '', cost: 11000, min_tier: 1, stats: { value: 15000 } },
  { id: 'paint_chrome',         slot: 'paint',   name: 'Chrome Wrap',      emoji: '', cost: 30000, min_tier: 4, stats: { value: 40000 } },
  { id: 'paint_holo',           slot: 'paint',   name: 'Holographic Wrap', emoji: '', cost: 45000, min_tier: 5, stats: { value: 60000 } },

  //  Body 
  { id: 'body_lip',             slot: 'body',    name: 'Front Lip',        emoji: '', cost: 3000,  min_tier: 1, stats: { value: 4000 } },
  { id: 'body_spoiler',         slot: 'body',    name: 'Carbon Spoiler',   emoji: '', cost: 5500,  min_tier: 3, stats: { handling: 6, value: 8000 } },
  { id: 'body_widebody',        slot: 'body',    name: 'Wide-Body Kit',    emoji: '', cost: 22000, min_tier: 4, stats: { handling: 4, value: 28000 } },
  { id: 'body_roll_cage',       slot: 'body',    name: 'Steel Roll Cage',  emoji: '', cost: 8000,  min_tier: 1, stats: { value: 6000 } },
  { id: 'body_armor',           slot: 'body',    name: 'Armored Plating',  emoji: '', cost: 35000, min_tier: 3, stats: { value: 28000 } },

  //  Exhaust 
  { id: 'exhaust_pipes',        slot: 'exhaust', name: 'Straight Pipes',   emoji: '', cost: 3500,  min_tier: 1, stats: { power: 8, value: 4500 } },
  { id: 'exhaust_performance',  slot: 'exhaust', name: 'Performance Cat-Back', emoji: '', cost: 7500, min_tier: 2, stats: { power: 14, value: 10000 } },
  { id: 'exhaust_titanium',     slot: 'exhaust', name: 'Titanium Exhaust', emoji: '', cost: 14000, min_tier: 4, stats: { power: 18, value: 18000 } },

  //  Interior 
  { id: 'interior_leather',     slot: 'interior', name: 'Bespoke Leather',  emoji: '', cost: 8000,  min_tier: 2, stats: { value: 12000 } },
  { id: 'interior_alcantara',   slot: 'interior', name: 'Alcantara Trim',   emoji: '', cost: 12000, min_tier: 4, stats: { value: 18000 } },
  { id: 'interior_racing',      slot: 'interior', name: 'Racing Bucket Seats', emoji: '', cost: 5500,  min_tier: 3, stats: { handling: 8, value: 7000 } },
  { id: 'interior_sound',       slot: 'interior', name: 'Premium Sound System', emoji: '', cost: 7000,  min_tier: 1, stats: { value: 9500 } },
  { id: 'interior_carbon',      slot: 'interior', name: 'Carbon Fiber Trim', emoji: '', cost: 10000, min_tier: 4, stats: { value: 14000 } },
];

export const vehicleModById = id => VEHICLE_MOD_CATALOGUE.find(m => m.id === id) || null;

// All mods compatible with a given vehicle (tier-gated).
export function modsForVehicle(vehicle) {
  if (!vehicle) return [];
  const tier = vehicle.tier || 1;
  return VEHICLE_MOD_CATALOGUE.filter(m => tier >= (m.min_tier || 1));
}

// Apply a mods_json blob to the base vehicle. Returns a copy with
// power/handling totals, value-boosted bookPrice, and the installed
// mods array for the UI.
export function applyVehicleMods(vehicle, modsJson) {
  let mods = {};
  try { mods = JSON.parse(modsJson || '{}'); } catch {}
  const installed = [];
  let power = 0, handling = 0, valueDelta = 0;
  for (const slot of VEHICLE_MOD_SLOTS) {
    const id = mods[slot];
    if (!id) continue;
    const def = vehicleModById(id);
    if (!def) continue;
    installed.push({ slot, id, name: def.name, emoji: def.emoji });
    power += def.stats?.power || 0;
    handling += def.stats?.handling || 0;
    valueDelta += def.stats?.value || 0;
  }
  return {
    ...vehicle,
    power,
    handling,
    bookPrice: (vehicle.bookPrice || 0) + valueDelta,
    base_book_price: vehicle.bookPrice || 0,
    value_delta: valueDelta,
    is_modified: installed.length > 0,
    mods: installed,
  };
}

// Quick check: does this vehicle have any mods installed?
export function isVehicleModified(modsJson) {
  try {
    const m = JSON.parse(modsJson || '{}');
    return Object.keys(m).length > 0;
  } catch { return false; }
}

//  Player-to-player trades 
// Same 5% sink as shop sales — applied to cash flowing in either
// direction at trade completion. Items don't pay tax.
export const TRADE_TAX_PCT = 0.05;
// Auto-cancel an active trade if no activity for this long.
export const TRADE_IDLE_TTL_MS = 5 * 60 * 1000;
// Hard cap on items per side (prevents 1000-item denial-of-service offers).
export const TRADE_MAX_ITEMS_PER_SIDE = 20;
// Trade chat constraints.
export const TRADE_CHAT_MAX = 240;

// Wholesaler catalogue — everything in MISC_ITEMS flagged wholesale_only,
// priced at the wholesale percentage of base cost. Filtered server-side
// so the shape is consistent between this and the live response.
export function wholesaleCatalogue() {
  return MISC_ITEMS.filter(i => i.wholesale_only).map(i => ({
    id: i.id,
    name: i.name,
    emoji: i.emoji,
    desc: i.desc,
    effects: i.effects || null,
    base_cost: i.cost,
    wholesale_cost: Math.max(1, Math.floor(i.cost * WHOLESALE_PRICE_PCT)),
  }));
}

//  Daily Missions 
//
// Three are rolled per character per UTC day. `target` is the count required.
// `xp` and `cash` are at level 1 — both scale with character level on roll
// (see services/missions.js). `type` ties into bumpMission() calls scattered
// across the routes; some types accept a `meta` filter (e.g. specific item).
//
// `tier` is purely cosmetic ('easy' / 'med' / 'hard') and influences the
// roll mix — we always pick one of each tier for variety.
// Item-use missions (cracksman, ghost_caller, arsonist, data_drop) used
// to be over-tuned — players could just buy the prop for £100 and claim
// thousands of cash. Rewards now match the friction (≈ item cost).
export const DAILY_MISSIONS = [
  //  easy 
  { id: 'streetwise',  tier: 'easy', name: 'Streetwise',     emoji: '',  desc: 'Pull off 5 successful street-tier crimes.',          target: 5, type: 'crime_success', meta: { tier: 'street' }, xp: 60,  cash: 250  },
  { id: 'gym_rat',     tier: 'easy', name: 'Gym Rat',        emoji: '',  desc: 'Complete 3 gym training sessions.',                  target: 3, type: 'gym_session',                              xp: 50,  cash: 200  },
  { id: 'scholar',     tier: 'easy', name: 'Scholar',        emoji: '',  desc: 'Take 2 university courses.',                         target: 2, type: 'university_class',                         xp: 70,  cash: 250  },
  { id: 'prep_kit',    tier: 'easy', name: 'Prep Kit',       emoji: '',  desc: 'Use any 3 items from the General Store.',            target: 3, type: 'misc_use_any',                             xp: 40,  cash: 150  },
  { id: 'pickpocket',  tier: 'easy', name: 'Light Fingers',  emoji: '',  desc: 'Lift 8 wallets — street-tier crimes.',               target: 8, type: 'crime_success', meta: { tier: 'street' }, xp: 90,  cash: 350  },
  { id: 'gym_grinder', tier: 'easy', name: 'Iron Discipline',emoji: '', desc: 'Complete 6 gym sessions.',                        target: 6, type: 'gym_session',                              xp: 110, cash: 400  },
  { id: 'lottery_luck',tier: 'easy', name: 'Try Your Luck',  emoji: '',  desc: 'Scratch 3 lottery tickets.',                         target: 3, type: 'misc_use', meta: { item: 'lottery_ticket' }, xp: 60, cash: 200 },
  { id: 'first_round', tier: 'easy', name: 'First Round',    emoji: '',  desc: 'Buy a round — use 4 items at any player shop.',      target: 4, type: 'misc_use_any',                             xp: 70,  cash: 250  },

  //  med 
  { id: 'shadow',      tier: 'med',  name: 'Shadow Operator',emoji: '',  desc: 'Complete 3 successful cyber-tier crimes.',           target: 3, type: 'crime_success', meta: { tier: 'cyber' },  xp: 220, cash: 1200 },
  { id: 'joyride',     tier: 'med',  name: 'Joyride',        emoji: '',  desc: 'Steal 2 vehicles via Grand Theft Auto.',             target: 2, type: 'crime_success', meta: { tier: 'gta' },    xp: 200, cash: 1000 },
  { id: 'pusher',      tier: 'med',  name: 'Pusher',         emoji: '',  desc: 'Sell drugs 5 times.',                                target: 5, type: 'drug_sale',                                xp: 200, cash: 800  },
  { id: 'bruiser',     tier: 'med',  name: 'Bruiser',        emoji: '',  desc: 'Win 2 fights at the Fight Club.',                    target: 2, type: 'combat_win',                               xp: 240, cash: 1200 },
  { id: 'ghost_caller',tier: 'med',  name: 'Ghost Caller',   emoji: '',  desc: 'Burn 2 burner phones.',                              target: 2, type: 'misc_use', meta: { item: 'burner_phone' }, xp: 80, cash: 400 },
  { id: 'cracksman',   tier: 'med',  name: 'Cracksman',      emoji: '',  desc: 'Use a Lockpick Set.',                                target: 1, type: 'misc_use', meta: { item: 'lockpick_set' }, xp: 70, cash: 300 },
  { id: 'mugger',      tier: 'med',  name: 'Mugger',         emoji: '',  desc: 'Successfully rob another player.',                   target: 1, type: 'rob_player',                               xp: 220, cash: 1000 },
  { id: 'cyber_run',   tier: 'med',  name: 'Cyber Run',      emoji: '',  desc: 'Complete 5 cyber-tier crimes.',                      target: 5, type: 'crime_success', meta: { tier: 'cyber' },  xp: 320, cash: 1500 },
  { id: 'gta_streak',  tier: 'med',  name: 'GTA Streak',     emoji: '',  desc: 'Steal 4 vehicles.',                                  target: 4, type: 'crime_success', meta: { tier: 'gta' },    xp: 380, cash: 1800 },
  { id: 'pharmacist',  tier: 'med',  name: 'Pharmacist',     emoji: '',  desc: 'Use 4 first-aid kits.',                              target: 4, type: 'misc_use', meta: { item: 'first_aid' },  xp: 180, cash: 700  },
  { id: 'sober_grind', tier: 'med',  name: 'Sober Grind',    emoji: '',  desc: 'Drink 6 espressos.',                                 target: 6, type: 'misc_use', meta: { item: 'coffee' },     xp: 150, cash: 600  },
  { id: 'chemist',     tier: 'med',  name: 'Chemistry Set',  emoji: '',  desc: 'Sell drugs 10 times.',                               target: 10, type: 'drug_sale',                              xp: 360, cash: 1500 },

  //  hard 
  { id: 'big_score',   tier: 'hard', name: 'Big Score',      emoji: '',  desc: 'Pull off 1 major-tier crime.',                       target: 1, type: 'crime_success', meta: { tier: 'major' },  xp: 600, cash: 4000 },
  { id: 'arsonist',    tier: 'hard', name: 'Arsonist',       emoji: '',  desc: 'Empty a Gas Can on the right doorstep.',             target: 1, type: 'misc_use', meta: { item: 'gas_can' },     xp: 150, cash: 600 },
  { id: 'data_drop',   tier: 'hard', name: 'Data Drop',      emoji: '',  desc: 'Plant 2 USB drives.',                                target: 2, type: 'misc_use', meta: { item: 'usb_drive' },   xp: 200, cash: 800 },
  { id: 'major_score', tier: 'hard', name: 'Major Score',    emoji: '',  desc: 'Pull off 3 major-tier crimes.',                      target: 3, type: 'crime_success', meta: { tier: 'major' },  xp: 1500, cash: 10000 },
  { id: 'fightclub_champ', tier: 'hard', name: 'Fight Club Champ', emoji: '', desc: 'Win 5 fights at the Fight Club.',              target: 5, type: 'combat_win',                              xp: 800, cash: 4000 },
  { id: 'serial_mug',  tier: 'hard', name: 'Serial Mugger',  emoji: '',  desc: 'Successfully rob 3 players.',                        target: 3, type: 'rob_player',                              xp: 900, cash: 4500 },
  { id: 'kingpin',     tier: 'hard', name: 'Kingpin',        emoji: '',  desc: 'Sell drugs 25 times.',                               target: 25, type: 'drug_sale',                              xp: 1200, cash: 6500 },
  { id: 'mad_scientist', tier: 'hard', name: 'Mad Scientist',emoji: '',  desc: 'Use 4 USB drives.',                                  target: 4, type: 'misc_use', meta: { item: 'usb_drive' }, xp: 350, cash: 1500 },
];

export const missionById = id => byId(DAILY_MISSIONS, id);

//  Organised Crimes (multi-player heists) 
//
// Each crime needs a fixed crew filling specific roles. `share` is the
// fraction of the payout each role takes home (sums to 1.0). `stat` and
// `min` gate the role — a player can only be assigned if they meet that
// stat threshold. The first role in each list is always 'leader' and is
// taken automatically by whoever creates the plan.
//
// Energy cost is paid by every participant on /execute. Failure rolls
// the same risk table as solo crimes (so tier 'extreme' bites hard).
export const ORGANISED_CRIMES = [
  {
    id: 'cargo_hijack', name: 'Cargo Ship Hijack', emoji: '',
    desc: 'Three-person boarding party — stick the captain, take the freight.',
    payoutMin: 150_000, payoutMax: 600_000,
    risk: 'high', levelGate: 20, energy: 18,
    roles: [
      { id: 'leader', name: 'Captain',          stat: 'intelligence', min: 40, share: 0.40 },
      { id: 'gunner', name: 'Gunner',           stat: 'strength',     min: 25, share: 0.30 },
      { id: 'pilot',  name: 'Speedboat Pilot',  stat: 'speed',        min: 30, share: 0.30 },
    ],
  },
  {
    id: 'bank_heist', name: 'Bank Heist', emoji: '',
    desc: 'Vault score with a four-man crew. Drill, extract, drive.',
    payoutMin: 250_000, payoutMax: 900_000,
    risk: 'extreme', levelGate: 25, energy: 22,
    roles: [
      { id: 'leader', name: 'Mastermind',       stat: 'intelligence', min: 50, share: 0.30 },
      { id: 'driver', name: 'Getaway Driver',   stat: 'speed',        min: 30, share: 0.20 },
      { id: 'hacker', name: 'Vault Hacker',     stat: 'intelligence', min: 60, share: 0.25 },
      { id: 'muscle', name: 'Muscle',           stat: 'strength',     min: 30, share: 0.25 },
    ],
  },
  {
    id: 'casino_score', name: 'Casino Score', emoji: '',
    desc: 'Five-person crew, working the floor while the floor works for you.',
    payoutMin: 400_000, payoutMax: 1_500_000,
    risk: 'extreme', levelGate: 35, energy: 25,
    roles: [
      { id: 'leader',      name: 'Inside Man',      stat: 'intelligence', min: 70, share: 0.25 },
      { id: 'pit_boss',    name: 'Pit Specialist',  stat: 'intelligence', min: 50, share: 0.20 },
      { id: 'driver',      name: 'Driver',          stat: 'speed',        min: 35, share: 0.15 },
      { id: 'safecracker', name: 'Safecracker',     stat: 'intelligence', min: 60, share: 0.20 },
      { id: 'muscle',      name: 'Muscle',          stat: 'strength',     min: 35, share: 0.20 },
    ],
  },
  {
    id: 'crypto_exchange', name: 'Crypto Exchange Drain', emoji: '',
    desc: 'Three-person cyber team — two hackers and a lookout to spot the FBI van.',
    payoutMin: 600_000, payoutMax: 2_500_000,
    risk: 'extreme', levelGate: 40, energy: 22,
    roles: [
      { id: 'leader',   name: 'Lead Hacker',  stat: 'intelligence', min: 80, share: 0.40 },
      { id: 'co_hack',  name: 'Co-Hacker',    stat: 'intelligence', min: 60, share: 0.35 },
      { id: 'lookout',  name: 'Lookout',      stat: 'speed',        min: 25, share: 0.25 },
    ],
  },
];

export const orgCrimeById = id => byId(ORGANISED_CRIMES, id);
