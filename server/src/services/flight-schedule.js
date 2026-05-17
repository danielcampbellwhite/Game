// Real-timetable flight schedule.
//
// Every city departs on the same world-clock slots: 20-minute
// intervals aligned to the hour (xx:00, xx:20, xx:40). Players can
// browse and book any slot within the next 4 hours. Boarding opens
// 5 minutes before each scheduled takeoff.
//
// Booking rules:
//   * One seat per (char, from_city, to_city, departs_at) — you
//     can hold tickets for several consecutive slots on the same
//     route, but never two seats on the same slot.
//   * Slots in the past (departs_at < now) or inside the boarding
//     window (departs_at - now < BOARDING_WINDOW_MS) are no longer
//     bookable — they're already on the runway.

export const SLOT_INTERVAL_MS    = 20 * 60 * 1000;
export const SCHEDULE_HORIZON_MS = 4 * 60 * 60 * 1000;
export const BOARDING_WINDOW_MS  = 5 * 60 * 1000;

// The first slot at-or-after `now`, rounded up to the next 20-min
// boundary on the wall clock.
export function firstSlotAtOrAfter(now = Date.now()) {
  return Math.ceil(now / SLOT_INTERVAL_MS) * SLOT_INTERVAL_MS;
}

// The earliest slot a fresh booking can target — same as the next
// slot, but if we're inside the boarding window for that slot, we
// bump to the one after so the ticket can't insta-miss.
export function earliestBookableSlot(now = Date.now()) {
  let s = firstSlotAtOrAfter(now);
  if (s - now < BOARDING_WINDOW_MS) s += SLOT_INTERVAL_MS;
  return s;
}

// All bookable slots inside the 4-hour horizon. Returns an array of
// ms timestamps, ordered ascending.
export function bookableSlots(now = Date.now()) {
  const start = earliestBookableSlot(now);
  const end   = now + SCHEDULE_HORIZON_MS;
  const out = [];
  for (let t = start; t <= end; t += SLOT_INTERVAL_MS) out.push(t);
  return out;
}

// Is `slot` a valid bookable slot from `now`'s perspective?
export function isSlotBookable(slot, now = Date.now()) {
  if (!Number.isFinite(slot)) return false;
  if (slot < earliestBookableSlot(now)) return false;
  if (slot > now + SCHEDULE_HORIZON_MS) return false;
  if (slot % SLOT_INTERVAL_MS !== 0)    return false;
  return true;
}

// Boarding window for a slot — used by the board endpoint to verify
// the player tapped Board at the right moment.
export function inBoardingWindow(departsAt, now = Date.now()) {
  return now >= departsAt - BOARDING_WINDOW_MS && now < departsAt;
}

// Snapshot for the client. The schedule is identical across
// destinations, so we return one shared list of slot timestamps.
export function scheduleSnapshot(now = Date.now()) {
  return {
    now,
    intervalMs:       SLOT_INTERVAL_MS,
    boardingWindowMs: BOARDING_WINDOW_MS,
    horizonMs:        SCHEDULE_HORIZON_MS,
    slots:            bookableSlots(now),
  };
}
