// Tiered gyms catalogue. Kept in its own file so the gym rework
// could ship without an edit to the (very large) main data.js.
// routes/gym.js imports GYMS / GYM_MACHINES from here; the old
// GYM_MACHINES still exported by data.js is dead code now.
//
// Players pay a weekly membership to use the machines, no per-session
// cash cost. Energy per session is high enough that a fresh bar gets
// you a handful of reps and you have to wait or rest before grinding
// again. Higher-tier gyms unlock more machines AND scale the
// permanent stat-gain rate (see routes/gym.js).

export const GYMS = [
  { id: 'backstreet',   name: 'Backstreet Gym',   tier: 1, levelGate: 1,  weeklyFee: 2500,   progressionMul: 0.75, blurb: 'Cracked plates, sticky floor, posters from 1987. Cheap, no questions asked.' },
  { id: 'iron_foundry', name: 'Iron Foundry',     tier: 2, levelGate: 15, weeklyFee: 15000,  progressionMul: 1.00, blurb: 'Serious lifters and a competent boxing room. Costs real money.' },
  { id: 'elite',        name: 'Elite Compound',   tier: 3, levelGate: 40, weeklyFee: 80000,  progressionMul: 1.50, blurb: 'Private members\' club with Olympic-spec kit. Pro-grade programmes, pro-grade pricing.' },
];
export const gymById = id => GYMS.find(g => g.id === id) || null;

// Each machine has a `minTier` — players need an active membership at
// that tier or higher to use it. Energy costs scaled up roughly 3×
// vs. the old single-tier gym so energy actually rate-limits you
// even with full property/prestige bonuses.
export const GYM_MACHINES = [
  // Tier 1 — the basics, available to anyone with a membership.
  { id: 'dumbbells',   name: 'Dumbbells',         emoji: '', minTier: 1, energy: 6,  buffs: { strength: 1 },                       desc: 'Light hypertrophy work.' },
  { id: 'punching',    name: 'Punching Bag',      emoji: '', minTier: 1, energy: 9,  buffs: { speed: 2 },                          desc: 'Footwork and snap.' },
  { id: 'treadmill',   name: 'Treadmill',         emoji: '', minTier: 1, energy: 12, buffs: { speed: 2, defence: 1 },              desc: 'Cardio for stamina and burst speed.' },
  { id: 'def_drills',  name: 'Defensive Drills',  emoji: '', minTier: 1, energy: 12, buffs: { defence: 3 },                        desc: 'Slip, block, parry — take a hit.' },
  // Tier 2 — Iron Foundry.
  { id: 'bench',       name: 'Bench Press',       emoji: '', minTier: 2, energy: 12, buffs: { strength: 3 },                       desc: 'Classic chest press.' },
  { id: 'squat_rack',  name: 'Squat Rack',        emoji: '', minTier: 2, energy: 18, buffs: { strength: 3, defence: 1 },           desc: 'Heavy squats build strength and a tougher core.' },
  { id: 'speed_bag',   name: 'Speed Bag',         emoji: '', minTier: 2, energy: 9,  buffs: { speed: 3 },                          desc: 'Hand-eye coordination drill.' },
  { id: 'heavy_bag',   name: 'Heavy Bag',         emoji: '', minTier: 2, energy: 15, buffs: { strength: 2, speed: 2 },             desc: 'Power and footwork together.' },
  // Tier 3 — Elite Compound.
  { id: 'deadlift',    name: 'Deadlift Platform', emoji: '', minTier: 3, energy: 21, buffs: { strength: 4, defence: 2 },           desc: 'Pull big weight off the floor.' },
  { id: 'cross_train', name: 'Cross-Training',    emoji: '', minTier: 3, energy: 24, buffs: { strength: 2, defence: 2, speed: 2 }, desc: 'All-round circuit. Expensive and exhausting.' },
];
