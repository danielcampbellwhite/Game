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
  equipPremiumWeapon, equipPremiumVehicle, unequipPremiumVehicle,
} from '../services/premium.js';
import {
  isStripeConfigured, createCheckoutSession, getCheckoutStatus,
} from '../services/stripe.js';
import { writeLog } from '../services/log.js';
import { saveCharacter, publicCharacter, loadCharacter } from '../services/character.js';

const router = Router();

// GET /api/premium — balance, owned items, catalogue.
// Auth-only (not character-gated) since the balance belongs to the user.
// `stripe_configured` flips the UI from "Coming soon" to live Buy buttons
// without a separate config endpoint.
router.get('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  res.json({
    balance: getGoldBars(userId),
    inventory: getUserPremiumInventory(userId),
    catalogue: PREMIUM_CATALOGUE,
    packs: GOLD_BAR_PACKS,
    stripe_configured: isStripeConfigured(),
  });
});

// POST /api/premium/checkout — kick off Embedded Stripe Checkout.
// Returns { client_secret } so the React side can mount
// <EmbeddedCheckout /> in-page. Returns 503 if Stripe isn't configured
// — keeps deployment safe before keys are added.
router.post('/checkout', requireAuth, async (req, res) => {
  const packId = (req.body?.pack_id || '').toString();
  if (!packId) return res.status(400).json({ error: 'pack_id required.' });
  // Build the return URL from the request's origin / referer so the
  // embedded flow lands back on the right host regardless of where
  // the app is deployed (Railway preview vs prod).
  const origin = req.headers.origin
    || (req.headers.referer ? new URL(req.headers.referer).origin : null)
    || `${req.protocol}://${req.get('host')}`;
  try {
    const result = await createCheckoutSession(req.user.id, packId, origin);
    if (result.error) return res.status(503).json({ error: result.error });
    res.json({ client_secret: result.client_secret, session_id: result.session_id });
  } catch (e) {
    console.error('[premium] checkout failed:', e);
    res.status(500).json({ error: 'Checkout failed — please try again.' });
  }
});

// GET /api/premium/checkout-status?session_id=cs_... — poll endpoint
// the client hits after embedded checkout returns. Becomes 'fulfilled'
// as soon as the Stripe webhook has credited the balance.
router.get('/checkout-status', requireAuth, async (req, res) => {
  const sessionId = (req.query?.session_id || '').toString();
  if (!sessionId) return res.status(400).json({ error: 'session_id required.' });
  try {
    const status = await getCheckoutStatus(sessionId, req.user.id);
    if (status.error) return res.status(404).json({ error: status.error });
    res.json(status);
  } catch (e) {
    console.error('[premium] checkout-status failed:', e);
    res.status(500).json({ error: 'Could not read checkout status.' });
  }
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

// POST /api/premium/equip-weapon — set the player's equipped_weapon
// to a premium weapon they own. Combat / weapon-resolution falls back
// to the premium catalogue via services/customize.js.
router.post('/equip-weapon', requireAuth, requireCharacter, (req, res) => {
  const itemId = (req.body?.item_id || '').toString();
  const r = equipPremiumWeapon(req.user.id, req.character.id, itemId);
  if (r.error) return res.status(400).json({ error: r.error });
  writeLog(req.character.id, 'system', ` Equipped premium weapon: ${itemId}.`, { premium_id: itemId });
  // Reload the character so publicCharacter picks up the new equipped_weapon.
  const fresh = loadCharacter(req.user.id);
  res.json({ ok: true, character: publicCharacter(fresh) });
});

// POST /api/premium/equip-vehicle — set the player's active premium
// car. Mutually exclusive with active_vehicle_id; equipping a premium
// car parks the normal active car (it stays in the garage row, just
// not the active reference).
router.post('/equip-vehicle', requireAuth, requireCharacter, (req, res) => {
  const itemId = (req.body?.item_id || '').toString();
  const r = equipPremiumVehicle(req.user.id, req.character.id, itemId);
  if (r.error) return res.status(400).json({ error: r.error });
  writeLog(req.character.id, 'system', ` Driving premium vehicle: ${itemId}.`, { premium_id: itemId });
  const fresh = loadCharacter(req.user.id);
  res.json({ ok: true, character: publicCharacter(fresh) });
});

// POST /api/premium/unequip-vehicle — stop driving the premium car.
// Doesn't auto-restore the previously active normal car (the player
// would re-pick it from the dealership / inventory).
router.post('/unequip-vehicle', requireAuth, requireCharacter, (req, res) => {
  unequipPremiumVehicle(req.character.id);
  writeLog(req.character.id, 'system', ' Parked premium vehicle.');
  const fresh = loadCharacter(req.user.id);
  res.json({ ok: true, character: publicCharacter(fresh) });
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
