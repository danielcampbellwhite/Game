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
    version: '0.9.3',
    date: '2026-05-12',
    title: 'Gold Bars — premium currency + first three premium items',
    sections: [
      {
        heading: 'New currency · account-bound',
        notes: [
          'Gold Bars are a premium currency that lives on your USER account — not your character. They survive death, retirement, and prestige. Buy them once, never lose them.',
          'Top-up packs: 10 Bars for £1, 20 for £2, 50 for £5, 100 for £10. Real-money checkout via Stripe is wired up next; until then an admin can seed your balance so the rest of the system can be tested.',
          'Balance chip is in the top nav next to the mute button so you always know your stack.',
        ],
      },
      {
        heading: 'First three premium items',
        notes: [
          'Koenigsegg Jesko Absolut — 40 Bars · top-tier hyper, no level requirement, no wear and tear, follows you across every character.',
          'Burj Khalifa Penthouse — 50 Bars · T5 property in Dubai with a 15-car garage, max-tier bonuses, the most flex address in the game.',
          'Solid Gold M1911 — 15 Bars · gold-engraved pistol with top-tier handgun damage, pure cosmetic prestige.',
        ],
      },
      {
        heading: 'Design rules',
        notes: [
          'Stats match the existing top free tiers — premium = prestige flex, not pay-to-win.',
          'Premium items can\'t be sold, chopped, or traded — they always belong to you.',
          'Item display + materialisation onto the active character ships in the next iteration; this entry establishes the foundation (currency, store, ownership ledger).',
        ],
      },
    ],
  },
  {
    version: '0.9.2',
    date: '2026-05-12',
    title: 'Jail escape · investigator overhaul · crime sounds',
    sections: [
      {
        heading: 'Jail',
        notes: [
          'Run-for-it is now ONE attempt per sentence. Win and you walk; lose and your sentence doubles AND you sit it out — no more spam-clicking the door. A fresh conviction (new jail term) resets the counter, so you always get one shot at every stretch.',
        ],
      },
      {
        heading: 'Detective → trial (overhauled)',
        notes: [
          'The evidence-drip bar is gone. The case still opens when heat hits 50%, but charges now roll on every FAILED crime: chance = 1.5% × (heat - 50). So heat 60 = 15%, heat 75 = 37.5%, heat 100 = 75%. Successful crimes don\'t tip the inspector\'s hand.',
          'Heat-at-filing now curves the sentence — higher heat = more "evidence", so a heavier base sentence. Quadratic: heat 50 = 25m, heat 75 = 56m, heat 100 = 100m. Lawyers and bribes still apply.',
          'Dashboard banner shows your live "Court risk" percentage instead of a slow file-filling bar — it ticks up and down with your heat in real time.',
        ],
      },
      {
        heading: 'Crime sound effects + mute toggle',
        notes: [
          'Every crime commit now plays a short audio cue keyed to the outcome — tyre-screech for a clean GTA, keystroke clicks for cyber, gunshot for major heists, street panic for muggings, siren for caught/jailed, low thud for hospital, sad trombone for clean escapes.',
          'Mute toggle (speaker icon) in the top nav next to the bell. Preference persists across reloads.',
          'Synthesised placeholders ship today — drop real MP3s into client/public/sounds/<family>.mp3 (8 family names) and they auto-take over with no code change.',
        ],
      },
    ],
  },
  {
    version: '0.9.1',
    date: '2026-05-11',
    title: 'Economy hardening · twelve exploit fixes',
    sections: [
      {
        heading: 'Money printers off',
        notes: [
          'Gold Scratcher (Murphy\'s General Store) rebalanced. The old prize table paid back +112% on every ticket — buy 99, spam Use, walk away rich. New table is real-world scratcher math: ~85% payback, jackpot dialled to £250k. Still fun, no longer an ATM.',
          'Vehicle dealership arbitrage closed. Buying a car in a cheap city (Cape Town, businessMul 0.80) and selling in an expensive one (Dubai, 1.50) yielded a 12.5% round-trip gain. Trade-in is now capped to the depreciated purchase price; the dealer never pays you more than you paid them.',
          'Burglary cash mint closed. The £500 minimum-loot floor used to pay out even when the victim had £0 — meaning a freshly-rolled alt with an empty wallet was worth £500/hr to your main. The burglar\'s payout now matches what the victim actually loses, and XP/rep are gated on real take.',
        ],
      },
      {
        heading: 'PvP races + collusion',
        notes: [
          'Bounty self-collect (post bounty on alt, murder alt, collect) is dead. Same-user bounties are refunded to the placer instead of paid to the killer, and you can\'t post a bounty on your own alt in the first place.',
          'Murder and Rob no longer race their own SQL. The target\'s cash is debited atomically inside a transaction, so any parallel deposit/bet the target makes can\'t be silently overwritten by the attacker\'s save. The attacker is credited exactly what the target loses — never more, never less.',
          'New characters (3-day PvP protection window) can\'t move cash *out* to a gang treasury or initiate / accept trades. Closes the alt-mule cash funnel.',
        ],
      },
      {
        heading: 'Wash-trade taxes equalised',
        notes: [
          'Gang treasury withdrawals now take a 5% skim, matching the trade tax. The treasury was a tax-free transfer pipe between members — promote your alt to officer, deposit, withdraw, free transfer. Now there\'s the same friction as a trade.',
        ],
      },
      {
        heading: 'Casino + bank + stocks',
        notes: [
          'Bank loans: one open at a time. Stacking loans against an inflated stock-priced net worth and dumping the cash into illiquid assets (vehicles, properties, businesses) used to leave the auto-defaulter empty-handed. Repay before borrowing again.',
          'Stocks now have a small bid/ask spread (0.5% each side, 1% round-trip). Stops players parking cash in stocks just to dodge robbery — round-tripping costs something now.',
          'Blackjack hit/stand/double now gate on requireFreeCharacter, matching the rest of the casino. No more playing your hand from the cell.',
          'Daily reward streak resets cleanly on retire so prestige cycles start fresh.',
        ],
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-05-11',
    title: 'Realism pass · day/night · detectives · chases · burglary · property mods',
    sections: [
      {
        heading: 'Day & night',
        notes: [
          'Every city now has a local clock. Crime success chance shifts by time-of-day: cover-of-darkness jobs (mugging, break-ins, GTA) peak at night (+15-25%); crowd jobs (pickpocket, shoplift, phishing) peak in business hours; bank robberies invert and want a daytime crowd.',
          'Venues have opening hours. Casinos open 14:00-04:00 local; bookmakers stay open 24/7. Outside hours, the door is shut and you\'ll be told when it reopens.',
        ],
      },
      {
        heading: 'Detective, trial & criminal record',
        notes: [
          'Cross the heat threshold and a named detective opens a case on you. Every crime — successful or not — drips evidence into their file. Failed jobs drip 1.6× more.',
          'When the file fills, charges are filed and you\'re hauled into court. The Trial page lets you plead guilty (60% sentence, certain conviction), hire up to 3 lawyers (each shaves 20% off effective evidence), bribe the judge (-30% conviction chance), or take your chances at trial.',
          'Convictions stack into a permanent criminal record (30-day rolling window). 3+ convictions = jail times +25%; 5+ = +50% and some services start refusing you.',
          'A new Dashboard banner shows the live investigation, the detective\'s name and the file\'s progress.',
        ],
      },
      {
        heading: 'Police chase mini-game',
        notes: [
          'Fail a GTA and the cops give chase instead of cuffing you on the spot. A 5-button arrow sequence appears with a 12-second timer — nail it to escape clean, miss and you\'re jailed for the original sentence. Driving skill softens the difficulty.',
          'The chase persists across refreshes: log back in mid-pursuit and it picks up where it left off.',
        ],
      },
      {
        heading: 'NPC city contacts',
        notes: [
          'Every city has a named fence — your relationship with them grows every time you launder a clean wash. Bands run Stranger → Regular (+1%) → Trusted (+3%) → Inner Circle (+5%) on top of the base 70% and the Cleaner perk.',
          'The Fence page now shows your contact, their blurb, and a live breakdown of the effective rate.',
        ],
      },
      {
        heading: 'Property: mods, burglary & player-to-player sales',
        notes: [
          'Five new mod slots on every property (alarm, doors, cameras, guards, safe) — 13 mods across the slots that raise both resale value and defence against burglary.',
          'Burglary (Underworld): pick a player\'s home to break into. Stealth vs. defence roll on top of a 1-hour cooldown. Success lifts 3-8% of their cash; failure rolls jail / hospital / clean escape.',
          'Estate Agent now hosts a player marketplace — list any property you own for sale at your asking price. 5% sales tax skim on the deal; mods transfer with the property.',
        ],
      },
      {
        heading: 'City newspaper',
        notes: [
          'New /newspaper page per city: top earners, turf control breakdown, police blotter, deterministic daily weather, and yesterday\'s headlines. Lower-rep players get pseudonyms ("a small-time hustler") so you have to work for your reputation before your name shows up.',
        ],
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-05-06',
    title: 'Progression rework · player photos · daily contracts · gang treasury',
    sections: [
      {
        heading: 'Player progression',
        notes: [
          'Level cap dropped from 999 to 100. At the cap, a Retire button on the dashboard starts a fresh prestige cycle: keep your cash, bank, properties, businesses, vehicles and stocks, lose stats, level, reputation, gear and gang membership. +5% max energy/nerve forever per prestige tier (max 5).',
          'Specialisations: pick a path at level 25 — Wheelman, Cleaner, Boss, Hacker. Five passive nodes per path auto-unlock at levels 25 / 35 / 50 / 65 / 80. Locked in until retirement. Full catalogue and active perks visible on /specialisations.',
          'Locked-action cards across the game (Crimes, Gun Shop, Businesses, OC heists) now show a padlock + "Unlocks at Lvl N" instead of a plain greyed-out tile.',
        ],
      },
      {
        heading: 'Daily contracts',
        notes: [
          'A banner on the Crimes page surfaces a tip for one major / cyber crime per UTC day, locked to a random city, paying out 3× the underlying crime\'s normal range. Single attempt — succeed or fail, the tip burns until midnight.',
        ],
      },
      {
        heading: 'Gang depth',
        notes: [
          'Gangs now have a tier (★ 1-10) that the leader buys with the treasury. Each tier unlocks a perk: extra member slot, +5% turf bonus, free hospital in turf cities, gang fence rate, shared garage spaces, faction-leader OC heist, ★ Cartel cosmetic & permanent crime payout boost.',
          'Treasury is funded by a leader-set "cut" of every member\'s successful crime payout (0-15%). Members keep the rest.',
        ],
      },
      {
        heading: 'Player photos',
        notes: [
          'Upload a profile picture from the dashboard character sheet (256px webp, ≤200KB after client-side resize). Shown on your dashboard, the player profile, the Players list, and anywhere the avatar emoji used to appear.',
        ],
      },
    ],
  },
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
