// All static game content lives here so designers can tune balance in one file.

export { VEHICLES, VEHICLE_BY_ID, VEHICLES_BY_TIER, TIER_NAMES, tierEmoji, rollVehicleFromTier } from './data-vehicles.js';
import { VEHICLE_BY_ID } from './data-vehicles.js';
export const vehicleById = id => VEHICLE_BY_ID[id];

export const CITIES = [
  { id: 'new_york',  name: 'New York',  emoji: '🗽', drugMul: 1.10, businessMul: 1.20, flightBase: 1500 },
  { id: 'london',    name: 'London',    emoji: '🎡', drugMul: 1.05, businessMul: 1.15, flightBase: 1400 },
  { id: 'tokyo',     name: 'Tokyo',     emoji: '🗼', drugMul: 1.25, businessMul: 1.30, flightBase: 2200 },
  { id: 'dubai',     name: 'Dubai',     emoji: '🏙️', drugMul: 1.40, businessMul: 1.50, flightBase: 2800 },
  { id: 'liverpool', name: 'Liverpool', emoji: '⚓', drugMul: 0.85, businessMul: 0.80, flightBase: 1300 },
  { id: 'miami',     name: 'Miami',     emoji: '🌴', drugMul: 1.15, businessMul: 1.10, flightBase: 1200 },
  { id: 'paris',     name: 'Paris',     emoji: '🗼', drugMul: 1.00, businessMul: 1.10, flightBase: 1400 },
  { id: 'bangkok',   name: 'Bangkok',   emoji: '🛕', drugMul: 0.70, businessMul: 0.75, flightBase: 2400 },
  { id: 'sydney',    name: 'Sydney',    emoji: '🦘', drugMul: 1.20, businessMul: 1.05, flightBase: 2600 },
  { id: 'rio',       name: 'Rio',       emoji: '🏖️', drugMul: 0.80, businessMul: 0.85, flightBase: 1800 },
  { id: 'moscow',    name: 'Moscow',    emoji: '☃️', drugMul: 0.90, businessMul: 0.95, flightBase: 2000 },
  { id: 'cape_town', name: 'Cape Town', emoji: '🦁', drugMul: 0.75, businessMul: 0.80, flightBase: 2100 },
  { id: 'las_vegas', name: 'Las Vegas', emoji: '🎲', drugMul: 1.10, businessMul: 1.20, flightBase: 1500 },
  { id: 'hong_kong', name: 'Hong Kong', emoji: '🐉', drugMul: 1.30, businessMul: 1.35, flightBase: 2400 },
  { id: 'berlin',    name: 'Berlin',    emoji: '🐻', drugMul: 0.95, businessMul: 1.00, flightBase: 1500 },
  { id: 'mexico_city', name: 'Mexico City', emoji: '🌮', drugMul: 0.65, businessMul: 0.75, flightBase: 1700 },
  { id: 'amsterdam', name: 'Amsterdam', emoji: '🚲', drugMul: 0.80, businessMul: 1.05, flightBase: 1500 },
  { id: 'detroit',   name: 'Detroit',   emoji: '🏚️', drugMul: 0.70, businessMul: 0.65, flightBase: 1300 },
];

// Serious / criminal / mysterious. Suits, silhouettes, sterner faces — no
// smileys, astronauts, rockstars, etc.
export const AVATARS = ['🕴️', '🤵', '🥷', '🕵️', '🧔', '👮', '💂', '👤', '💀', '🎩', '🤴', '👴'];

// Crimes — energy/nerve cost, level gate, success base, payout range, xp
export const CRIMES = [
  // ── Street crimes ──────────────────────────────────────────────
  { id: 'pickpocket',     name: 'Pickpocket',           tier: 'street', energy: 1, nerve: 0, level: 1,  base: 75, min: 20,    max: 80,    xp: 4,   risk: 'tiny' },
  { id: 'shoplift',       name: 'Shoplift',             tier: 'street', energy: 2, nerve: 0, level: 1,  base: 70, min: 50,    max: 200,   xp: 6,   risk: 'tiny' },
  { id: 'snatch_grab',    name: 'Phone Snatch',         tier: 'street', energy: 1, nerve: 0, level: 2,  base: 72, min: 40,    max: 180,   xp: 6,   risk: 'tiny' },
  { id: 'bike_theft',     name: 'Steal a Pushbike',     tier: 'street', energy: 2, nerve: 0, level: 2,  base: 68, min: 60,    max: 250,   xp: 8,   risk: 'tiny' },
  { id: 'mugging',        name: 'Mugging',              tier: 'street', energy: 3, nerve: 1, level: 4,  base: 60, min: 200,   max: 800,   xp: 12,  risk: 'low'  },
  { id: 'atm_skim',       name: 'ATM Skim',             tier: 'street', energy: 3, nerve: 1, level: 4,  base: 55, min: 280,   max: 1100,  xp: 14,  risk: 'low',  intelBonus: 0.8 },
  { id: 'cat_converter',  name: 'Cat Converter Theft',  tier: 'street', energy: 3, nerve: 1, level: 5,  base: 60, min: 250,   max: 950,   xp: 14,  risk: 'low'  },
  { id: 'scam',           name: 'Online Scam',          tier: 'street', energy: 3, nerve: 0, level: 5,  base: 50, min: 400,   max: 1800,  xp: 18,  risk: 'low',  intelBonus: 1.0 },
  { id: 'breakin',        name: 'House Break-In',       tier: 'street', energy: 4, nerve: 1, level: 6,  base: 55, min: 600,   max: 2200,  xp: 20,  risk: 'low'  },
  { id: 'loan_collect',   name: 'Loan Shark Collection',tier: 'street', energy: 3, nerve: 2, level: 8,  base: 65, min: 450,   max: 1800,  xp: 22,  risk: 'low'  },
  { id: 'store_holdup',   name: 'Convenience Holdup',   tier: 'street', energy: 4, nerve: 2, level: 9,  base: 55, min: 700,   max: 2800,  xp: 28,  risk: 'med'  },

  // ── Cybercrime — intelligence-driven, lower energy, scales hard ──
  { id: 'phishing',       name: 'Email Phishing',       tier: 'cyber',  energy: 2, nerve: 0, level: 5,  base: 50, min: 220,   max: 850,    xp: 16,  risk: 'low',  intelBonus: 1.0 },
  { id: 'social_eng',     name: 'Social Engineering',   tier: 'cyber',  energy: 3, nerve: 1, level: 8,  base: 55, min: 600,   max: 2200,   xp: 32,  risk: 'low',  intelBonus: 1.2 },
  { id: 'card_fraud',     name: 'Stolen Card Fraud',    tier: 'cyber',  energy: 3, nerve: 1, level: 12, base: 50, min: 1600,  max: 5800,   xp: 65,  risk: 'low',  intelBonus: 1.0, dirty: true },
  { id: 'darkweb',        name: 'Dark Web Fraud Ring',  tier: 'cyber',  energy: 4, nerve: 2, level: 16, base: 50, min: 4500,  max: 16000,  xp: 140, risk: 'med',  intelBonus: 1.3, dirty: true },
  { id: 'ransomware',     name: 'Ransomware Drop',      tier: 'cyber',  energy: 5, nerve: 3, level: 22, base: 45, min: 8000,  max: 30000,  xp: 290, risk: 'med',  intelBonus: 1.4, dirty: true, cooldownSec: 3600   /* 1h */ },
  { id: 'crypto_drain',   name: 'Crypto Wallet Drain',  tier: 'cyber',  energy: 6, nerve: 3, level: 30, base: 45, min: 18000, max: 60000,  xp: 620, risk: 'high', intelBonus: 1.5, dirty: true, cooldownSec: 7200   /* 2h */ },
  { id: 'ddos_ext',       name: 'DDoS Extortion',       tier: 'cyber',  energy: 7, nerve: 4, level: 38, base: 40, min: 40000, max: 130000, xp: 1100,risk: 'high', intelBonus: 1.4, dirty: true, cooldownSec: 14400  /* 4h */ },

  { id: 'jewellery',      name: 'Jewellery Heist',      tier: 'major',  energy: 8, nerve: 4, level: 20, base: 40, min: 12000, max: 35000,  xp: 220, risk: 'high', cooldownSec: 3600  /* 1h */ },
  { id: 'bank_rob',     name: 'Bank Robbery',        tier: 'major', energy: 10, nerve: 6, level: 25, base: 35, min: 22000,  max: 70000,  xp: 380, risk: 'high',                    cooldownSec: 7200  /* 2h */ },
  { id: 'smuggle',      name: 'Smuggling Run',       tier: 'major', energy: 9, nerve: 5, level: 28, base: 45, min: 18000,  max: 55000,  xp: 320, risk: 'high', dirty: true,        cooldownSec: 9000  /* 2.5h */ },
  { id: 'art_heist',    name: 'Art Gallery Heist',   tier: 'major', energy: 12, nerve: 7, level: 35, base: 38, min: 35000,  max: 130000, xp: 600, risk: 'high', intelBonus: 1.2,    cooldownSec: 14400 /* 4h */ },
  { id: 'casino_score', name: 'Casino Score',        tier: 'major', energy: 14, nerve: 9, level: 45, base: 32, min: 60000,  max: 220000, xp: 950, risk: 'extreme',                  cooldownSec: 28800 /* 8h */ },
  { id: 'cargo_hijack', name: 'Cargo Ship Hijack',   tier: 'major', energy: 16, nerve: 10, level: 55, base: 30, min: 140000, max: 450000, xp: 1500, risk: 'extreme', dirty: true,    cooldownSec: 36000 /* 10h */ },
  { id: 'cyber_bank',   name: 'Crypto Exchange Hack',tier: 'major', energy: 18, nerve: 12, level: 65, base: 28, min: 250000, max: 900000, xp: 2400, risk: 'extreme', intelBonus: 1.0, dirty: true, cooldownSec: 43200 /* 12h */ },

  // GTA — Grand Theft Auto. On success: a vehicle from the matched tier
  // lands in your garage. No cash payout — the car IS the prize. Fail
  // outcomes use the standard risk table (jail / hospital / escape).
  { id: 'gta_beater',   name: 'Hotwire a Beater',     tier: 'gta', energy: 4,  nerve: 1,  level: 3,  base: 70, vehicleTier: 1, xp: 18,   risk: 'low' },
  { id: 'gta_compact',  name: 'Steal a Sedan',        tier: 'gta', energy: 5,  nerve: 2,  level: 8,  base: 60, vehicleTier: 2, xp: 50,   risk: 'low' },
  { id: 'gta_hothatch', name: 'Carjack a Hot Hatch',  tier: 'gta', energy: 7,  nerve: 3,  level: 14, base: 55, vehicleTier: 3, xp: 110,  risk: 'med' },
  { id: 'gta_premium',  name: 'Snatch a Premium',     tier: 'gta', energy: 9,  nerve: 4,  level: 22, base: 50, vehicleTier: 4, xp: 240,  risk: 'med' },
  { id: 'gta_luxury',   name: 'Valet Grab',           tier: 'gta', energy: 12, nerve: 6,  level: 32, base: 45, vehicleTier: 5, xp: 520,  risk: 'high',     cooldownSec: 5400  /* 1.5h */ },
  { id: 'gta_exotic',   name: 'Showroom Heist',       tier: 'gta', energy: 16, nerve: 9,  level: 45, base: 38, vehicleTier: 6, xp: 1200, risk: 'high',     cooldownSec: 14400 /* 4h */ },
  { id: 'gta_hyper',    name: 'Midnight Run',         tier: 'gta', energy: 20, nerve: 12, level: 60, base: 32, vehicleTier: 7, xp: 2400, risk: 'extreme',  cooldownSec: 36000 /* 10h */ },
];

// Permanent employment. Stat gates determine eligibility. `hourly` is the
// passive pay rate (capped 24h pending). `task` is the flavour for the
// daily check-in. Skip a check-in for 48h and you're fired.
// `hourly` is the per-real-hour wage (a full game day's salary). Field name
// kept for code stability — UI renders this as "/day".
//
// `schedule` defines the shift pattern in UTC. `days` is JS day-of-week (Sun=0
// … Sat=6); `startHour` is when the shift opens; `durationHours` how long it
// runs (can cross midnight). The player must check in once during each open
// shift on a working day or get fired on the next API call.
export const JOBS = [
  { id: 'janitor',    name: 'Janitor',           emoji: '🧹', hourly: 80,     gates: { level: 1 },                                              task: 'Sweep the loading dock',         taskEnergy: 1, xp: 5,   schedule: { days: [1,2,3,4,5],     startHour: 18, durationHours: 8  } },
  { id: 'delivery',   name: 'Delivery Driver',   emoji: '🚚', hourly: 180,    gates: { level: 1, speed: 5 },                                    task: 'Drop off a package',             taskEnergy: 1, xp: 8,   schedule: { days: [1,2,3,4,5,6],   startHour: 7,  durationHours: 10 } },
  { id: 'bartender',  name: 'Bartender',         emoji: '🍻', hourly: 270,    gates: { level: 3, intelligence: 5 },                             task: 'Stock the bar',                  taskEnergy: 1, xp: 12,  schedule: { days: [3,4,5,6,0],     startHour: 18, durationHours: 8  } },
  { id: 'security',   name: 'Security Guard',    emoji: '🛡️', hourly: 400,    gates: { level: 6, strength: 12, defence: 10 },                   task: 'Patrol the back lot',            taskEnergy: 2, xp: 18,  schedule: { days: [0,1,2,3,4,5,6], startHour: 16, durationHours: 8  } },
  { id: 'taxi',       name: 'Taxi Driver',       emoji: '🚕', hourly: 540,    gates: { level: 8, speed: 12 },                                   task: 'Drive the morning shift',        taskEnergy: 2, xp: 24,  schedule: { days: [0,1,2,3,4,5,6], startHour: 6,  durationHours: 10 } },
  { id: 'mechanic',   name: 'Mechanic',          emoji: '🔧', hourly: 720,    gates: { level: 10, intelligence: 15 },                           task: 'Fix a customer\'s engine',       taskEnergy: 2, xp: 30,  schedule: { days: [1,2,3,4,5,6],   startHour: 8,  durationHours: 10 } },
  { id: 'bouncer',    name: 'Bouncer',           emoji: '🥋', hourly: 920,    gates: { level: 12, strength: 25, defence: 20 },                  task: 'Work the door at the club',      taskEnergy: 3, xp: 42,  schedule: { days: [4,5,6],         startHour: 21, durationHours: 6  } },
  { id: 'trainer',    name: 'Personal Trainer',  emoji: '💪', hourly: 1080,   gates: { level: 14, strength: 25, speed: 20 },                    task: 'Coach a client through a session', taskEnergy: 3, xp: 50, schedule: { days: [1,2,3,4,5],   startHour: 6,  durationHours: 14 } },
  { id: 'accountant', name: 'Accountant',        emoji: '📊', hourly: 1500,   gates: { level: 18, intelligence: 30, reputation: 200 },          task: 'Reconcile the ledger',           taskEnergy: 2, xp: 70,  schedule: { days: [1,2,3,4,5],     startHour: 9,  durationHours: 8  } },
  { id: 'engineer',   name: 'Software Engineer', emoji: '💻', hourly: 2200,   gates: { level: 22, intelligence: 45 },                           task: 'Ship a code change',             taskEnergy: 2, xp: 100, schedule: { days: [1,2,3,4,5],     startHour: 10, durationHours: 8  } },
  { id: 'lawyer',     name: 'Lawyer',            emoji: '⚖️',  hourly: 3400,  gates: { level: 28, intelligence: 60, reputation: 500 },          task: 'Review a deposition',            taskEnergy: 3, xp: 150, schedule: { days: [1,2,3,4,5],     startHour: 8,  durationHours: 11 } },
  { id: 'broker',     name: 'Stockbroker',       emoji: '📈', hourly: 4800,   gates: { level: 32, intelligence: 70, reputation: 800 },          task: 'Run the morning trades',         taskEnergy: 3, xp: 200, schedule: { days: [1,2,3,4,5],     startHour: 7,  durationHours: 9  } },
  { id: 'surgeon',    name: 'Surgeon',           emoji: '🩺', hourly: 7200,   gates: { level: 40, intelligence: 90 },                           task: 'Perform a routine surgery',      taskEnergy: 4, xp: 280, schedule: { days: [0,1,2,3,4,5,6], startHour: 7,  durationHours: 12 } },
  { id: 'executive',  name: 'Executive CEO',     emoji: '🕴️',  hourly: 11500, gates: { level: 50, intelligence: 100, reputation: 2500 },        task: 'Approve quarterly earnings',     taskEnergy: 4, xp: 400, schedule: { days: [1,2,3,4,5],     startHour: 9,  durationHours: 12 } },
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
  // ── Melee — no ammo ───────────────────────────────────────────────
  { id: 'fists',          name: 'Fists',                                       category: 'melee',    dmg: 4,   level: 1,  cost: 0,      ammoType: null    },
  { id: 'knuckles',       name: 'Brass Knuckles',                              category: 'melee',    dmg: 7,   level: 1,  cost: 80,     ammoType: null    },
  { id: 'switchblade',    name: 'Switchblade',                                 category: 'melee',    dmg: 9,   level: 1,  cost: 160,    ammoType: null    },
  { id: 'knife',          name: 'Combat Knife',                                category: 'melee',    dmg: 10,  level: 1,  cost: 220,    ammoType: null    },
  { id: 'machete',        name: 'Machete',                                     category: 'melee',    dmg: 14,  level: 3,  cost: 480,    ammoType: null    },
  { id: 'bat',            name: 'Baseball Bat',                                category: 'melee',    dmg: 14,  level: 3,  cost: 520,    ammoType: null    },
  { id: 'crowbar',        name: 'Crowbar',                                     category: 'melee',    dmg: 16,  level: 4,  cost: 720,    ammoType: null    },
  { id: 'katana',         name: 'Katana',                                      category: 'melee',    dmg: 22,  level: 8,  cost: 3500,   ammoType: null    },

  // ── Pistols — 9mm ─────────────────────────────────────────────────
  { id: 'glock_17',       name: 'Glock 17',          maker: 'Glock',           category: 'pistol',   dmg: 18,  level: 6,  cost: 2800,   ammoType: '9mm'   },
  { id: 'beretta_cheetah',name: 'Cheetah 84FS',      maker: 'Beretta',         category: 'pistol',   dmg: 19,  level: 7,  cost: 3500,   ammoType: '9mm'   },
  { id: 'beretta_92fs',   name: '92FS',              maker: 'Beretta',         category: 'pistol',   dmg: 21,  level: 8,  cost: 3900,   ammoType: '9mm'   },
  { id: 'glock_19',       name: 'Glock 19',          maker: 'Glock',           category: 'pistol',   dmg: 21,  level: 8,  cost: 4200,   ammoType: '9mm'   },
  { id: 'sig_p226',       name: 'P226',              maker: 'SIG Sauer',       category: 'pistol',   dmg: 23,  level: 9,  cost: 4800,   ammoType: '9mm'   },
  { id: 'hk_usp9',        name: 'USP 9',             maker: 'Heckler & Koch',  category: 'pistol',   dmg: 24,  level: 10, cost: 5500,   ammoType: '9mm'   },
  // ── Pistols — .45 ACP ─────────────────────────────────────────────
  { id: 'colt_1911',      name: 'M1911',             maker: 'Colt',            category: 'pistol',   dmg: 27,  level: 11, cost: 6500,   ammoType: '45acp' },
  { id: 'hk_usp45',       name: 'USP .45',           maker: 'Heckler & Koch',  category: 'pistol',   dmg: 30,  level: 13, cost: 8200,   ammoType: '45acp' },

  // ── Revolvers — .357 Magnum ───────────────────────────────────────
  { id: 'sw_686',         name: 'Model 686',         maker: 'Smith & Wesson',  category: 'revolver', dmg: 32,  level: 14, cost: 9500,   ammoType: '357'   },
  { id: 'colt_python',    name: 'Python',            maker: 'Colt',            category: 'revolver', dmg: 36,  level: 16, cost: 14000,  ammoType: '357'   },

  // ── SMGs — 9mm / .45 ACP ──────────────────────────────────────────
  { id: 'uzi',            name: 'Uzi',               maker: 'IMI',             category: 'smg',      dmg: 32,  level: 14, cost: 12000,  ammoType: '9mm'   },
  { id: 'mp5',            name: 'MP5A3',             maker: 'Heckler & Koch',  category: 'smg',      dmg: 38,  level: 16, cost: 18000,  ammoType: '9mm'   },
  { id: 'thompson',       name: 'M1A1 Thompson',     maker: 'Auto-Ordnance',   category: 'smg',      dmg: 42,  level: 18, cost: 24000,  ammoType: '45acp' },

  // ── Shotguns — 12 gauge ───────────────────────────────────────────
  { id: 'remington_870',  name: '870 Express',       maker: 'Remington',       category: 'shotgun',  dmg: 38,  level: 16, cost: 18000,  ammoType: 'shells'},
  { id: 'mossberg_500',   name: '500 Tactical',      maker: 'Mossberg',        category: 'shotgun',  dmg: 40,  level: 18, cost: 22000,  ammoType: 'shells'},
  { id: 'benelli_m4',     name: 'M4 Super 90',       maker: 'Benelli',         category: 'shotgun',  dmg: 46,  level: 22, cost: 35000,  ammoType: 'shells'},
  { id: 'spas_12',        name: 'SPAS-12',           maker: 'Franchi',         category: 'shotgun',  dmg: 50,  level: 25, cost: 48000,  ammoType: 'shells'},

  // ── Assault Rifles — 5.56mm ───────────────────────────────────────
  { id: 'm4a1',           name: 'M4A1',              maker: 'Colt',            category: 'rifle',    dmg: 52,  level: 25, cost: 55000,  ammoType: '556'   },
  { id: 'steyr_aug',      name: 'AUG A3',            maker: 'Steyr',           category: 'rifle',    dmg: 56,  level: 28, cost: 72000,  ammoType: '556'   },
  { id: 'famas',          name: 'FAMAS F1',          maker: 'Nexter',          category: 'rifle',    dmg: 58,  level: 30, cost: 85000,  ammoType: '556'   },
  // ── Battle Rifles — 7.62mm ────────────────────────────────────────
  { id: 'ak47',           name: 'AK-47',             maker: 'Kalashnikov',     category: 'rifle',    dmg: 62,  level: 32, cost: 75000,  ammoType: '762'   },
  { id: 'akm',            name: 'AKM',               maker: 'Kalashnikov',     category: 'rifle',    dmg: 65,  level: 34, cost: 88000,  ammoType: '762'   },
  { id: 'fn_fal',         name: 'FAL',               maker: 'FN Herstal',      category: 'rifle',    dmg: 72,  level: 38, cost: 120000, ammoType: '762'   },
  { id: 'hk_g3',          name: 'G3A3',              maker: 'Heckler & Koch',  category: 'rifle',    dmg: 75,  level: 40, cost: 140000, ammoType: '762'   },

  // ── Sniper Rifles — .308 / .50 cal ────────────────────────────────
  { id: 'remington_700',  name: '700 Tactical',      maker: 'Remington',       category: 'sniper',   dmg: 82,  level: 45, cost: 200000, ammoType: '308'   },
  { id: 'hk_psg1',        name: 'PSG-1',             maker: 'Heckler & Koch',  category: 'sniper',   dmg: 90,  level: 50, cost: 320000, ammoType: '308'   },
  { id: 'barrett_m82',    name: 'M82A1',             maker: 'Barrett',         category: 'sniper',   dmg: 105, level: 55, cost: 380000, ammoType: '50cal' },
  { id: 'mcmillan_tac50', name: 'TAC-50',            maker: 'McMillan',        category: 'sniper',   dmg: 130, level: 65, cost: 620000, ammoType: '50cal' },
];

export const WEAPON_CATEGORIES = {
  melee:    { name: 'Melee',         emoji: '🔪' },
  pistol:   { name: 'Pistols',       emoji: '🔫' },
  revolver: { name: 'Revolvers',     emoji: '🤠' },
  smg:      { name: 'SMGs',          emoji: '💥' },
  shotgun:  { name: 'Shotguns',      emoji: '🎯' },
  rifle:    { name: 'Rifles',        emoji: '🪖' },
  sniper:   { name: 'Sniper Rifles', emoji: '🎯' },
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
  // ── Legal (clean cash) ────────────────────────────────────────────────
  { id: 'cafe',         name: 'Café',                emoji: '☕',  illegal: false, baseCost: 25000,   baseHourly: 1100,  levelGate: 1,  launderRate: null  },
  { id: 'diner',        name: 'Diner',               emoji: '🍳',  illegal: false, baseCost: 60000,   baseHourly: 2000,  levelGate: 5,  launderRate: null  },
  { id: 'car_wash',     name: 'Car Wash',            emoji: '🧼',  illegal: false, baseCost: 35000,   baseHourly: 1300,  levelGate: 3,  launderRate: 0.70  },
  { id: 'boutique',     name: 'Boutique',            emoji: '👜',  illegal: false, baseCost: 110000,  baseHourly: 3000,  levelGate: 10, launderRate: null  },
  { id: 'auto_shop',    name: 'Auto Repair Shop',    emoji: '🔧',  illegal: false, baseCost: 140000,  baseHourly: 3600,  levelGate: 12, launderRate: null  },
  { id: 'taxi_firm',    name: 'Taxi Firm',           emoji: '🚕',  illegal: false, baseCost: 200000,  baseHourly: 4800,  levelGate: 15, launderRate: null  },
  { id: 'nightclub',    name: 'Nightclub',           emoji: '🪩',  illegal: false, baseCost: 380000,  baseHourly: 8500,  levelGate: 22, launderRate: 0.82  },
  { id: 'tech_startup', name: 'Tech Startup',        emoji: '💻',  illegal: false, baseCost: 400000,  baseHourly: 7500,  levelGate: 24, launderRate: null  },
  { id: 'real_estate',  name: 'Real Estate Office',  emoji: '🏘️',  illegal: false, baseCost: 600000,  baseHourly: 11000, levelGate: 30, launderRate: 0.78  },
  { id: 'luxury_hotel', name: 'Luxury Hotel',        emoji: '🏨',  illegal: false, baseCost: 1500000, baseHourly: 25000, levelGate: 42, launderRate: 0.86  },
  // ── Illegal (dirty cash, raid risk scales with sliders) ───────────────
  { id: 'pawn_shop',    name: 'Pawn Shop',           emoji: '💰',  illegal: true,  baseCost: 70000,   baseHourly: 2400,  levelGate: 6,  launderRate: null  },
  { id: 'smoke_shop',   name: 'Smoke Shop',          emoji: '💨',  illegal: true,  baseCost: 100000,  baseHourly: 3000,  levelGate: 9,  launderRate: null  },
  { id: 'chop_shop',    name: 'Chop Shop',           emoji: '🪓',  illegal: true,  baseCost: 130000,  baseHourly: 4200,  levelGate: 12, launderRate: null  },
  { id: 'strip_club',   name: 'Strip Club',          emoji: '💃',  illegal: true,  baseCost: 280000,  baseHourly: 5800,  levelGate: 18, launderRate: 0.78  },
  { id: 'counterfeit',  name: 'Counterfeit Lab',     emoji: '💵',  illegal: true,  baseCost: 350000,  baseHourly: 7200,  levelGate: 24, launderRate: null  },
  { id: 'drug_lab',     name: 'Drug Lab',            emoji: '⚗️',  illegal: true,  baseCost: 420000,  baseHourly: 9500,  levelGate: 26, launderRate: null  },
  { id: 'underground',  name: 'Underground Casino',  emoji: '🎰',  illegal: true,  baseCost: 800000,  baseHourly: 14000, levelGate: 32, launderRate: 0.74  },
  { id: 'cartel_lab',   name: 'Cartel Operation',    emoji: '☠️',  illegal: true,  baseCost: 1800000, baseHourly: 32000, levelGate: 48, launderRate: null  },
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

  const raidChance = template.illegal
    ? Math.max(0, (0.005 * r * r) - (0.0015 * (q - 1)))
    : 0;

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
const TIER_LABEL = { 1: 'Flat', 2: 'Townhouse', 3: 'Mansion', 4: 'Estate' };
const T = (tier) => ({ tier, tierLabel: TIER_LABEL[tier], bonuses: PROPERTY_TIER_BONUS[tier] });

// City-locked property catalogue. To buy you must be physically in the city.
// Existing characters may also own legacy generic properties (`flat`, `house`,
// `mansion`, `compound`) — those still work but no longer appear in any
// estate agent's listing (they have no `city` field, so they're filtered out).
export const PROPERTIES = [
  // Legacy fallbacks — kept so already-owned rows resolve via propertyById.
  { id: 'flat',     name: 'Flat',     cost: 30000,   bonuses: PROPERTY_TIER_BONUS[1] },
  { id: 'house',    name: 'House',    cost: 150000,  bonuses: PROPERTY_TIER_BONUS[2] },
  { id: 'mansion',  name: 'Mansion',  cost: 800000,  bonuses: PROPERTY_TIER_BONUS[3] },
  { id: 'compound', name: 'Compound', cost: 5000000, bonuses: PROPERTY_TIER_BONUS[4] },

  // ── New York ──
  { id: 'ny_walkup',     city: 'new_york', name: 'Lower East Side Walk-up',  address: '147 Rivington St',     cost: 48000,    ...T(1) },
  { id: 'ny_brownstone', city: 'new_york', name: 'Brooklyn Brownstone',      address: '284 Greene Ave',       cost: 380000,   ...T(2) },
  { id: 'ny_penthouse',  city: 'new_york', name: 'Park Avenue Penthouse',    address: '1041 Park Ave PH-A',   cost: 2400000,  ...T(3) },
  { id: 'ny_hamptons',   city: 'new_york', name: 'Hamptons Beach Estate',    address: '12 Further Lane, East Hampton', cost: 11000000, ...T(4) },

  // ── London ──
  { id: 'lon_flat',      city: 'london',   name: 'Whitechapel Flat',         address: '36b Vallance Rd',      cost: 52000,    ...T(1) },
  { id: 'lon_mews',      city: 'london',   name: 'Kensington Mews House',    address: '8 Cornwall Mews South', cost: 420000,  ...T(2) },
  { id: 'lon_mayfair',   city: 'london',   name: 'Mayfair Townhouse',        address: '17 Charles St, W1J',   cost: 2800000,  ...T(3) },
  { id: 'lon_kent',      city: 'london',   name: 'Kent Country Estate',      address: 'Greythorne Manor, Sevenoaks', cost: 9000000, ...T(4) },

  // ── Tokyo ──
  { id: 'tok_capsule',   city: 'tokyo',    name: 'Shinjuku Capsule Studio',  address: '2-14-9 Kabukichō',      cost: 42000,    ...T(1) },
  { id: 'tok_roppongi',  city: 'tokyo',    name: 'Roppongi High-Rise',       address: '6-10-1 Roppongi, Tower 32F', cost: 480000, ...T(2) },
  { id: 'tok_aoyama',    city: 'tokyo',    name: 'Aoyama Modernist Loft',    address: '5-4-44 Minami-Aoyama',  cost: 3200000,  ...T(3) },
  { id: 'tok_hakone',    city: 'tokyo',    name: 'Hakone Mountain Retreat',  address: '1300 Sengokuhara, Hakone', cost: 12000000, ...T(4) },

  // ── Dubai ──
  { id: 'dxb_studio',    city: 'dubai',    name: 'Deira Studio',             address: 'Al Rigga Rd, Tower 4 #708', cost: 55000,    ...T(1) },
  { id: 'dxb_downtown',  city: 'dubai',    name: 'Downtown High-Rise',       address: 'Sheikh Mohammed Blvd, 1804', cost: 620000,  ...T(2) },
  { id: 'dxb_burj',      city: 'dubai',    name: 'Burj Khalifa Sky Suite',   address: 'Burj Khalifa, Floor 121', cost: 4800000,    ...T(3) },
  { id: 'dxb_palm',      city: 'dubai',    name: 'Palm Jumeirah Villa',      address: 'Frond M, Villa 17',     cost: 15000000, ...T(4) },

  // ── Liverpool ──
  { id: 'lpl_terrace',   city: 'liverpool',name: 'Toxteth Terrace',          address: '23 Granby St, L8',      cost: 32000,    ...T(1) },
  { id: 'lpl_sefton',    city: 'liverpool',name: 'Sefton Park Manor',        address: '14 Aigburth Drive, L17',cost: 260000,   ...T(2) },
  { id: 'lpl_wirral',    city: 'liverpool',name: 'Wirral Estate',            address: 'Caldy Hall, West Kirby',cost: 1400000,  ...T(3) },
  { id: 'lpl_aigburth',  city: 'liverpool',name: 'Aigburth Compound',        address: 'Mossley Hill Manor',    cost: 5200000,  ...T(4) },

  // ── Miami ──
  { id: 'mia_bungalow',  city: 'miami',    name: 'Little Havana Bungalow',   address: '1814 SW 8th St',        cost: 42000,    ...T(1) },
  { id: 'mia_southbeach',city: 'miami',    name: 'South Beach Condo',        address: '450 Ocean Dr, #1102',   cost: 360000,   ...T(2) },
  { id: 'mia_coral',     city: 'miami',    name: 'Coral Gables Spanish',     address: '4801 Granada Blvd',     cost: 2200000,  ...T(3) },
  { id: 'mia_starisland',city: 'miami',    name: 'Star Island Mansion',      address: '46 Star Island Dr',     cost: 13000000, ...T(4) },

  // ── Paris ──
  { id: 'par_studio',    city: 'paris',    name: 'Bastille Studio',          address: '7 Rue de Lappe, 75011', cost: 50000,    ...T(1) },
  { id: 'par_marais',    city: 'paris',    name: 'Le Marais Apartment',      address: '24 Rue des Rosiers, 75004', cost: 440000, ...T(2) },
  { id: 'par_16e',       city: 'paris',    name: '16e Hôtel Particulier',    address: '88 Avenue Foch, 75116', cost: 2800000,  ...T(3) },
  { id: 'par_versailles',city: 'paris',    name: 'Versailles Château',       address: 'Domaine de Marly, 78160', cost: 14000000, ...T(4) },

  // ── Bangkok ──
  { id: 'bkk_shophouse', city: 'bangkok',  name: 'Klong Toey Shophouse',     address: '288/4 Phra Ram 4 Rd',   cost: 28000,    ...T(1) },
  { id: 'bkk_sukhumvit', city: 'bangkok',  name: 'Sukhumvit Apartment',      address: 'Soi 11, Tower 2 #2604', cost: 220000,   ...T(2) },
  { id: 'bkk_thonglor',  city: 'bangkok',  name: 'Thonglor Modern Villa',    address: '55 Soi Thonglor 13',    cost: 1200000,  ...T(3) },
  { id: 'bkk_phuket',    city: 'bangkok',  name: 'Phuket Beach Compound',    address: '8 Pansea Beach Rd, Surin', cost: 4800000, ...T(4) },

  // ── Sydney ──
  { id: 'syd_terrace',   city: 'sydney',   name: 'Surry Hills Terrace',      address: '142 Crown St, NSW 2010',cost: 46000,    ...T(1) },
  { id: 'syd_bondi',     city: 'sydney',   name: 'Bondi Beach Apartment',    address: '21 Notts Ave, Bondi',   cost: 340000,   ...T(2) },
  { id: 'syd_vaucluse',  city: 'sydney',   name: 'Vaucluse Harbour House',   address: '14 Wentworth Rd',       cost: 2600000,  ...T(3) },
  { id: 'syd_bluemtns',  city: 'sydney',   name: 'Blue Mountains Estate',    address: 'Govetts Leap Rd, Blackheath', cost: 9500000, ...T(4) },

  // ── Rio ──
  { id: 'rio_walkup',    city: 'rio',      name: 'Lapa Walk-up',             address: 'Rua dos Inválidos, 88', cost: 35000,    ...T(1) },
  { id: 'rio_copacabana',city: 'rio',      name: 'Copacabana Apartment',     address: 'Av. Atlântica, 2400 #1101', cost: 280000, ...T(2) },
  { id: 'rio_leblon',    city: 'rio',      name: 'Leblon Mansion',           address: 'Rua Aristides Espínola, 56', cost: 1800000, ...T(3) },
  { id: 'rio_buzios',    city: 'rio',      name: 'Búzios Beach Compound',    address: 'Praia do Forno, Búzios',cost: 6000000,  ...T(4) },

  // ── Moscow ──
  { id: 'mow_flat',      city: 'moscow',   name: 'Khrushchyovka Flat',       address: 'Ulitsa Bolshaya Sadovaya, 14', cost: 38000, ...T(1) },
  { id: 'mow_arbat',     city: 'moscow',   name: 'Arbat Apartment',          address: 'Stary Arbat 23, kv 7',  cost: 300000,   ...T(2) },
  { id: 'mow_patriarsh', city: 'moscow',   name: 'Patriarshiye Penthouse',   address: 'Bolshoy Patriarshiy 8, PH', cost: 1900000, ...T(3) },
  { id: 'mow_rublyovka', city: 'moscow',   name: 'Rublyovka Mansion',        address: 'Rublyovo-Uspenskoye Shosse', cost: 7500000, ...T(4) },

  // ── Cape Town ──
  { id: 'cpt_cottage',   city: 'cape_town',name: 'Salt River Cottage',       address: '23 Voortrekker Rd',     cost: 30000,    ...T(1) },
  { id: 'cpt_seapoint',  city: 'cape_town',name: 'Sea Point Apartment',      address: '142 Beach Rd, Mouille Point', cost: 250000, ...T(2) },
  { id: 'cpt_bantry',    city: 'cape_town',name: 'Bantry Bay Villa',         address: '8 Theresa Ave',         cost: 1600000,  ...T(3) },
  { id: 'cpt_campsbay',  city: 'cape_town',name: 'Camps Bay Compound',       address: 'Geneva Drive Estate',   cost: 5800000,  ...T(4) },

  // ─── Additional properties — 6 more per city ───────────────────────────

  // ── New York ──
  { id: 'ny_bushwick',     city: 'new_york', name: 'Bushwick Studio',          address: '412 Knickerbocker Ave',         cost: 35000,    ...T(1) },
  { id: 'ny_harlem',       city: 'new_york', name: 'Harlem Brownstone Studio', address: '132 W 119th St',                cost: 62000,    ...T(1) },
  { id: 'ny_village',      city: 'new_york', name: 'Greenwich Village Apt',    address: '28 Bleecker St #4B',            cost: 520000,   ...T(2) },
  { id: 'ny_astoria',      city: 'new_york', name: 'Astoria Co-op',            address: '33-12 31st Ave, Queens',        cost: 310000,   ...T(2) },
  { id: 'ny_tribeca',      city: 'new_york', name: 'Tribeca Loft',             address: '92 Greenwich St PH',            cost: 1800000,  ...T(3) },
  { id: 'ny_westchester',  city: 'new_york', name: 'Westchester Mansion',      address: '88 Hudson Pointe Dr, Tarrytown',cost: 7500000,  ...T(4) },

  // ── London ──
  { id: 'lon_camberwell',  city: 'london',   name: 'Camberwell Bedsit',        address: '18 Coldharbour Ln, SE5',        cost: 42000,    ...T(1) },
  { id: 'lon_hackney',     city: 'london',   name: 'Hackney Conversion',       address: '64 Lower Clapton Rd, E5',       cost: 68000,    ...T(1) },
  { id: 'lon_chelsea',     city: 'london',   name: 'Chelsea Garden Flat',      address: '81 Sydney St, SW3',             cost: 580000,   ...T(2) },
  { id: 'lon_hampstead',   city: 'london',   name: 'Hampstead Apartment',      address: '14 Flask Walk, NW3',            cost: 490000,   ...T(2) },
  { id: 'lon_belgravia',   city: 'london',   name: 'Belgravia Garden House',   address: '47 Eaton Sq, SW1W',             cost: 3400000,  ...T(3) },
  { id: 'lon_cotswolds',   city: 'london',   name: 'Cotswolds Manor',          address: 'Westcote Hall, Stow-on-the-Wold', cost: 7000000, ...T(4) },

  // ── Tokyo ──
  { id: 'tok_shimokita',   city: 'tokyo',    name: 'Shimokitazawa Studio',     address: '2-25-3 Kitazawa, Setagaya',     cost: 48000,    ...T(1) },
  { id: 'tok_kichijoji',   city: 'tokyo',    name: 'Kichijōji Apartment',      address: '1-22-12 Kichijōji-honchō',      cost: 54000,    ...T(1) },
  { id: 'tok_omotesando',  city: 'tokyo',    name: 'Omotesandō Apt',           address: '5-3-10 Jingūmae, Shibuya',      cost: 620000,   ...T(2) },
  { id: 'tok_daikanyama',  city: 'tokyo',    name: 'Daikanyama Loft',          address: '14-9 Sarugakuchō, Shibuya',     cost: 540000,   ...T(2) },
  { id: 'tok_minato',      city: 'tokyo',    name: 'Akasaka Penthouse',        address: '1-7-1 Akasaka, Tower 35F',      cost: 4100000,  ...T(3) },
  { id: 'tok_karuizawa',   city: 'tokyo',    name: 'Karuizawa Mountain Villa', address: '1234 Naka-Karuizawa',           cost: 9500000,  ...T(4) },

  // ── Dubai ──
  { id: 'dxb_satwa',       city: 'dubai',    name: 'Satwa Studio',             address: '4 Pearl Building, Block C',     cost: 40000,    ...T(1) },
  { id: 'dxb_bur',         city: 'dubai',    name: 'Bur Dubai Apartment',      address: 'Khalid Bin Al Waleed Rd #1208', cost: 58000,    ...T(1) },
  { id: 'dxb_jbr',         city: 'dubai',    name: 'JBR Walk Apartment',       address: 'Sadaf 7 Tower #1402',           cost: 720000,   ...T(2) },
  { id: 'dxb_marina',      city: 'dubai',    name: 'Marina Apartment',         address: 'Marina Promenade Tower #2204',  cost: 580000,   ...T(2) },
  { id: 'dxb_emirates',    city: 'dubai',    name: 'Emirates Hills Villa',     address: 'Sector E, Villa 28',            cost: 5600000,  ...T(3) },
  { id: 'dxb_jumeirah_islands', city: 'dubai', name: 'Jumeirah Islands Estate',address: 'Cluster 14, Villa 5',           cost: 13000000, ...T(4) },

  // ── Liverpool ──
  { id: 'lpl_kensington',  city: 'liverpool',name: 'Kensington Bedsit',        address: '217 Kensington Rd, L7',         cost: 24000,    ...T(1) },
  { id: 'lpl_anfield',     city: 'liverpool',name: 'Anfield Terrace',          address: '18 Skerries Rd, L4',            cost: 38000,    ...T(1) },
  { id: 'lpl_woolton',     city: 'liverpool',name: 'Woolton Semi',             address: '8 Allerton Rd, L25',            cost: 290000,   ...T(2) },
  { id: 'lpl_crosby',      city: 'liverpool',name: 'Crosby House',             address: '14 Coronation Rd, L23',         cost: 245000,   ...T(2) },
  { id: 'lpl_calderstones',city: 'liverpool',name: 'Calderstones Mansion',     address: '92 Menlove Ave, L18',           cost: 1600000,  ...T(3) },
  { id: 'lpl_southport',   city: 'liverpool',name: 'Southport Manor',          address: 'Birkdale Hall, PR8',            cost: 4200000,  ...T(4) },

  // ── Miami ──
  { id: 'mia_overtown',    city: 'miami',    name: 'Overtown Walk-up',         address: '1623 NW 3rd Ave',               cost: 36000,    ...T(1) },
  { id: 'mia_wynwood',     city: 'miami',    name: 'Wynwood Loft',             address: '250 NW 24th St',                cost: 58000,    ...T(1) },
  { id: 'mia_brickell',    city: 'miami',    name: 'Brickell Condo',           address: '485 Brickell Ave #1604',        cost: 480000,   ...T(2) },
  { id: 'mia_aventura',    city: 'miami',    name: 'Aventura Apartment',       address: '18101 Collins Ave #2806',       cost: 390000,   ...T(2) },
  { id: 'mia_pinecrest',   city: 'miami',    name: 'Pinecrest Estate',         address: '7250 SW 122nd St',              cost: 2800000,  ...T(3) },
  { id: 'mia_fisher_island',city: 'miami',   name: 'Fisher Island Mansion',    address: '6822 Valencia Dr',              cost: 14000000, ...T(4) },

  // ── Paris ──
  { id: 'par_belleville',  city: 'paris',    name: 'Belleville Studio',        address: '9 Rue de la Mare, 75020',       cost: 44000,    ...T(1) },
  { id: 'par_pigalle',     city: 'paris',    name: 'Pigalle Walk-up',          address: '21 Rue Frochot, 75009',         cost: 58000,    ...T(1) },
  { id: 'par_st_germain',  city: 'paris',    name: 'Saint-Germain Apt',        address: '14 Rue Jacob, 75006',           cost: 620000,   ...T(2) },
  { id: 'par_montmartre',  city: 'paris',    name: 'Montmartre Apartment',     address: '27 Rue des Abbesses, 75018',    cost: 480000,   ...T(2) },
  { id: 'par_etoile',      city: 'paris',    name: 'Étoile Mansion',           address: '8 Avenue Marceau, 75008',       cost: 3400000,  ...T(3) },
  { id: 'par_loire',       city: 'paris',    name: 'Loire Valley Château',     address: 'Domaine de Chambord, 41250',    cost: 11000000, ...T(4) },

  // ── Bangkok ──
  { id: 'bkk_silom',       city: 'bangkok',  name: 'Silom Studio',             address: '91 Pan Rd, Bangrak',            cost: 24000,    ...T(1) },
  { id: 'bkk_chinatown',   city: 'bangkok',  name: 'Yaowarat Shophouse',       address: '458 Charoen Krung Rd',          cost: 32000,    ...T(1) },
  { id: 'bkk_asok',        city: 'bangkok',  name: 'Asok Condo',               address: 'Sukhumvit Soi 21 #1804',        cost: 260000,   ...T(2) },
  { id: 'bkk_ari',         city: 'bangkok',  name: 'Ari Loft',                 address: 'Phaholyothin Soi 4',            cost: 185000,   ...T(2) },
  { id: 'bkk_riverside',   city: 'bangkok',  name: 'Chao Phraya Penthouse',    address: 'Mandarin Oriental Residences PH', cost: 1400000, ...T(3) },
  { id: 'bkk_koh_samui',   city: 'bangkok',  name: 'Koh Samui Beach Estate',   address: 'Bo Phut Beach Rd',              cost: 5400000,  ...T(4) },

  // ── Sydney ──
  { id: 'syd_kings_cross', city: 'sydney',   name: 'Kings Cross Studio',       address: '18 Macleay St, NSW 2011',       cost: 42000,    ...T(1) },
  { id: 'syd_newtown',     city: 'sydney',   name: 'Newtown Terrace Cottage',  address: '145 King St, NSW 2042',         cost: 58000,    ...T(1) },
  { id: 'syd_paddington',  city: 'sydney',   name: 'Paddington Terrace',       address: '92 Oxford St, NSW 2021',        cost: 410000,   ...T(2) },
  { id: 'syd_manly',       city: 'sydney',   name: 'Manly Beach Apt',          address: '12 The Esplanade, NSW 2095',    cost: 380000,   ...T(2) },
  { id: 'syd_pointpiper',  city: 'sydney',   name: 'Point Piper Mansion',      address: '14 Wolseley Cres',              cost: 3200000,  ...T(3) },
  { id: 'syd_hunter',      city: 'sydney',   name: 'Hunter Valley Estate',     address: 'Pokolbin Vineyard Hall',        cost: 7800000,  ...T(4) },

  // ── Rio ──
  { id: 'rio_santa_teresa',city: 'rio',      name: 'Santa Teresa Bedsit',      address: 'Rua Almte. Alexandrino, 412',   cost: 32000,    ...T(1) },
  { id: 'rio_botafogo',    city: 'rio',      name: 'Botafogo Apartment',       address: 'Rua São Clemente, 88',          cost: 48000,    ...T(1) },
  { id: 'rio_ipanema',     city: 'rio',      name: 'Ipanema Apt',              address: 'Rua Vinícius de Moraes, 132',   cost: 420000,   ...T(2) },
  { id: 'rio_barra',       city: 'rio',      name: 'Barra da Tijuca Apt',      address: 'Av. Lúcio Costa, 4500 #1101',   cost: 310000,   ...T(2) },
  { id: 'rio_gavea',       city: 'rio',      name: 'Gávea Mansion',            address: 'Estrada da Gávea, 924',         cost: 1500000,  ...T(3) },
  { id: 'rio_angra',       city: 'rio',      name: 'Angra dos Reis Compound',  address: 'Ilha do Tibau, Angra',          cost: 5500000,  ...T(4) },

  // ── Moscow ──
  { id: 'mow_chertanovo',  city: 'moscow',   name: 'Chertanovo Bedsit',        address: 'Sumskoy Proyezd, 6',            cost: 28000,    ...T(1) },
  { id: 'mow_basmanny',    city: 'moscow',   name: 'Basmanny Walk-up',         address: 'Pokrovka Ulitsa, 18',           cost: 44000,    ...T(1) },
  { id: 'mow_zamoskvorech',city: 'moscow',   name: 'Zamoskvorechye Apt',       address: 'Bolshaya Ordynka, 41',          cost: 360000,   ...T(2) },
  { id: 'mow_tverskoy',    city: 'moscow',   name: 'Tverskoy Apartment',       address: 'Tverskaya Ulitsa, 27',          cost: 440000,   ...T(2) },
  { id: 'mow_skolkovo',    city: 'moscow',   name: 'Skolkovo Mansion',         address: 'Ulitsa Lugovaya, 12',           cost: 2400000,  ...T(3) },
  { id: 'mow_zhukovka',    city: 'moscow',   name: 'Zhukovka Country Estate',  address: 'Pyatnitskoye Shosse, km 8',     cost: 6500000,  ...T(4) },

  // ── Cape Town ──
  { id: 'cpt_woodstock',   city: 'cape_town',name: 'Woodstock Loft',           address: '312 Albert Rd',                 cost: 34000,    ...T(1) },
  { id: 'cpt_obs',         city: 'cape_town',name: 'Observatory Cottage',      address: '18 Trill Rd',                   cost: 42000,    ...T(1) },
  { id: 'cpt_greenpoint',  city: 'cape_town',name: 'Green Point Apt',          address: '142 Beach Rd',                  cost: 310000,   ...T(2) },
  { id: 'cpt_kloof',       city: 'cape_town',name: 'Kloof Street Apt',         address: '92 Kloof St',                   cost: 260000,   ...T(2) },
  { id: 'cpt_clifton',     city: 'cape_town',name: 'Clifton Beachfront',       address: '21 Victoria Rd, Bungalow 4',    cost: 2200000,  ...T(3) },
  { id: 'cpt_franschhoek', city: 'cape_town',name: 'Franschhoek Wine Estate',  address: '234 Franschhoek Pass Rd',       cost: 5300000,  ...T(4) },

  // ─── Las Vegas ────────────────────────────────────────
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

  // ─── Hong Kong ────────────────────────────────────────
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

  // ─── Berlin ────────────────────────────────────────────
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

  // ─── Mexico City ───────────────────────────────────────
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

  // ─── Amsterdam ─────────────────────────────────────────
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

  // ─── Detroit ───────────────────────────────────────────
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
  { id: 'dumbbells',   name: 'Dumbbells',         emoji: '💪', energy: 2, cost: 80,   buffs: { strength: 1 },                       desc: 'Light hypertrophy work.' },
  { id: 'bench',       name: 'Bench Press',       emoji: '🏋️', energy: 4, cost: 220,  buffs: { strength: 3 },                       desc: 'Classic chest press.' },
  { id: 'squat_rack',  name: 'Squat Rack',        emoji: '🦵', energy: 6, cost: 420,  buffs: { strength: 3, defence: 1 },           desc: 'Heavy squats build strength and a tougher core.' },
  { id: 'deadlift',    name: 'Deadlift Platform', emoji: '🏋️', energy: 7, cost: 520,  buffs: { strength: 4, defence: 2 },           desc: 'Pull big weight off the floor.' },
  { id: 'punching',    name: 'Punching Bag',      emoji: '🥊', energy: 3, cost: 160,  buffs: { speed: 2 },                          desc: 'Footwork and snap.' },
  { id: 'speed_bag',   name: 'Speed Bag',         emoji: '🥊', energy: 3, cost: 220,  buffs: { speed: 3 },                          desc: 'Hand-eye coordination drill.' },
  { id: 'treadmill',   name: 'Treadmill',         emoji: '🏃', energy: 4, cost: 260,  buffs: { speed: 2, defence: 1 },              desc: 'Cardio for stamina and burst speed.' },
  { id: 'heavy_bag',   name: 'Heavy Bag',         emoji: '🥊', energy: 5, cost: 320,  buffs: { strength: 2, speed: 2 },             desc: 'Power and footwork together.' },
  { id: 'def_drills',  name: 'Defensive Drills',  emoji: '🛡️', energy: 4, cost: 260,  buffs: { defence: 3 },                        desc: 'Slip, block, parry — take a hit.' },
  { id: 'cross_train', name: 'Cross-Training',    emoji: '⚡', energy: 8, cost: 850,  buffs: { strength: 2, defence: 2, speed: 2 }, desc: 'All-round circuit. Expensive and exhausting.' },
];

// Shooting range drills — consume rounds of the equipped weapon's ammo type.
// Train accuracy (a temp buff that affects ranged hit chance in combat).
export const RANGE_DRILLS = [
  { id: 'plinking',    name: 'Plinking',         emoji: '🎯', energy: 2, ammo: 8,  buff: 1,  desc: 'Casual target practice with paper sheets.' },
  { id: 'quick_draw',  name: 'Quick Draw',       emoji: '🎯', energy: 3, ammo: 15, buff: 3,  desc: 'Speed drills — holster to target.' },
  { id: 'steady_aim',  name: 'Steady Aim',       emoji: '🎯', energy: 4, ammo: 25, buff: 5,  desc: 'Slow, controlled shooting at static targets.' },
  { id: 'marksman',    name: 'Marksman Course',  emoji: '🎯', energy: 6, ammo: 50, buff: 9,  desc: 'Long-range precision, varied positions.' },
  { id: 'sniper_ex',   name: 'Sniper Exercises', emoji: '🎯', energy: 8, ammo: 80, buff: 14, desc: 'Advanced extended-range work.' },
];

// University courses — permanent intelligence gain. Cost scales with current
// intelligence so each subsequent point is more expensive. Each course has
// a long cooldown to prevent spam — bigger gains take much longer.
export const UNIVERSITY_COURSES = [
  { id: 'online',     name: 'Online Course',       emoji: '💻',  energy: 4,  baseCost: 80,   gain: 1, cooldownSec: 4 * 3600,    desc: 'Self-paced, cheap, slow gains.' },             // 4h
  { id: 'community',  name: 'Community College',   emoji: '🎓',  energy: 6,  baseCost: 280,  gain: 2, cooldownSec: 12 * 3600,   desc: 'Two-year programme crammed into one session.' },// 12h
  { id: 'university', name: 'University Lectures', emoji: '🏛️',  energy: 9,  baseCost: 800,  gain: 4, cooldownSec: 24 * 3600,   desc: 'Top-tier institution, real depth.' },           // 1 day
  { id: 'private',    name: 'Private Tutor',       emoji: '👨‍🏫',  energy: 12, baseCost: 2200, gain: 7, cooldownSec: 72 * 3600,   desc: 'One-on-one with a specialist.' },               // 3 days
];

// On-demand boosts. `cat` groups them on the UI: cafe / bar / food / pharmacy / smoke.
// `effects` are added to current vitals up to caps. Cooldowns are per-item per-character.
export const CONSUMABLES = [
  // ☕ Café — energy
  { id: 'coffee',       cat: 'cafe',     name: 'Coffee',          emoji: '☕',  cost: 80,    effects: { energy: 10 },                cooldownMin: 5  },
  { id: 'energy_drink', cat: 'cafe',     name: 'Energy Drink',    emoji: '⚡',  cost: 300,   effects: { energy: 25 },                cooldownMin: 30 },
  { id: 'pre_workout',  cat: 'cafe',     name: 'Pre-Workout Mix', emoji: '💪',  cost: 1200,  effects: { energy: 50, nerve: 1 },      cooldownMin: 90 },
  // 🍺 Bar — happiness, light nerve
  { id: 'beer',         cat: 'bar',      name: 'Beer',            emoji: '🍺',  cost: 50,    effects: { happiness: 6 },              cooldownMin: 10 },
  { id: 'whiskey',      cat: 'bar',      name: 'Whiskey',         emoji: '🥃',  cost: 220,   effects: { happiness: 15, nerve: 2 },   cooldownMin: 30 },
  { id: 'champagne',    cat: 'bar',      name: 'Champagne',       emoji: '🍾',  cost: 900,   effects: { happiness: 35 },             cooldownMin: 60 },
  // 🍴 Restaurant — energy + happiness
  { id: 'burger',       cat: 'food',     name: 'Diner Burger',    emoji: '🍔',  cost: 60,    effects: { energy: 8, happiness: 3 },   cooldownMin: 20 },
  { id: 'steak',        cat: 'food',     name: 'Ribeye Steak',    emoji: '🥩',  cost: 380,   effects: { energy: 20, happiness: 10 }, cooldownMin: 45 },
  { id: 'tasting',      cat: 'food',     name: 'Tasting Menu',    emoji: '🍽️',  cost: 2800,  effects: { energy: 35, happiness: 30 }, cooldownMin: 120 },
  // 💊 Pharmacy — health, nerve
  { id: 'painkillers',  cat: 'pharmacy', name: 'Painkillers',     emoji: '💊',  cost: 500,   effects: { health: 25 },                cooldownMin: 30 },
  { id: 'first_aid',    cat: 'pharmacy', name: 'First Aid Kit',   emoji: '🩹',  cost: 1500,  effects: { health: 60 },                cooldownMin: 60 },
  { id: 'adrenaline',   cat: 'pharmacy', name: 'Adrenaline Shot', emoji: '💉',  cost: 2200,  effects: { nerve: 5, health: 10 },      cooldownMin: 90 },
  // 🚬 Smoke — happiness
  { id: 'cigar',        cat: 'smoke',    name: 'Premium Cigar',   emoji: '🚬',  cost: 150,   effects: { happiness: 12 },             cooldownMin: 30 },
  { id: 'cuban',        cat: 'smoke',    name: 'Cuban Cigar',     emoji: '🚬',  cost: 700,   effects: { happiness: 25, nerve: 1 },   cooldownMin: 60 },
];

export const CONSUMABLE_CATS = {
  cafe:     { name: 'Café',       emoji: '☕'  },
  bar:      { name: 'Bar',        emoji: '🍺' },
  food:     { name: 'Restaurant', emoji: '🍴' },
  pharmacy: { name: 'Pharmacy',   emoji: '💊' },
  smoke:    { name: 'Tobacco',    emoji: '🚬' },
};

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
export const jobById = id => byId(JOBS, id);
export const drugById = id => byId(DRUGS, id);
export const weaponById = id => byId(WEAPONS, id);
export const armourById = id => byId(ARMOUR, id);
export const businessById = id => byId(BUSINESSES, id);
export const propertyById = id => byId(PROPERTIES, id);
export const stockById = id => byId(STOCKS, id);
export const enemyById = id => byId(ENEMIES, id);
export const ammoById = id => byId(AMMO, id);
export const consumableById = id => byId(CONSUMABLES, id);

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
export const STAT_CAPS = {
  strength:     35,
  defence:      30,
  speed:        30,
  intelligence: 110,
};

// ── Fight Club moves ────────────────────────────────────────────────────
// Each turn the player picks one move; the enemy AI rolls its own from a
// weighted distribution. `dmgMul` scales (strength + weapon.dmg). `hit`
// is the base hit chance (further nudged by speed differential). `crit`
// rolls only on a successful hit and doubles the damage. `block` is the
// only defensive move — skips the player's attack but halves incoming
// damage on the enemy's reply.
export const COMBAT_MOVES = [
  { id: 'jab',      name: 'Jab',      emoji: '👊',  dmgMul: 0.6,  hit: 0.95, crit: 0.05, desc: 'Quick and almost always lands.' },
  { id: 'cross',    name: 'Cross',    emoji: '🥊',  dmgMul: 0.85, hit: 0.85, crit: 0.10, desc: 'A solid straight punch.' },
  { id: 'hook',     name: 'Hook',     emoji: '🪝',  dmgMul: 1.10, hit: 0.75, crit: 0.15, desc: 'Wider arc, harder hit.' },
  { id: 'uppercut', name: 'Uppercut', emoji: '⬆️',  dmgMul: 1.30, hit: 0.65, crit: 0.20, desc: 'Comes from below — easy to miss, brutal when it lands.' },
  { id: 'haymaker', name: 'Haymaker', emoji: '💥',  dmgMul: 1.60, hit: 0.50, crit: 0.30, desc: 'All-in. Telegraphed, devastating, rarely connects.' },
  { id: 'block',    name: 'Block',    emoji: '🛡️',  dmgMul: 0,    hit: 1.00, crit: 0,    desc: 'Brace. Skip your attack, take 50% reduced damage on reply.', defensive: true },
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

// ── General Store: miscellaneous items ──────────────────────────────────
//
// `kind = 'misc'` rows in the inventory table. Most are mission props with
// no direct effect; a few have light vital effects so the page is useful
// outside missions. `effects` applies to vitals on /use; `oneShotCash`
// describes a randomised cash payout (lottery scratchers).
export const MISC_ITEMS = [
  { id: 'flowers',         name: 'Bouquet of Flowers', emoji: '💐', cost: 35,  desc: 'A cheap mood-lifter. Use to bump happiness.', effects: { happiness: 5 } },
  { id: 'chocolate_box',   name: 'Box of Chocolates',  emoji: '🍫', cost: 80,  desc: 'A small indulgence.',                          effects: { happiness: 8 } },
  { id: 'lottery_ticket',  name: 'Lottery Scratcher',  emoji: '🎟️', cost: 50,  desc: 'Scratch & pray. Prizes from £50 all the way up to a £100,000 jackpot.',
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
  { id: 'lockpick_set',    name: 'Lockpick Set',       emoji: '🗝️', cost: 180, desc: 'Required for some jobs. Single-use.',          missionOnly: true },
  { id: 'burner_phone',    name: 'Burner Phone',       emoji: '📱', cost: 120, desc: 'Untraceable. Burned after one call.',          missionOnly: true },
  { id: 'duct_tape',       name: 'Duct Tape',          emoji: '🩹', cost: 40,  desc: 'Holds the world together.',                    missionOnly: true },
  { id: 'gloves',          name: 'Leather Gloves',     emoji: '🧤', cost: 80,  desc: 'No fingerprints, no problems.',                missionOnly: true },
  { id: 'ski_mask',        name: 'Ski Mask',           emoji: '🎭', cost: 150, desc: 'For when subtlety is overrated.',              missionOnly: true },
  { id: 'zip_ties',        name: 'Zip Ties',           emoji: '⛓️', cost: 40,  desc: 'For uncooperative bystanders.',                missionOnly: true },
  { id: 'flashlight',      name: 'Tactical Flashlight',emoji: '🔦', cost: 60,  desc: 'Dark places, bright ideas.',                   missionOnly: true },
  { id: 'gas_can',         name: 'Gas Can',            emoji: '⛽', cost: 100, desc: 'Combustible. Not for the squeamish.',          missionOnly: true },
  { id: 'usb_drive',       name: 'USB Drive',          emoji: '💾', cost: 150, desc: 'Encrypted payload, ready to drop.',            missionOnly: true },
];

export const miscItemById = id => byId(MISC_ITEMS, id);

// ── Daily Missions ──────────────────────────────────────────────────────
//
// Three are rolled per character per UTC day. `target` is the count required.
// `xp` and `cash` are at level 1 — both scale with character level on roll
// (see services/missions.js). `type` ties into bumpMission() calls scattered
// across the routes; some types accept a `meta` filter (e.g. specific item).
//
// `tier` is purely cosmetic ('easy' / 'med' / 'hard') and influences the
// roll mix — we always pick one of each tier for variety.
export const DAILY_MISSIONS = [
  // ── easy ──
  { id: 'streetwise',  tier: 'easy', name: 'Streetwise',     emoji: '🥷',  desc: 'Pull off 5 successful street-tier crimes.',          target: 5, type: 'crime_success', meta: { tier: 'street' }, xp: 60,  cash: 250  },
  { id: 'gym_rat',     tier: 'easy', name: 'Gym Rat',        emoji: '🏋️',  desc: 'Complete 3 gym training sessions.',                  target: 3, type: 'gym_session',                              xp: 50,  cash: 200  },
  { id: 'scholar',     tier: 'easy', name: 'Scholar',        emoji: '🎓',  desc: 'Take 2 university courses.',                         target: 2, type: 'university_class',                         xp: 70,  cash: 250  },
  { id: 'paycheck',    tier: 'easy', name: 'Punch the Clock',emoji: '⏰',  desc: 'Check in for 1 work shift.',                         target: 1, type: 'job_checkin',                              xp: 60,  cash: 200  },
  { id: 'prep_kit',    tier: 'easy', name: 'Prep Kit',       emoji: '🎒',  desc: 'Use any 3 items from the General Store.',            target: 3, type: 'misc_use_any',                             xp: 50,  cash: 200  },

  // ── med ──
  { id: 'shadow',      tier: 'med',  name: 'Shadow Operator',emoji: '💻',  desc: 'Complete 3 successful cyber-tier crimes.',           target: 3, type: 'crime_success', meta: { tier: 'cyber' },  xp: 220, cash: 1200 },
  { id: 'joyride',     tier: 'med',  name: 'Joyride',        emoji: '🚗',  desc: 'Steal 2 vehicles via Grand Theft Auto.',             target: 2, type: 'crime_success', meta: { tier: 'gta' },    xp: 200, cash: 1000 },
  { id: 'pusher',      tier: 'med',  name: 'Pusher',         emoji: '💊',  desc: 'Sell drugs 5 times.',                                target: 5, type: 'drug_sale',                                xp: 200, cash: 800  },
  { id: 'bruiser',     tier: 'med',  name: 'Bruiser',        emoji: '🥊',  desc: 'Win 2 fights at the Fight Club.',                    target: 2, type: 'combat_win',                               xp: 240, cash: 1200 },
  { id: 'ghost_caller',tier: 'med',  name: 'Ghost Caller',   emoji: '📱',  desc: 'Burn 2 burner phones.',                              target: 2, type: 'misc_use', meta: { item: 'burner_phone' }, xp: 220, cash: 1100 },
  { id: 'cracksman',   tier: 'med',  name: 'Cracksman',      emoji: '🗝️',  desc: 'Use a Lockpick Set.',                                target: 1, type: 'misc_use', meta: { item: 'lockpick_set' }, xp: 200, cash: 1000 },

  // ── hard ──
  { id: 'big_score',   tier: 'hard', name: 'Big Score',      emoji: '💰',  desc: 'Pull off 1 major-tier crime.',                       target: 1, type: 'crime_success', meta: { tier: 'major' },  xp: 600, cash: 4000 },
  { id: 'arsonist',    tier: 'hard', name: 'Arsonist',       emoji: '🔥',  desc: 'Empty a Gas Can on the right doorstep.',             target: 1, type: 'misc_use', meta: { item: 'gas_can' },     xp: 400, cash: 2500 },
  { id: 'data_drop',   tier: 'hard', name: 'Data Drop',      emoji: '💾',  desc: 'Plant 2 USB drives.',                                target: 2, type: 'misc_use', meta: { item: 'usb_drive' },   xp: 500, cash: 3000 },
];

export const missionById = id => byId(DAILY_MISSIONS, id);

// ── Organised Crimes (multi-player heists) ────────────────────────────
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
    id: 'cargo_hijack', name: 'Cargo Ship Hijack', emoji: '🚢',
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
    id: 'bank_heist', name: 'Bank Heist', emoji: '🏦',
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
    id: 'casino_score', name: 'Casino Score', emoji: '🎰',
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
    id: 'crypto_exchange', name: 'Crypto Exchange Drain', emoji: '💻',
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
