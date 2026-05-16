// Electronics Store — sells the devices that give you in-game internet:
// smartphones and laptops. Gated to the 'electronics' location.
//
// Smartphones go straight into personal inventory (portable). Laptops
// also go into personal inventory at purchase, but the player will
// usually move them into a property stash or vehicle stash to keep
// them with the place they want internet at.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { requireAtLocation } from '../middleware/location.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { MISC_ITEMS, miscItemById, cityById } from '../data.js';
import { itemWeight, personalWeight, PERSONAL_CAP_KG } from '../services/weight.js';

const router = Router();
const atStore = [requireAuth, requireCharacter, requireAtLocation('electronics')];

// GET / — the catalog. Currently just the two devices plus burner
// phones (handy to also stock them here for narrative cohesion).
router.get('/', ...atStore, (req, res) => {
  const ch = req.character;
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const ownedRows = db.prepare("SELECT item_id, qty FROM inventory WHERE char_id = ? AND kind = 'misc'")
    .all(ch.id);
  const ownedMap = Object.fromEntries(ownedRows.map(r => [r.item_id, r.qty]));
  const items = MISC_ITEMS
    .filter(i => i.electronicsOnly || i.id === 'burner_phone')
    .map(i => ({
      id: i.id,
      name: i.name,
      emoji: i.emoji,
      desc: i.desc,
      cost: i.cost,
      cityCost: Math.floor(i.cost * cityMul),
      owned: ownedMap[i.id] || 0,
      device: i.device || null,
      portable: !!i.portable,
    }));
  res.json({ items, cityName: cityById(ch.city)?.name });
});

router.post('/buy', ...atStore, (req, res) => {
  const ch = req.character;
  const { item_id, qty = 1 } = req.body || {};
  const item = miscItemById(item_id);
  if (!item) return res.status(400).json({ error: 'Unknown item' });
  // The store only sells the curated subset listed above.
  if (!(item.electronicsOnly || item.id === 'burner_phone')) {
    return res.status(400).json({ error: 'Not in stock here.' });
  }
  const n = Math.max(1, Math.min(10, parseInt(qty, 10) || 1));
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const unit = Math.floor(item.cost * cityMul);
  const total = unit * n;
  if (ch.cash < total) return res.status(400).json({ error: `Need £${total.toLocaleString()}` });
  const buyKg = itemWeight('misc', item.id) * n;
  const haveKg = personalWeight(ch.id);
  if (haveKg + buyKg > PERSONAL_CAP_KG + 1e-6) {
    return res.status(400).json({
      error: `Too heavy — adds ${buyKg.toFixed(2)}kg (you have ${haveKg.toFixed(1)}/${PERSONAL_CAP_KG}kg). Stash something first.`,
    });
  }
  ch.cash -= total;
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, 'misc', ?, ?)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
  `).run(ch.id, item.id, n);
  writeLog(ch.id, 'shop', `Bought ${n}× ${item.name} for £${total.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
