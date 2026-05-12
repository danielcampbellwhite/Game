// Premium store — Gold Bars (premium currency) and the cars / houses /
// weapons buyable only with them. Balance is account-bound (lives on
// `users.premium_points`), not character-bound. The currency survives
// character death, retirement, and prestige; items follow whichever
// character the player currently runs.

import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { PREMIUM_CATALOGUE, GOLD_BAR_PACKS } from '../data-premium.js';
import {
  getGoldBars, getUserPremiumInventory, buyPremiumItem,
  grantGoldBars, isAdminUser,
} from '../services/premium.js';
import { writeLog } from '../services/log.js';

const router = Router();

// GET /api/premium — balance, owned items, catalogue.
// Auth-only (not character-gated) since the balance belongs to the user.
router.get('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  res.json({
    balance: getGoldBars(userId),
    inventory: getUserPremiumInventory(userId),
    catalogue: PREMIUM_CATALOGUE,
    packs: GOLD_BAR_PACKS,
  });
});

// POST /api/premium/buy — purchase a catalogue item.
// Requires a character (so we have a log target) but the balance debit
// is on the user row, not the character row.
router.post('/buy', requireAuth, requireCharacter, (req, res) => {
  const itemId = (req.body?.item_id || '').toString();
  if (!itemId) return res.status(400).json({ error: 'item_id required.' });
  const result = buyPremiumItem(req.user.id, itemId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  writeLog(req.character.id, 'system',
    ` Bought premium item: ${result.item.name} — ${result.item.premiumPrice} Gold Bars.`,
    { premium_id: result.item.id, kind: result.item.kind, price: result.item.premiumPrice });
  res.json({ ok: true, balance: result.balance, item: result.item });
});

// POST /api/premium/admin-grant — admin-only Gold Bar issuance for
// testing. Body: { user_id?, amount }. Defaults to the calling admin
// when user_id is omitted. Phase 2 will add a Stripe webhook that
// uses the same grantGoldBars() helper to credit real purchases.
router.post('/admin-grant', requireAuth, (req, res) => {
  if (!isAdminUser(req.user.id)) {
    return res.status(403).json({ error: 'Admin only.' });
  }
  const targetUserId = parseInt(req.body?.user_id, 10) || req.user.id;
  const amount = Math.max(1, parseInt(req.body?.amount, 10) || 0);
  const balance = grantGoldBars(targetUserId, amount);
  res.json({ ok: true, target_user_id: targetUserId, granted: amount, balance });
});

export default router;
