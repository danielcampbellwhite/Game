import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { requireAtLocation } from '../middleware/location.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { listStore, listOwned, getEquipped, buyClothing, equipClothing, ownsClothing } from '../services/clothing.js';
import { clothingItemById } from '../data-clothing.js';

const router = Router();

// GET /api/clothing/wardrobe — what you own + currently equipped.
router.get('/wardrobe', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  res.json({
    owned: listOwned(ch.id),
    equipped: getEquipped(ch),
  });
});

// GET /api/clothing/store/:tier — catalog with owned flags.
router.get('/store/:tier', requireAuth, requireCharacter, (req, res) => {
  const tier = req.params.tier;
  if (tier !== 'low' && tier !== 'high') return res.status(400).json({ error: 'Bad store tier.' });
  res.json({ tier, items: listStore(tier, req.character.id) });
});

// POST /api/clothing/buy/:tier { item_id } — buy. Location-gated by
// tier so you have to physically be at the matching store.
router.post('/buy/low',  requireAuth, requireCharacter, requireAtLocation('clothing_low'),  (req, res) => doBuy(req, res, 'low'));
router.post('/buy/high', requireAuth, requireCharacter, requireAtLocation('clothing_high'), (req, res) => doBuy(req, res, 'high'));

function doBuy(req, res, tier) {
  const ch = req.character;
  const itemId = req.body?.item_id;
  const item = clothingItemById(itemId);
  if (!item) return res.status(400).json({ error: 'Unknown item.' });
  if (item.store !== tier) return res.status(400).json({ error: 'Wrong store for that item.' });
  const r = buyClothing(ch, itemId);
  if (r.error) return res.status(400).json({ error: r.error });
  saveCharacter(ch);
  writeLog(ch.id, 'shop', `Bought ${item.name} for £${item.cost.toLocaleString()}.`);
  res.json({ ok: true, cost: r.cost, character: publicCharacter(ch) });
}

// POST /api/clothing/equip { slot, item_id }  — itemId can be null to
// clear the slot. Works from anywhere; you're stuffing the closet at
// home, not on the street.
router.post('/equip', requireAuth, requireCharacter, (req, res) => {
  const { slot, item_id } = req.body || {};
  const r = equipClothing(req.character, slot, item_id || null);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, equipped: r.equipped });
});

export default router;
