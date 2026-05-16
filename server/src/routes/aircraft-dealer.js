// Aircraft Broker — split out from the airport so private aviation
// sales have their own sales-floor address. The dealer is its own
// physical location ('aircraft_dealer'); buying / selling only
// happens while the player is standing there. Aircraft drop straight
// into the local hangar at the same city, which means the player
// still needs to own a hangar here before they can buy.
//
// The hangar route keeps the storage primitives (slot upgrades,
// fly, refuel) so flights still depart from the airport hangar.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { requireAtLocation } from '../middleware/location.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { hangarSummary } from '../services/hangar.js';
import { AIRCRAFT, aircraftById, cityById } from '../data.js';

const router = Router();
const atDealer = [requireAuth, requireCharacter, requireAtLocation('aircraft_dealer')];

// Trade-in markdown — the dealer never pays book. 60% of book is the
// base, scaled by condition (a perfect 100% airframe gets the full
// 60%, a 50%-condition wreck gets 30%).
const AIRCRAFT_SELLBACK_PCT = 0.60;

function aircraftSellPayout(aircraft, condition) {
  const conditionMul = Math.max(0.1, Math.min(1, (condition ?? 100) / 100));
  return Math.max(1, Math.round(aircraft.bookPrice * AIRCRAFT_SELLBACK_PCT * conditionMul));
}

// GET / — catalog of aircraft for sale at this dealer, plus the
// player's aircraft currently parked in the local hangar (eligible
// for trade-in). Free-slot info from the local hangar is included
// so the client can grey out "Buy" when storage is full.
router.get('/', ...atDealer, (req, res) => {
  const ch = req.character;
  const hangar = hangarSummary(ch.id, ch.city);
  const myAircraft = hangar ? db.prepare(`
    SELECT id, vehicle_id, class, condition, fuel
    FROM vehicles_owned
    WHERE char_id = ? AND city = ? AND class != 'car'
    ORDER BY acquired_at DESC
  `).all(ch.id, ch.city).map(r => {
    const a = aircraftById(r.vehicle_id);
    if (!a) return null;
    return {
      id: r.id, vehicle_id: a.id, name: a.name, maker: a.maker, class: r.class,
      tier: a.tier, condition: r.condition, fuel: r.fuel,
      payout: aircraftSellPayout(a, r.condition),
      book:   a.bookPrice,
    };
  }).filter(Boolean) : [];
  res.json({
    city: ch.city, cityName: cityById(ch.city)?.name,
    hangar,                          // null if not owned
    aircraft_catalog: AIRCRAFT,
    my_aircraft_here: myAircraft,
  });
});

// POST /buy { aircraft_id } — purchase from the dealer. Aircraft
// lands in the player's local hangar. Requires a hangar in this
// city with a free slot of the matching class.
router.post('/buy', ...atDealer, (req, res) => {
  const ch = req.character;
  const a = aircraftById(req.body?.aircraft_id);
  if (!a) return res.status(400).json({ error: 'Unknown aircraft.' });
  const hangar = hangarSummary(ch.id, ch.city);
  if (!hangar) return res.status(400).json({ error: 'You need a hangar in this city to store the aircraft.' });
  const slot = hangar.slots[a.class];
  if (!slot || slot.free <= 0) {
    return res.status(400).json({ error: `Your local hangar is out of ${a.class} space — upgrade or sell first.` });
  }
  if (ch.cash < a.bookPrice) return res.status(400).json({ error: `Need £${a.bookPrice.toLocaleString()}.` });
  ch.cash -= a.bookPrice;
  const now = Date.now();
  db.prepare(`
    INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, condition, fuel, class)
    VALUES (?, ?, 'bought', ?, ?, 100, 100, ?)
  `).run(ch.id, a.id, ch.city, now, a.class);
  writeLog(ch.id, 'aviation',
    ` Bought a ${a.maker} ${a.name} — £${a.bookPrice.toLocaleString()}, delivered to your ${cityById(ch.city)?.name} hangar.`,
    { aircraft: a.id, city: ch.city, cost: a.bookPrice }, true);
  saveCharacter(ch);
  res.json({ ok: true, cost: a.bookPrice, character: publicCharacter(ch), hangar: hangarSummary(ch.id, ch.city) });
});

// GET /sell-quote?aircraft_row_id=N — preview the trade-in price.
router.get('/sell-quote', ...atDealer, (req, res) => {
  const ch = req.character;
  const rowId = parseInt(req.query.aircraft_row_id, 10);
  if (!Number.isFinite(rowId)) return res.status(400).json({ error: 'Bad aircraft.' });
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(rowId, ch.id);
  if (!row) return res.json({ sellable: false, reason: 'Not yours.' });
  if (row.class === 'car') return res.json({ sellable: false, reason: 'Cars sell at the chop shop or dealer.' });
  if (row.city !== ch.city) return res.json({ sellable: false, reason: 'That aircraft is at another hangar.' });
  const a = aircraftById(row.vehicle_id);
  if (!a) return res.json({ sellable: false, reason: 'Aircraft catalogue missing.' });
  res.json({
    sellable: true,
    payout: aircraftSellPayout(a, row.condition),
    book: a.bookPrice,
    condition: row.condition,
  });
});

// POST /sell { aircraft_row_id } — trade an aircraft in. Pays 60%
// of book scaled by condition. Row is deleted (frees the slot).
router.post('/sell', ...atDealer, (req, res) => {
  const ch = req.character;
  const rowId = parseInt(req.body?.aircraft_row_id, 10);
  if (!Number.isFinite(rowId)) return res.status(400).json({ error: 'Bad aircraft.' });
  const row = db.prepare('SELECT * FROM vehicles_owned WHERE id = ? AND char_id = ?').get(rowId, ch.id);
  if (!row) return res.status(404).json({ error: 'Aircraft not found.' });
  if (row.class === 'car') return res.status(400).json({ error: 'Sell cars at the chop shop or dealer.' });
  if (row.city !== ch.city) return res.status(400).json({ error: 'That aircraft is at another hangar. Fly it here first.' });
  const a = aircraftById(row.vehicle_id);
  if (!a) return res.status(400).json({ error: 'Aircraft catalogue missing.' });
  const payout = aircraftSellPayout(a, row.condition);
  ch.cash += payout;
  db.prepare('DELETE FROM vehicles_owned WHERE id = ?').run(row.id);
  writeLog(ch.id, 'aviation',
    `Sold the ${a.maker} ${a.name} back to the broker for £${payout.toLocaleString()} (${Math.round(row.condition)}% condition).`,
    { aircraft: a.id, city: ch.city, payout, condition: row.condition }, true);
  saveCharacter(ch);
  res.json({ ok: true, payout, character: publicCharacter(ch), hangar: hangarSummary(ch.id, ch.city) });
});

export default router;
