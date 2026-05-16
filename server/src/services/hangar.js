// Private aircraft storage. One hangar per (character, city). Each
// hangar holds aircraft (planes + helicopters) plus a small dedicated
// car-park so the player can drive to the airport, leave the car, and
// fly out. Slot caps differ by class — see HANGAR_MAX below.
//
// A character can own a hangar in any city by paying the purchase
// price at the airport. Slots are upgraded independently (separate
// charges per slot type) up to the max cap.

import { db } from '../db.js';
import { aircraftById } from '../data.js';

// Base hangar = 1 plane + 1 heli + 1 car.
export const HANGAR_BASE_SLOTS = { plane: 1, heli: 1, car: 1 };

// Upgrade caps — set by the user. Planes max 2, helis max 3,
// cars max 5.
export const HANGAR_MAX = { plane: 2, heli: 3, car: 5 };

// Purchase cost for a base hangar. Sized for the real-world
// aircraft market — a single G650 fill-up costs £18k, so a
// £2M lease for the building itself is in the same world.
// Multi-city aviation empire is a serious investment.
export const HANGAR_PURCHASE_COST = 2_000_000;

// Per-tier upgrade cost — each successive slot of the same kind
// is pricier. Plane[0] is the FIRST upgrade past base (so going
// from 1→2 planes costs PLANE_UPGRADE_COST[0]). The plane
// upgrade is steep because it doubles the player's plane capacity
// per hangar — a full plane-pair represents tens of millions of
// aircraft value.
export const SLOT_UPGRADE_COSTS = {
  plane: [3_000_000],                                    // 1 → 2
  heli:  [800_000, 1_500_000],                           // 1 → 2 → 3
  car:   [200_000, 400_000, 700_000, 1_200_000],         // 1 → 2 → 3 → 4 → 5
};

// Load (or null) the hangar in a given city for a character.
export function loadHangar(charId, city) {
  return db.prepare('SELECT * FROM hangars WHERE char_id = ? AND city = ?').get(charId, city);
}

export function loadHangars(charId) {
  return db.prepare('SELECT * FROM hangars WHERE char_id = ? ORDER BY acquired_at ASC').all(charId);
}

// Count how many vehicles of a given class live in this hangar
// today. Vehicles in the hangar are the player's owned rows with
// city=hangar's city and class matching, excluding their active
// vehicle (which travels with them). Aircraft can't be "active" —
// active_vehicle_id always points at a car — so the active filter
// only affects the car-park count.
export function hangarContents(charId, city) {
  const ch = db.prepare('SELECT active_vehicle_id FROM characters WHERE id = ?').get(charId);
  const activeId = ch?.active_vehicle_id || 0;
  const rows = db.prepare(`
    SELECT class, COUNT(*) AS n
    FROM vehicles_owned
    WHERE char_id = ? AND city = ? AND id != ?
    GROUP BY class
  `).all(charId, city, activeId);
  const out = { plane: 0, helicopter: 0, car: 0 };
  for (const r of rows) out[r.class] = r.n;
  return out;
}

// { capacity, used, free } for each class given the hangar row.
export function hangarCapacity(hangar) {
  if (!hangar) return null;
  return {
    plane:      { capacity: hangar.plane_slots, used: 0, free: hangar.plane_slots },
    helicopter: { capacity: hangar.heli_slots,  used: 0, free: hangar.heli_slots  },
    car:        { capacity: hangar.car_slots,   used: 0, free: hangar.car_slots   },
  };
}

export function hangarSummary(charId, city) {
  const h = loadHangar(charId, city);
  if (!h) return null;
  const used = hangarContents(charId, city);
  const cap = hangarCapacity(h);
  for (const k of ['plane', 'helicopter', 'car']) {
    cap[k].used = used[k] || 0;
    cap[k].free = Math.max(0, cap[k].capacity - cap[k].used);
  }
  return { id: h.id, city: h.city, acquired_at: h.acquired_at, slots: cap };
}

export function buyHangar(ch) {
  if (loadHangar(ch.id, ch.city)) return { error: 'You already own a hangar in this city.' };
  if (ch.cash < HANGAR_PURCHASE_COST) return { error: `Need £${HANGAR_PURCHASE_COST.toLocaleString()} for a hangar.` };
  ch.cash -= HANGAR_PURCHASE_COST;
  const now = Date.now();
  db.prepare(`
    INSERT INTO hangars (char_id, city, plane_slots, heli_slots, car_slots, acquired_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ch.id, ch.city, HANGAR_BASE_SLOTS.plane, HANGAR_BASE_SLOTS.heli, HANGAR_BASE_SLOTS.car, now);
  return { ok: true, cost: HANGAR_PURCHASE_COST };
}

// Upgrade one slot of a given class by 1. Returns { ok, cost } or
// { error }. Validates against HANGAR_MAX and the per-tier price.
export function upgradeHangarSlot(ch, slotClass) {
  const h = loadHangar(ch.id, ch.city);
  if (!h) return { error: 'No hangar here — buy one first.' };
  const key = slotClass === 'helicopter' ? 'heli' : slotClass; // db column shorthand
  const colMap = { plane: 'plane_slots', heli: 'heli_slots', car: 'car_slots' };
  if (!colMap[key]) return { error: 'Bad slot class.' };
  const current = h[colMap[key]];
  const max = HANGAR_MAX[key];
  if (current >= max) return { error: `${key} slots already maxed (${max}).` };
  const cost = SLOT_UPGRADE_COSTS[key][current - 1];
  if (cost == null) return { error: 'No upgrade priced for that tier.' };
  if (ch.cash < cost) return { error: `Need £${cost.toLocaleString()} to upgrade.` };
  ch.cash -= cost;
  db.prepare(`UPDATE hangars SET ${colMap[key]} = ${colMap[key]} + 1 WHERE id = ?`).run(h.id);
  return { ok: true, cost, slot: slotClass, new_capacity: current + 1 };
}

// Returns whether the hangar in `city` has a free slot of the
// given aircraft class. Used to validate "can this plane land
// here?" before a flight is accepted.
export function hangarHasFreeSlot(charId, city, vehicleClass) {
  const s = hangarSummary(charId, city);
  if (!s) return false;
  const slot = s.slots[vehicleClass];
  return slot && slot.free > 0;
}
