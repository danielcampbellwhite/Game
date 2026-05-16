// In-game internet — services you can use remotely from any place
// with a phone in your pocket or a laptop within reach. Every
// endpoint here is gated by requireInternet. Online services charge
// a small markup over the in-store price and are paid from the
// player's bank balance (not pocket cash) — the in-fiction reason
// is that online merchants only take bank transfers.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { requireInternet } from '../services/online.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { CITIES, cityById } from '../data.js';
import { FLIGHT_CLASSES, flightDurationMs } from '../services/flights.js';

const router = Router();

// 8% across the board, sitting in the middle of the 5–10% range the
// player asked for. Keep this central; future online services should
// reuse it so the markup feels consistent everywhere.
export const ONLINE_MARKUP = 0.08;
export function onlinePrice(base) {
  return Math.ceil(base * (1 + ONLINE_MARKUP));
}

// Mirror the airport flight window so a ticket bought online and an
// in-person ticket land on the same boarding slot.
const FLIGHT_INTERVAL_MS = 10 * 60 * 1000;
const BOARDING_WINDOW_MS = 2 * 60 * 1000;
function nextDepartureAt(now = Date.now()) {
  return Math.ceil(now / FLIGHT_INTERVAL_MS) * FLIGHT_INTERVAL_MS;
}

// GET / — landing page. Right now just a status summary the client
// uses to decide which features to surface. Later this grows to
// include catalogues for online vehicles, weapons, etc.
router.get('/', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  res.json({
    online: true,
    via: req.internetReason,                 // 'phone' | 'laptop_home' | 'laptop_car'
    markup_pct: Math.round(ONLINE_MARKUP * 100),
    bank: ch.bank,
    cityName: cityById(ch.city)?.name,
  });
});

// GET /flights — the same fares the airport shows, with the online
// markup baked in. The player can be in any city to browse and book —
// they don't need to be at the airport — but they still need to be
// at the *origin* airport to board the flight itself.
router.get('/flights', requireAuth, requireCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const from = cityById(ch.city);
  if (!from) return res.status(400).json({ error: 'Unknown origin city.' });
  const flights = CITIES.filter(c => c.id !== ch.city).map(c => {
    const baseFare = Math.floor((from.flightBase + c.flightBase) / 2);
    const unlockLevel = c.unlockLevel || 1;
    return {
      city: c.id, name: c.name, emoji: c.emoji,
      unlockLevel,
      locked: ch.level < unlockLevel,
      classes: Object.fromEntries(Object.entries(FLIGHT_CLASSES).map(([k, v]) => {
        const inStore = Math.floor(baseFare * v.mul);
        return [k, {
          base: inStore,
          cost: onlinePrice(inStore),
          durationMs: flightDurationMs(ch.city, c.id, v.durationMul),
        }];
      })),
    };
  });
  res.json({
    flights,
    markup_pct: Math.round(ONLINE_MARKUP * 100),
    boarding_note: `Pay online from your bank, then head to the ${from.name} airport to board.`,
  });
});

// POST /flights/ticket { city, klass } — books a flight online,
// pays from bank balance with the 8% online markup. Identical
// boarding rules to the airport endpoint: the ticket lands on the
// next departure slot and the player physically boards at the airport.
router.post('/flights/ticket', requireAuth, requireCharacter, requireFreeCharacter, requireInternet, (req, res) => {
  const ch = req.character;
  const { city, klass = 'economy' } = req.body || {};
  const target = cityById(city);
  if (!target) return res.status(400).json({ error: 'Unknown city.' });
  if (target.id === ch.city) return res.status(400).json({ error: 'Already there.' });
  if (ch.level < (target.unlockLevel || 1)) {
    return res.status(403).json({ error: `${target.name} unlocks at level ${target.unlockLevel}.` });
  }
  const cls = FLIGHT_CLASSES[klass];
  if (!cls) return res.status(400).json({ error: 'Unknown flight class.' });

  // Re-check for an existing pending ticket — players shouldn't end
  // up holding two seats on the same route just because they bought
  // one online and one at the desk.
  const existing = db.prepare(
    "SELECT id FROM flight_tickets WHERE char_id = ? AND status = 'booked' AND from_city = ? AND to_city = ?"
  ).get(ch.id, ch.city, target.id);
  if (existing) return res.status(409).json({ error: `You already hold a ticket to ${target.name}.` });

  const from = cityById(ch.city);
  const baseFare = Math.floor((from.flightBase + target.flightBase) / 2);
  const base = Math.floor(baseFare * cls.mul);
  const cost = onlinePrice(base);
  if (ch.bank < cost) {
    return res.status(400).json({ error: `Need £${cost.toLocaleString()} in your bank account to pay online.` });
  }

  let departsAt = nextDepartureAt();
  if (departsAt - Date.now() < BOARDING_WINDOW_MS) departsAt += FLIGHT_INTERVAL_MS;

  ch.bank -= cost;
  db.prepare(`
    INSERT INTO flight_tickets (char_id, from_city, to_city, class, cost, departs_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)
  `).run(ch.id, ch.city, target.id, klass, cost, departsAt, Date.now());
  saveCharacter(ch);
  writeLog(ch.id, 'travel',
    `Booked ${klass} ticket to ${target.name} online for £${cost.toLocaleString()} (incl. ${Math.round(ONLINE_MARKUP * 100)}% markup). Head to the airport to board.`);
  res.json({ ok: true, departsAt, cost, base, character: publicCharacter(ch) });
});

export default router;
