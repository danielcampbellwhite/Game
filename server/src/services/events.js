// Server-Sent Events dispatcher. Each authed client opens a single GET
// /api/events stream; the route stashes the response object in this
// registry, keyed by character id. Anywhere in the codebase that wants to
// push something to a player calls `sendEvent(charId, type, payload)`.
//
// One character can have multiple open streams (a phone tab + a desktop
// tab) — we keep them in a Set per char_id and broadcast to all.

const streams = new Map();   // char_id (number) -> Set<express Response>

export function registerStream(charId, res) {
  let set = streams.get(charId);
  if (!set) {
    set = new Set();
    streams.set(charId, set);
  }
  set.add(res);
}

export function unregisterStream(charId, res) {
  const set = streams.get(charId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) streams.delete(charId);
}

// Push one event to every open stream for a character. Silently drops if
// nobody's listening — fire-and-forget by design. Each event is a JSON
// blob; type goes on the SSE `event:` line so EventSource can dispatch.
export function sendEvent(charId, type, payload = {}) {
  const set = streams.get(charId);
  if (!set || set.size === 0) return;
  const data = JSON.stringify(payload);
  for (const res of set) {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${data}\n\n`);
    } catch {
      // Connection died but onclose hasn't run yet. The unregister will
      // happen on the next tick; ignore the failed write.
    }
  }
}

// Push to every connected character — for world-wide announcements
// like world chat. Iterates the streams registry directly to avoid
// a thousand DB lookups; the per-char sendEvent does the actual fan-out.
export function broadcastAll(type, payload = {}) {
  for (const charId of streams.keys()) sendEvent(charId, type, payload);
}

// Push to a specific list of character ids — for scoped channels like
// faction or gang chat. Filters out duplicates.
export function broadcastTo(charIds, type, payload = {}) {
  const seen = new Set();
  for (const id of charIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    sendEvent(id, type, payload);
  }
}

// Snapshot of who currently has an open stream — useful for "is this
// player connected right now" queries when last_active_at is too coarse.
export function isStreamingTo(charId) {
  const set = streams.get(charId);
  return !!(set && set.size > 0);
}
