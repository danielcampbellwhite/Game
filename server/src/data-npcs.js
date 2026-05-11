// Named city contacts. Each NPC is tied to one service (fence, doc,
// fixer, forger, bent-cop, etc.) in one city. Per-player relationship
// scores live in npc_relationships (managed by services/npcs.js).
//
// Score bands (used by the consuming route to compute a discount or
// bonus):
//   0–2   stranger      — no bonus
//   3–9   regular       — +1–2% perk
//   10–19 trusted       — +3–4% perk
//   20+   inner circle  — +5% perk (cap)
//
// `role` ties the NPC to the route that consumes them. v1 ships with
// one fence per city; expansion just appends more entries here.

export const NPCS = [
  // Fences — one per city, used by routes/fence.js. The 'fence' role
  // is wired live; other roles are scaffolded for future passes.
  { id: 'fence_new_york',    role: 'fence', city: 'new_york',    name: 'Solly "the Sponge" Korman',   blurb: 'Pawnshop in Brooklyn, never asks questions. Tips well to street kids who run for him.' },
  { id: 'fence_los_angeles', role: 'fence', city: 'los_angeles', name: 'Reggie "Two-Tone" Vega',       blurb: 'Out of a body shop in Highland Park. Pays in clean bills, no fuss.' },
  { id: 'fence_miami',       role: 'fence', city: 'miami',       name: 'Esperanza Cruz',               blurb: 'Runs the back office of a Little Havana cigar shop. Reads people before she reads money.' },
  { id: 'fence_kingston',    role: 'fence', city: 'kingston',    name: '"Babylon" Brown',              blurb: 'Half-Way Tree record shop. Half the dub plates are clean cash, the other half are dirty.' },
  { id: 'fence_rio',         role: 'fence', city: 'rio',         name: 'Juliana "Sombra" Ribeiro',     blurb: 'Operates out of a Lapa nightclub. Pays in dollars, never reais.' },
  { id: 'fence_london',      role: 'fence', city: 'london',      name: '"Posh" Pete Whitaker',         blurb: 'Mayfair antiques dealer by day. The portraits in the back room are all fakes.' },
  { id: 'fence_liverpool',   role: 'fence', city: 'liverpool',   name: 'Tommy "Knees" Doyle',          blurb: 'Toxteth boxing gym. The till has two compartments.' },
  { id: 'fence_paris',       role: 'fence', city: 'paris',       name: 'Henri "Le Chat" Moreau',       blurb: 'Brocante stall in Saint-Ouen. Quiet smile, very loud connections.' },
  { id: 'fence_berlin',      role: 'fence', city: 'berlin',      name: 'Klaus "Schatten" Vogel',       blurb: 'Friedrichshain galerie. Buys art he won\'t hang, sells art that doesn\'t exist.' },
  { id: 'fence_moscow',      role: 'fence', city: 'moscow',      name: 'Nadia "Lisa" Volkova',         blurb: 'Tsvetnoy market exporter. Crates of fur to Hamburg, briefcases back.' },
  { id: 'fence_dubai',       role: 'fence', city: 'dubai',       name: 'Yusuf "Gold-Hand" Karim',      blurb: 'Gold Souk corner shop. Will weigh anything, judge nothing.' },
  { id: 'fence_tokyo',       role: 'fence', city: 'tokyo',       name: 'Ryu "Kage" Sato',              blurb: 'Roppongi karaoke parlour. The middle floor is soundproof for two reasons.' },
  { id: 'fence_hong_kong',   role: 'fence', city: 'hong_kong',   name: 'Wei "Whisper" Cheung',         blurb: 'Causeway Bay jeweller. Speaks five languages but mostly listens.' },
  { id: 'fence_sydney',      role: 'fence', city: 'sydney',      name: '"Bondi" Banno Murphy',         blurb: 'Surf shop on Campbell Parade. Boards in, cash out.' },
  { id: 'fence_cape_town',   role: 'fence', city: 'cape_town',   name: 'Sipho "Two-Step" Mokoena',     blurb: 'Sea Point auction house. Lots described loosely on purpose.' },
];

export function npcById(id) {
  return NPCS.find(n => n.id === id) || null;
}

export function npcsInCity(city, role = null) {
  return NPCS.filter(n => n.city === city && (!role || n.role === role));
}

// Convenience for routes that have a single NPC per (city, role).
export function fenceFor(city) {
  return NPCS.find(n => n.city === city && n.role === 'fence') || null;
}

// Score → perk band. The consuming route decides what the bonus does;
// here we just describe the strength.
export function relationshipBand(score) {
  if (score >= 20) return { tier: 'inner', label: 'Inner circle', bonus: 0.05 };
  if (score >= 10) return { tier: 'trusted', label: 'Trusted',       bonus: 0.03 };
  if (score >= 3)  return { tier: 'regular', label: 'Regular',       bonus: 0.01 };
  return { tier: 'stranger', label: 'Stranger', bonus: 0 };
}
