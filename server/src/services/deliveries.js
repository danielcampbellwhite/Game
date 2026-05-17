// Pending online vehicle deliveries. Cars bought from /api/online sit
// in vehicle_deliveries until their 4-hour ETA passes; on the next
// applyTick we materialise them into vehicles_owned at the chosen
// destination city.
//
// Garage capacity is checked twice — once at order time (with pending
// deliveries counted against the cap so the player can't over-order)
// and once at materialisation. If the destination is full at delivery,
// the row stays 'pending' and the player is logged a warning so they
// can free a slot and the next tick will retry.

import { db } from '../db.js';
import { vehicleById, cityById, weaponById, armourById, ammoById, miscItemById, propertyById } from '../data.js';
import { freeGarageSpace } from './garage.js';
import { writeLog } from './log.js';
import { upsertHouseStash } from './weight.js';

// Online ordering delay. Heavier loads ride a longer route — a car
// takes 4 hours to ship across town, a long gun an hour, and a
// box of ammo / scratchcards / lockpicks half an hour.
export const DELIVERY_LEAD_MS        = 4 * 60 * 60 * 1000;
export const WEAPON_DELIVERY_LEAD_MS = 1 * 60 * 60 * 1000;
export const GEAR_DELIVERY_LEAD_MS   =     30 * 60 * 1000;

// Resolve the ETA for a kind of delivery. kind='weapon' is the
// long-gun route; everything else (armour, ammo, misc shop) goes
// on the express courier.
export function leadTimeForKind(kind) {
  if (kind === 'weapon') return WEAPON_DELIVERY_LEAD_MS;
  return GEAR_DELIVERY_LEAD_MS;
}

export function listPendingDeliveries(charId) {
  return db.prepare(
    "SELECT * FROM vehicle_deliveries WHERE char_id = ? AND status = 'pending' ORDER BY arrives_at ASC"
  ).all(charId);
}

// How many cars are headed for `city` that we should count against
// its garage capacity right now.
export function pendingDeliveryCountInCity(charId, city) {
  const r = db.prepare(
    "SELECT COUNT(*) AS n FROM vehicle_deliveries WHERE char_id = ? AND destination_city = ? AND status = 'pending'"
  ).get(charId, city);
  return r?.n || 0;
}

// Materialise any deliveries whose ETA has passed. Returns the rows
// that were turned into vehicles_owned in this pass — applyTick uses
// the count to decide whether to write a log entry for the player.
export function materializeReadyDeliveries(charId, now = Date.now()) {
  const ready = db.prepare(
    "SELECT * FROM vehicle_deliveries WHERE char_id = ? AND status = 'pending' AND arrives_at <= ?"
  ).all(charId, now);
  const delivered = [];
  for (const d of ready) {
    // Re-validate garage capacity at delivery time. If the player
    // freed-then-re-filled the slot during the ETA window we hold the
    // row in 'pending' so the next tick can try again — better than
    // dropping the car on the kerb.
    if (freeGarageSpace(charId, d.destination_city) <= 0) {
      // Log once (lightly) per stalled delivery so the player knows
      // why their car hasn't shown up.
      writeLog(charId, 'delivery',
        ` Delivery of ${vehicleDescription(d.vehicle_id)} to ${cityById(d.destination_city)?.name || d.destination_city} is waiting — your garage there is full.`,
        { delivery: d.id, vehicle: d.vehicle_id, city: d.destination_city });
      continue;
    }
    const info = db.prepare(`
      INSERT INTO vehicles_owned (char_id, vehicle_id, acquired_via, city, acquired_at, purchase_price, condition, fuel, class)
      VALUES (?, ?, 'bought', ?, ?, ?, 100, 100, 'car')
    `).run(charId, d.vehicle_id, d.destination_city, now, d.cost);
    db.prepare(
      "UPDATE vehicle_deliveries SET status = 'delivered', delivered_at = ? WHERE id = ?"
    ).run(now, d.id);
    writeLog(charId, 'delivery',
      ` Delivered: ${vehicleDescription(d.vehicle_id)} arrived at your ${cityById(d.destination_city)?.name || d.destination_city} garage.`,
      { delivery: d.id, vehicle: d.vehicle_id, city: d.destination_city, vehicle_row: info.lastInsertRowid }, true);
    delivered.push(d);
  }
  return delivered;
}

function vehicleDescription(vehicleId) {
  const v = vehicleById(vehicleId);
  return v ? `${v.maker} ${v.name}` : vehicleId;
}

// ─── Weapon / armour / ammo deliveries ────────────────────────
// Same shape as vehicle deliveries but the destination is a specific
// owned property and the goods drop into that property's house stash.
// No carry-weight check at delivery — the stash itself bears the
// load; the player can move it onto their person later.

export function listPendingWeaponDeliveries(charId) {
  return db.prepare(
    "SELECT * FROM weapon_deliveries WHERE char_id = ? AND status = 'pending' ORDER BY arrives_at ASC"
  ).all(charId);
}

export function materializeReadyWeaponDeliveries(charId, now = Date.now()) {
  const ready = db.prepare(
    "SELECT * FROM weapon_deliveries WHERE char_id = ? AND status = 'pending' AND arrives_at <= ?"
  ).all(charId, now);
  const delivered = [];
  for (const d of ready) {
    // Re-confirm the destination property still belongs to the player —
    // sold properties shouldn't accept deliveries. If it's been sold,
    // mark the delivery 'lost' rather than letting it linger.
    const prop = db.prepare(
      'SELECT id, city, property_id FROM properties_owned WHERE id = ? AND char_id = ?'
    ).get(d.destination_property, charId);
    if (!prop) {
      db.prepare("UPDATE weapon_deliveries SET status = 'lost', delivered_at = ? WHERE id = ?").run(now, d.id);
      writeLog(charId, 'delivery',
        ` Delivery of ${gearDescription(d)} couldn't be delivered — the destination property is no longer yours.`,
        { delivery: d.id, kind: d.kind, item: d.item_id });
      continue;
    }
    upsertHouseStash(charId, prop.id, prop.city, d.kind, d.item_id, d.qty);
    db.prepare(
      "UPDATE weapon_deliveries SET status = 'delivered', delivered_at = ? WHERE id = ?"
    ).run(now, d.id);
    const propMeta = propertyById(prop.property_id);
    writeLog(charId, 'delivery',
      ` Delivered: ${d.qty}× ${gearDescription(d)} → stashed at your ${propMeta?.name || 'property'} in ${cityById(prop.city)?.name}.`,
      { delivery: d.id, kind: d.kind, item: d.item_id, property: prop.id }, true);
    delivered.push(d);
  }
  return delivered;
}

function gearDescription(d) {
  if (d.kind === 'weapon') return weaponById(d.item_id)?.name   || d.item_id;
  if (d.kind === 'armour') return armourById(d.item_id)?.name   || d.item_id;
  if (d.kind === 'ammo')   return ammoById(d.item_id)?.name     || d.item_id;
  if (d.kind === 'misc')   return miscItemById(d.item_id)?.name || d.item_id;
  return d.item_id;
}
