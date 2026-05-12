// Premium-only catalogue — items purchasable only with Gold Bars (the
// premium currency, paid for with real money in Phase 2). Stats match
// the existing top free tiers so these are PRESTIGE flex, not
// power-creep. The premium tier is account-bound (user_premium_inventory),
// no level gate, never decays, can't be sold / chopped / traded.
//
// Each entry has a `kind` of 'vehicle' | 'property' | 'weapon' so the
// routes can dispatch correctly when materialising into the character's
// inventory tables.

// Pricing scale (set by the live Stripe pack at 10p/bar):
//   - Weapon (cosmetic flex):     15 Bars  ~= £1.50
//   - Vehicle (cosmetic hyper):   40 Bars  ~= £4.00
//   - Property (flex of all flexes): 50 Bars  ~= £5.00

export const PREMIUM_VEHICLES = [
  {
    id:           'premium_koenigsegg_jesko',
    kind:         'vehicle',
    name:         'Jesko Absolut',
    maker:        'Koenigsegg',
    category:     'hyper',
    tier:         7,
    bookPrice:    3_000_000,
    handling:     95,
    speed:        100,
    acceleration: 98,
    premiumPrice: 40,
    description:  'Hand-built in Sweden. 1,600 horsepower, theoretical top speed past 300mph, paintwork that draws every eye on the strip. Yours forever — no wear, no chop shop, follows you across every character.',
  },
];

export const PREMIUM_PROPERTIES = [
  {
    id:           'premium_dubai_penthouse',
    kind:         'property',
    name:         'Burj Khalifa Penthouse',
    address:      'The Top Floor',
    city:         'dubai',
    tier:         5,
    tierLabel:    'Premium',
    cost:         12_000_000,
    garage:       15,
    bonuses:      { max_energy: 25, max_nerve: 5, happiness: 30 },
    premiumPrice: 50,
    description:  'The top floor of the world\'s tallest building. Private helipad, butler, full-floor view of the Gulf. The kind of address that means people fly to you.',
  },
];

export const PREMIUM_WEAPONS = [
  {
    id:           'premium_gold_1911',
    kind:         'weapon',
    name:         'Solid Gold M1911',
    maker:        'Custom Shop',
    category:     'pistol',
    dmg:          18,
    ammoType:     '45',
    premiumPrice: 15,
    description:  'Hand-engraved 18-carat gold over Colt steel. Same .45 round, but you can see your reflection between shots. Status piece with bite.',
  },
];

// Top-up packs displayed on the /premium page. Real-money price set
// at 10p / Gold Bar — packs are pure linear (no volume discount yet)
// to keep the maths transparent. Stripe Checkout will use these as
// Product/Price rows in Phase 2; for Phase 1 they're visual previews
// with a "coming soon" button.
export const GOLD_BAR_PACKS = [
  { id: 'pack_10',  bars:  10, priceGBP:  1.00, label: 'Starter Stash' },
  { id: 'pack_20',  bars:  20, priceGBP:  2.00, label: 'Stash Bag' },
  { id: 'pack_50',  bars:  50, priceGBP:  5.00, label: 'Vault Drop' },
  { id: 'pack_100', bars: 100, priceGBP: 10.00, label: 'Max Vault' },
];

export const PREMIUM_CATALOGUE = [
  ...PREMIUM_VEHICLES,
  ...PREMIUM_PROPERTIES,
  ...PREMIUM_WEAPONS,
];

export function premiumItemById(id) {
  return PREMIUM_CATALOGUE.find(item => item.id === id) || null;
}
