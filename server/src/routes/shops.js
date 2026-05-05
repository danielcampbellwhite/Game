// Themed neighbourhood shops — each one curates a subset of the
// MISC_ITEMS catalogue. They share the same buy logic as the general
// store; "use" stays on /general-store/use since that's the universal
// consumable endpoint.
//
// Shop ids: coffee, pharmacy, off_licence, deli, gift_shop. Each has
// a catalogue of items pulled from MISC_ITEMS by id.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { MISC_ITEMS, miscItemById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

export const SHOP_META = {
  coffee:     { name: 'Coffee Shop',  blurb: 'Caffeine and quick refuels. Energy and a small mood lift.' },
  pharmacy:   { name: 'Pharmacy',     blurb: 'Painkillers, first-aid, vitamins. Patch yourself up between runs.' },
  off_licence:{ name: 'Off-Licence',  blurb: 'Booze and cigars — nerve and happiness, sometimes a little health hit.' },
  deli:       { name: 'Late-Night Deli', blurb: 'Hot food, fast. Energy, happiness, occasional health.' },
  gift_shop:  { name: 'Gift Shop',    blurb: 'Flowers, chocolates, tickets. For when somebody needs cheering up.' },
};

const SHOP_CATALOGUES = {
  coffee:      ['coffee', 'energy_drink', 'protein_shake', 'pre_workout', 'sandwich', 'donut'],
  pharmacy:    ['painkillers', 'first_aid', 'adrenaline', 'vitamins', 'massage', 'sleeping_pills', 'condoms'],
  off_licence: ['cigar', 'whisky', 'beer_six', 'tequila', 'champagne_b', 'caviar'],
  deli:        ['sandwich', 'pizza_slice', 'sushi_box', 'kebab', 'donut', 'protein_shake'],
  gift_shop:   ['flowers', 'chocolate_box', 'movie_ticket', 'concert_ticket', 'spa_day', 'condoms'],
};

function shopItemIds(slug) {
  return SHOP_CATALOGUES[slug] || [];
}

function ownedQty(charId, itemId) {
  const r = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'misc' AND item_id = ?")
    .get(charId, itemId);
  return r?.qty || 0;
}

router.get('/:slug', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const slug = req.params.slug;
  const meta = SHOP_META[slug];
  if (!meta) return res.status(404).json({ error: 'Shop not found.' });
  const ids = shopItemIds(slug);
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const ownedRows = db.prepare("SELECT item_id, qty FROM inventory WHERE char_id = ? AND kind = 'misc'").all(ch.id);
  const ownedMap = Object.fromEntries(ownedRows.map(r => [r.item_id, r.qty]));
  const items = ids
    .map(id => miscItemById(id))
    .filter(Boolean)
    .map(i => ({
      ...i,
      cityCost: Math.floor(i.cost * cityMul),
      owned: ownedMap[i.id] || 0,
    }));
  res.json({
    slug,
    name: meta.name,
    blurb: meta.blurb,
    cityName: cityById(ch.city)?.name,
    items,
  });
});

router.post('/:slug/buy', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const slug = req.params.slug;
  const meta = SHOP_META[slug];
  if (!meta) return res.status(404).json({ error: 'Shop not found.' });
  const allowed = new Set(shopItemIds(slug));
  const item = miscItemById(req.body?.item_id);
  if (!item || !allowed.has(item.id)) return res.status(400).json({ error: 'That shop doesn\'t sell that.' });
  const n = Math.max(1, Math.min(99, parseInt(req.body?.qty, 10) || 1));
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const unit = Math.floor(item.cost * cityMul);
  const total = unit * n;
  if (ch.cash < total) return res.status(400).json({ error: `Need £${total.toLocaleString()}` });
  ch.cash -= total;
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, 'misc', ?, ?)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
  `).run(ch.id, item.id, n);
  writeLog(ch.id, 'shop', `Bought ${n}× ${item.emoji} ${item.name} at the ${meta.name} for £${total.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), owned: ownedQty(ch.id, item.id) });
});

export default router;
