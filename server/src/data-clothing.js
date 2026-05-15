// Clothing catalogue. Two stores: low-end ('low') is cheap and flashy
// — tracksuits, gold chains, snapbacks; high-end ('high') is tailored
// and subtle — bespoke suits, Patek watches, Italian leather.
//
// All items are PURELY COSMETIC. Five slots — hat, top, bottom, shoes,
// accessory. One item per slot at a time. Items are non-stackable
// (owned 1 max). Server enforces buying at the matching store
// location; equip/unequip works from anywhere.
//
// Each item ships with a `svg` field that the client renders inline.
// The SVG canvas is 100x100 with a transparent background; colours
// are chosen so the icons read on both ink-900 and ink-950 surfaces.

export const CLOTHING_SLOTS = ['hat', 'top', 'bottom', 'shoes', 'accessory'];

export const CLOTHING_ITEMS = [
  //  Low-end — Streetwear Outlet
  {
    id: 'snapback_red',
    name: 'Red Snapback',
    slot: 'hat',
    store: 'low',
    cost: 45,
    desc: 'Flat-brim, embroidered, slightly cocked to the side.',
  },
  {
    id: 'bucket_hat_camo',
    name: 'Camo Bucket Hat',
    slot: 'hat',
    store: 'low',
    cost: 40,
    desc: 'Budget tactical with floppy charm.',
  },
  {
    id: 'tracksuit_top_blue',
    name: 'Blue Tracksuit Top',
    slot: 'top',
    store: 'low',
    cost: 120,
    desc: 'Polyester. Two white stripes. Sounds like static.',
  },
  {
    id: 'hoodie_blood',
    name: 'Crimson Hoodie',
    slot: 'top',
    store: 'low',
    cost: 75,
    desc: 'Drawstring tight, hood up, no logo.',
  },
  {
    id: 'tracksuit_pants_blue',
    name: 'Matching Track Pants',
    slot: 'bottom',
    store: 'low',
    cost: 95,
    desc: 'Pair them with the top or commit a fashion sin.',
  },
  {
    id: 'baggy_jeans',
    name: 'Baggy Jeans',
    slot: 'bottom',
    store: 'low',
    cost: 55,
    desc: 'Wide leg. Chain optional.',
  },
  {
    id: 'sneakers_white',
    name: 'White Sneakers',
    slot: 'shoes',
    store: 'low',
    cost: 85,
    desc: 'Spotless for now. They never stay that way.',
  },
  {
    id: 'high_tops_red',
    name: 'Red High-Tops',
    slot: 'shoes',
    store: 'low',
    cost: 110,
    desc: 'Canvas, rubber toe, eternal.',
  },
  {
    id: 'gold_chain_thick',
    name: 'Thick Gold Chain',
    slot: 'accessory',
    store: 'low',
    cost: 220,
    desc: 'Cuban link. Heavy enough to sound like work.',
  },
  {
    id: 'chunky_watch',
    name: 'Chunky Watch',
    slot: 'accessory',
    store: 'low',
    cost: 65,
    desc: 'Plastic bezel. Reads "DIVER" but you can\'t swim.',
  },

  //  High-end — Atelier
  {
    id: 'fedora_charcoal',
    name: 'Charcoal Fedora',
    slot: 'hat',
    store: 'high',
    cost: 450,
    desc: 'Wool felt, grosgrain band. Speaks for you.',
  },
  {
    id: 'panama_cream',
    name: 'Cream Panama',
    slot: 'hat',
    store: 'high',
    cost: 620,
    desc: 'Hand-woven toquilla straw. For when the rooftop is sunny.',
  },
  {
    id: 'bespoke_suit',
    name: 'Bespoke Suit Jacket',
    slot: 'top',
    store: 'high',
    cost: 6500,
    desc: 'Two-piece, mohair blend, single vent. Cut on Savile Row.',
  },
  {
    id: 'silk_shirt_black',
    name: 'Black Silk Shirt',
    slot: 'top',
    store: 'high',
    cost: 950,
    desc: 'Slips like water. Two buttons too many undone.',
  },
  {
    id: 'tailored_trousers',
    name: 'Tailored Trousers',
    slot: 'bottom',
    store: 'high',
    cost: 1800,
    desc: 'Pleated, cuffed, made for sitting down to count.',
  },
  {
    id: 'italian_jeans',
    name: 'Italian Selvedge Jeans',
    slot: 'bottom',
    store: 'high',
    cost: 2200,
    desc: 'Raw denim, hand-finished hem. Stiff like new money.',
  },
  {
    id: 'oxfords_black',
    name: 'Black Oxfords',
    slot: 'shoes',
    store: 'high',
    cost: 1100,
    desc: 'Closed lacing, mirror polish. Funeral or wedding — same shoes.',
  },
  {
    id: 'italian_loafers',
    name: 'Italian Loafers',
    slot: 'shoes',
    store: 'high',
    cost: 2400,
    desc: 'Hand-stitched. Worn sockless. Always.',
  },
  {
    id: 'rolex_submariner',
    name: 'Rolex Submariner',
    slot: 'accessory',
    store: 'high',
    cost: 18000,
    desc: 'Black dial, cerachrom bezel. The classic.',
  },
  {
    id: 'patek_philippe',
    name: 'Patek Philippe Nautilus',
    slot: 'accessory',
    store: 'high',
    cost: 125000,
    desc: 'You never actually own one. You merely look after it.',
  },
];

const BY_ID = Object.fromEntries(CLOTHING_ITEMS.map(i => [i.id, i]));
export function clothingItemById(id) { return BY_ID[id] || null; }
export function clothingForStore(tier) { return CLOTHING_ITEMS.filter(i => i.store === tier); }
