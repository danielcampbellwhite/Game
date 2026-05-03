import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { WEAPONS, ARMOUR, AMMO, WEAPON_CATEGORIES, ammoById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

// NPC ammo buy-back ratio. The store takes a 50% haircut so it's never
// profitable to round-trip — just a way to offload surplus rounds for
// cash flow when you've bought too many.
const AMMO_SELL_BACK_PCT = 0.5;

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  // Include owned ammo per type so the client can render the Sell button
  // alongside the buy form without a second round-trip.
  const ownedAmmoRows = db.prepare(
    "SELECT item_id, qty FROM inventory WHERE char_id = ? AND kind = 'ammo'"
  ).all(ch.id);
  const ownedAmmoMap = Object.fromEntries(ownedAmmoRows.map(r => [r.item_id, r.qty]));
  res.json({
    cityName: cityById(ch.city)?.name,
    weapons: WEAPONS.filter(w => w.cost > 0).map(w => ({
      ...w,
      locked: ch.level < w.level,
      cost: Math.floor(w.cost * cityMul),
    })),
    weaponCategories: WEAPON_CATEGORIES,
    armours: ARMOUR.filter(a => a.cost > 0).map(a => ({ ...a, locked: ch.level < a.level, cost: Math.floor(a.cost * cityMul) })),
    ammo: AMMO.map(a => ({
      ...a,
      packCost: a.cost * a.packSize,
      sellBackPerRound: Math.max(1, Math.floor(a.cost * AMMO_SELL_BACK_PCT)),
      owned: ownedAmmoMap[a.id] || 0,
    })),
    ammoSellBackPct: AMMO_SELL_BACK_PCT,
  });
});

// Sell ammo back to the gun store at 50% of base cost. Per-round, so
// you can drain partial stacks. Refuses anything we don't have stock of.
router.post('/sell', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { item_id, qty: rawQty } = req.body || {};
  const qty = Math.max(1, parseInt(rawQty, 10) || 0);
  const ammo = ammoById(item_id);
  if (!ammo) return res.status(400).json({ error: 'Unknown ammo type.' });

  const row = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?").get(ch.id, item_id);
  if (!row || row.qty < qty) {
    return res.status(400).json({ error: `You only have ${row?.qty || 0} ${ammo.name} to sell.` });
  }

  const perRound = Math.max(1, Math.floor(ammo.cost * AMMO_SELL_BACK_PCT));
  const payout = perRound * qty;

  if (row.qty === qty) {
    db.prepare("DELETE FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?").run(ch.id, item_id);
  } else {
    db.prepare("UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = 'ammo' AND item_id = ?").run(qty, ch.id, item_id);
  }
  ch.cash += payout;
  saveCharacter(ch);
  writeLog(ch.id, 'shop', `Sold ${qty}× ${ammo.name} back to the Gun Store for £${payout.toLocaleString()}.`);

  res.json({ ok: true, payout, character: publicCharacter(ch) });
});

export default router;
