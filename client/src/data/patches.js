// Patch notes for the public Updates page. Newest entries go on top —
// the page reads this array straight through.
//
// Each entry: { version, date (YYYY-MM-DD), title, sections: [{ heading, notes: [strings] }] }
//   - heading is optional; bare entries can pass `notes` at the top level.
//   - notes are plain strings; the page renders one bullet per entry.
//
// Add a new entry every time we ship a meaningful change to production.

export const PATCHES = [
  {
    version: '0.7.0',
    date: '2026-05-05',
    title: 'Patches & Updates page · tabbed City',
    sections: [
      {
        heading: 'New',
        notes: [
          'Public Patches & Updates page (no login needed) — you\'re looking at it.',
          'City page is now tabbed: Around Town, Underworld, Territories, World Map. Active tab is remembered between visits.',
        ],
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-05-05',
    title: 'Jail escape · faction reputation · bounty board · the Fence',
    sections: [
      {
        heading: 'Jail',
        notes: [
          'New Run-for-it action: 50/50 chance to escape. Fail and your timer resets to 2× your original sentence — late attempts hurt more than early ones.',
          'Heat now extends sentences when you get jailed: heat 50 = 1.5× the time, heat 100 = 2×.',
        ],
      },
      {
        heading: 'PvP',
        notes: [
          'Faction reputation: each faction\'s share of all crime activity, summing to 100%. Visible at the top of the Players page.',
          'Bounty board: post cash on a player\'s head from their profile. Anyone who murders them collects automatically (PvP murder, async murder — both pay out). Cancel for a refund any time.',
        ],
      },
      {
        heading: 'Economy',
        notes: [
          'The Fence (city underworld) replaces business laundering: 70% conversion of illegal → legal cash, with a sting risk that scales with the size of the wash.',
          'All "clean / dirty" labels renamed to "legal / illegal" cash across the UI.',
          'Businesses now visibly cap at 24h of unclaimed income — yellow warning at 18h, red "capped" notice past 24h.',
        ],
      },
      {
        heading: 'Fixes',
        notes: [
          'Resolved 9 duplicate vehicle IDs in the catalogue (Civic Si, WRX base, A6 Quattro, DB11 V12, Urus S, Roma Spider, 720S Spider, Corolla XSE, Mazda3 Turbo).',
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-05-04',
    title: 'Driving across the country · condition · repairs · races',
    sections: [
      {
        heading: 'New',
        notes: [
          'Drive between cities connected by road (US triangle, Eurasian chain, Moscow↔Dubai, Moscow↔Hong Kong). Cheaper than flying, takes longer, and skips airport customs — useful when you\'re carrying drugs.',
          'Vehicle condition (0-100%): bought cars start at 100%, stolen cars at 75-100%. Condition decays as you drive between cities and scales every sell payout.',
          'Repair Shop in every city: brings the active car back to 100%. Cost scales with damage and book value.',
          'Street races: challenge another player from their profile, both put up a stake, winner takes the pot. Win odds factor in car stats and driving skill; both cars take 5-20% condition damage either way.',
          'Driving School: permanent driving-skill training. Higher driving improves race odds and softens condition damage.',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-05-03',
    title: 'Active car system · garages · shipping · drug-sell busts',
    sections: [
      {
        heading: 'Vehicles',
        notes: [
          'You drive at most one active car; everything else lives in a city-bound garage.',
          'Per-property garage capacity (tier 1 = 2, tier 2 = 4, tier 3 = 8, tier 4 = 12). Buy a property in a city to park cars there.',
          'Ship a car between cities — same time as a business-class flight, with a destination free-space check.',
          'Travel: stash the active car (or sell it) before flying out.',
        ],
      },
      {
        heading: 'Economy',
        notes: [
          'Vehicle prices ×1.5 across the catalogue.',
          'Starter pack budget tightened to £100k; starter cars expanded to span tier 1-3 so the priciest combo always forces tradeoffs.',
        ],
      },
      {
        heading: 'Risk',
        notes: [
          'Selling drugs now rolls a bust chance: 3% baseline + 0.5% per unit, capped at 25%. On bust the stash is seized and you\'re jailed.',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-05-02',
    title: 'Per-city storefronts · gun shop chrome · mobile polish',
    sections: [
      {
        heading: 'Stores',
        notes: [
          'Each city has its own gun shop, general store, car dealer and chop-shop name.',
          'Gun shops in New York / LA / Miami (Tex\'s Gun Shop), London (Holland & Holland\'s Weaponry), Kingston (Yardie Gun Shop), Rio (Pelé\'s Arms), Paris (Maison Leblanc), Tokyo (Takumi\'s Firearms), Dubai (Dubai Gun Store) and Cape Town (Boet\'s Boomsticks) ship with shopkeeper photos.',
          'Around-Town tile names are now generic (Bank, Car Dealership, Weapon Dealer, etc.) — the storefront branding lives inside each shop.',
        ],
      },
      {
        heading: 'UX',
        notes: [
          'Show / hide password toggle on the auth form.',
          'Header reorganised on mobile: name + level + rank moved to the dashboard\'s character-sheet card, the silhouette in the dashboard graphic links to it.',
          'Inventory vehicle cards no longer overflow on narrow phones; action buttons stack full-width.',
        ],
      },
    ],
  },
];
