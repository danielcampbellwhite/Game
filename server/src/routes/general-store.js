import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { requireAtLocation } from '../middleware/location.js';
import { MISC_ITEMS, miscItemById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { itemWeight, personalWeight, PERSONAL_CAP_KG } from '../services/weight.js';
import { applyVitalEffects, effectsToText } from '../services/vitals.js';
import { bumpMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';

const router = Router();

// Prize-table overrides applied at request time. The shipped table for
// scratch_gold in data.js carried a +112% EV (£529 expected payout on a
// £250 ticket) which was an unlimited money printer at scale. This
// rebalanced table targets ~85% payback — slight house edge, real-world
// scratcher numbers, jackpot dialled to £250k. Lives here rather than in
// the 150KB data.js so the override stays diffable.
const PRIZE_OVERRIDES = {
  scratch_gold: {
    desc: 'Premium card. £0 to £250,000 jackpot.',
    prizes: [
      { chance: 0.60000, amount: 0      },
      { chance: 0.25000, amount: 250    },
      { chance: 0.08000, amount: 500    },
      { chance: 0.03500, amount: 1000   },
      { chance: 0.01300, amount: 2500   },
      { chance: 0.00400, amount: 5000   },
      { chance: 0.00100, amount: 10000  },
      { chance: 0.00010, amount: 50000  },
      { chance: 0.00001, amount: 250000 },
    ],
  },
};
function applyPrizeOverride(item) {
  const o = item && PRIZE_OVERRIDES[item.id];
  if (!o) return item;
  return { ...item, ...o };
}

// A misc item is "usable" from /use if it has effects on vitals, a
// random cash payout (lottery), or a weighted prize table. Mission
// props (lockpicks, gas cans, burner phones, etc.) are NOT usable
// from the inventory — they're consumed automatically inside the
// crime / mission endpoints that need them. Same for devices like
// the smartphone, which works just by being carried.
export function isUsableMisc(item) {
  if (!item) return false;
  return !!(item.effects || item.oneShotCash || item.prizes);
}

function ownedQty(charId, itemId) {
  const r = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'misc' AND item_id = ?")
    .get(charId, itemId);
  return r?.qty || 0;
}

// Shop-side endpoints (browse / buy) require being at the General
// Store. /use is intentionally NOT gated — using something you
// already own from your kit bag should work from anywhere
// (inventory page, etc.).
router.get('/', requireAuth, requireCharacter, requireAtLocation('general_store'), (req, res) => {
  const ch = req.character;
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const ownedRows = db.prepare("SELECT item_id, qty FROM inventory WHERE char_id = ? AND kind = 'misc'")
    .all(ch.id);
  const ownedMap = Object.fromEntries(ownedRows.map(r => [r.item_id, r.qty]));
  // Wholesale-only items live in the player-shop economy now — Murphy's
  // doesn't sell them anymore, but players can still *use* any they
  // already have (and resellers buy from the wholesaler endpoint).
  const items = MISC_ITEMS
    .filter(i => !i.wholesale_only && !i.electronicsOnly)
    .map(i => {
      const o = applyPrizeOverride(i);
      return {
        ...o,
        cityCost: Math.floor(o.cost * cityMul),
        owned: ownedMap[o.id] || 0,
      };
    });
  res.json({ items, cityName: cityById(ch.city)?.name });
});

router.post('/buy', requireAuth, requireCharacter, requireAtLocation('general_store'), (req, res) => {
  const ch = req.character;
  const { item_id, qty = 1 } = req.body || {};
  const item = miscItemById(item_id);
  if (!item) return res.status(400).json({ error: 'Unknown item' });
  if (item.electronicsOnly) return res.status(400).json({ error: 'That\'s sold at the Electronics Store.' });
  const n = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  const unit = Math.floor(item.cost * cityMul);
  const total = unit * n;
  if (ch.cash < total) return res.status(400).json({ error: `Need £${total.toLocaleString()}` });
  // Carry-weight gate — reject before deducting cash.
  const buyKg = itemWeight('misc', item.id) * n;
  const haveKg = personalWeight(ch.id);
  if (haveKg + buyKg > PERSONAL_CAP_KG + 1e-6) {
    return res.status(400).json({
      error: `Carry too much — adds ${buyKg.toFixed(2)}kg (you have ${haveKg.toFixed(1)}/${PERSONAL_CAP_KG}kg). Stash items at your house first.`,
    });
  }
  ch.cash -= total;
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, 'misc', ?, ?)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
  `).run(ch.id, item.id, n);
  writeLog(ch.id, 'shop', `Bought ${n}× ${item.emoji} ${item.name} for £${total.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), owned: ownedQty(ch.id, item.id) });
});

router.post('/use', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const item = applyPrizeOverride(miscItemById(req.body?.item_id));
  if (!item) return res.status(400).json({ error: 'Unknown item' });
  // Block "using" items that have no /use behaviour — devices like
  // smartphone / laptop, crime tools that get consumed at the crime
  // site, decorative items, etc. Otherwise we'd silently delete a
  // £1,500 phone with nothing to show for it.
  if (!isUsableMisc(item)) {
    return res.status(400).json({ error: `${item.name} isn't something you can use from your inventory.` });
  }
  const have = ownedQty(ch.id, item.id);
  if (have <= 0) return res.status(400).json({ error: "You don't have that." });

  // Decrement first; clean up zero-qty rows so the inventory page stays tidy.
  if (have === 1) {
    db.prepare("DELETE FROM inventory WHERE char_id = ? AND kind = 'misc' AND item_id = ?").run(ch.id, item.id);
  } else {
    db.prepare("UPDATE inventory SET qty = qty - 1 WHERE char_id = ? AND kind = 'misc' AND item_id = ?").run(ch.id, item.id);
  }

  let applied = null;
  let cashDelta = 0;
  let jackpot = false;
  let flavour = '';
  if (item.effects) {
    applied = applyVitalEffects(ch, item.effects);
    flavour = effectsToText(applied);
  }
  if (item.oneShotCash) {
    const { min, max } = item.oneShotCash;
    cashDelta = Math.floor(Math.random() * (max - min + 1)) + min;
    ch.cash += cashDelta;
    flavour = cashDelta > 0 ? `won £${cashDelta.toLocaleString()}` : 'no win';
  }
  if (Array.isArray(item.prizes) && item.prizes.length) {
    // Weighted draw across the prize tiers. We scale the roll by the
    // actual sum of declared chances rather than assuming it's exactly
    // 1.0 — with many tiers and very small probabilities, float drift
    // would otherwise leave a tiny gap that always landed on the
    // fallback (highest-amount) tier and break the odds.
    const total = item.prizes.reduce((s, p) => s + p.chance, 0);
    const roll = Math.random() * total;
    let acc = 0;
    let pick = item.prizes[item.prizes.length - 1];
    for (const p of item.prizes) {
      acc += p.chance;
      if (roll < acc) { pick = p; break; }
    }
    cashDelta = pick.amount;
    ch.cash += cashDelta;
    // Flag the top-tier prize as a jackpot for louder logging / notify.
    const topAmount = item.prizes.reduce((m, p) => Math.max(m, p.amount), 0);
    jackpot = cashDelta > 0 && cashDelta === topAmount && topAmount >= 1000;
    flavour = cashDelta > 0
      ? (jackpot ? ` JACKPOT — won £${cashDelta.toLocaleString()}!` : `won £${cashDelta.toLocaleString()}`)
      : 'no win';
  }
  if (item.missionOnly) {
    flavour = 'used';
  }

  // Mission progression: every misc-item use bumps the generic counter, and
  // also a specific-item counter for missions that ask for a particular item.
  bumpMission(ch, 'misc_use_any', 1);
  bumpMission(ch, 'misc_use', 1, { item: item.id });

  writeLog(ch.id, 'misc', `${item.emoji} ${item.name} — ${flavour}.`, { item: item.id, applied, cash: cashDelta, jackpot }, jackpot);
  saveCharacter(ch);
  res.json({
    ok: true,
    applied,
    cash: cashDelta,
    jackpot,
    character: publicCharacter(ch),
    owned: ownedQty(ch.id, item.id),
  });
});

export default router;
