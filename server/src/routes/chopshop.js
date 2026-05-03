import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { vehicleById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

// Two illegal sale outlets on this page:
//   chop  — fast and brainless, ~15% of book. No risk, dirty cash.
//   dealer — black-market dealer, ~40% of book, dirty cash, small bust roll.
const CHOP_RATE   = 0.15;
const DEALER_RATE = 0.40;
const DEALER_BUST_CHANCE = 0.08;

function decorateForSale(row) {
  const v = vehicleById(row.vehicle_id);
  if (!v) return null;
  const cityMul = cityById(row.city)?.businessMul || 1.0;
  const book = Math.floor(v.bookPrice * cityMul);
  let modded = false;
  try { modded = Object.keys(JSON.parse(row.mods_json || '{}')).length > 0; } catch {}
  return {
    id: row.id,
    vehicle_id: v.id,
    name: v.name,
    maker: v.maker,
    tier: v.tier,
    image: v.image,
    book,
    chopPrice:   Math.floor(book * CHOP_RATE),
    dealerPrice: Math.floor(book * DEALER_RATE),
    acquired_via: row.acquired_via,
    city: row.city,
    cityName: cityById(row.city)?.name,
    is_modified: modded,
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const owned = db.prepare('SELECT * FROM vehicles_owned WHERE char_id = ? ORDER BY id DESC').all(ch.id);
  res.json({
    city: ch.city,
    cityName: cityById(ch.city)?.name,
    vehicles: owned.map(decorateForSale).filter(Boolean),
    chopRate: CHOP_RATE,
    dealerRate: DEALER_RATE,
  });
});

router.post('/sell', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const id = req.body?.id;
  const where = req.body?.where; // 'chop' | 'dealer'
  if (!['chop', 'dealer'].includes(where)) return res.status(400).json({ error: 'where must be chop|dealer' });

  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Vehicle not owned' });
  const v = vehicleById(row.vehicle_id);
  if (!v) return res.status(404).json({ error: 'Vehicle missing' });
  // Modded vehicles can only move through the player economy.
  let modCount = 0;
  try { modCount = Object.keys(JSON.parse(row.mods_json || '{}')).length; } catch {}
  if (modCount > 0) {
    return res.status(400).json({ error: 'Customised cars don\'t fit through here. Strip the mods or list it on a player shop.' });
  }
  // Already listed in a player shop — prevent silent corruption where
  // chopping deletes the row but the listing still references it.
  const listed = db.prepare("SELECT id FROM shop_listings WHERE kind = 'vehicle' AND instance_id = ?").get(row.id);
  if (listed) return res.status(400).json({ error: 'This car is listed in a player shop — delist it first.' });

  const cityMul = cityById(row.city)?.businessMul || 1.0;
  const book = Math.floor(v.bookPrice * cityMul);
  const rate = where === 'chop' ? CHOP_RATE : DEALER_RATE;
  const payout = Math.floor(book * rate);

  // Black-market dealer: small bust chance — undercover sting!
  if (where === 'dealer' && Math.random() < DEALER_BUST_CHANCE) {
    const jailMin = 20 + Math.floor(Math.random() * 40);
    ch.jail_until = Date.now() + jailMin * 60 * 1000;
    ch.jail_reason = `Walked into a sting trying to fence a ${v.maker} ${v.name} at the black-market dealer — sentenced to ${jailMin} minutes.`;
    db.prepare('DELETE FROM vehicles_owned WHERE id = ?').run(row.id); // car seized
    writeLog(ch.id, 'chop', `🚨 STING at the black-market dealer — lost the ${v.maker} ${v.name} and jailed ${jailMin}m.`, { vehicle: v.id });
    saveCharacter(ch);
    return res.json({ ok: true, busted: true, jailMin, character: publicCharacter(ch) });
  }

  // Stolen cars sell for dirty cash; legally-owned cars sell for clean.
  if (row.acquired_via === 'stolen') ch.dirty_cash += payout;
  else ch.cash += payout;

  db.prepare('DELETE FROM vehicles_owned WHERE id = ?').run(row.id);
  writeLog(ch.id, 'chop', `Sold ${v.maker} ${v.name} at the ${where === 'chop' ? 'chop shop' : 'black-market dealer'} for £${payout.toLocaleString()}${row.acquired_via === 'stolen' ? ' (dirty)' : ''}.`, { vehicle: v.id, payout, where });
  saveCharacter(ch);
  res.json({ ok: true, payout, dirty: row.acquired_via === 'stolen', character: publicCharacter(ch) });
});

export default router;
