import { useEffect, useRef } from 'react';
import { getToken } from '../api.js';

// Subscribe to one named SSE event type from /api/events. Multiple
// components share a single underlying EventSource via this module's
// caches — opening separate streams per component is wasteful.

let sharedSource = null;          // active EventSource
let sharedToken = null;           // token used to open sharedSource
const listeners = new Map();      // event_type -> Set<handler>
const attached = new Set();       // event_types whose dispatcher is bound

function dispatcherFor(type) {
  return (e) => {
    let payload = null;
    try { payload = JSON.parse(e.data); } catch {}
    const set = listeners.get(type);
    if (!set) return;
    for (const h of set) {
      try { h(payload, e); } catch (err) { console.error('SSE handler error', err); }
    }
  };
}

function ensureSource() {
  const token = getToken();
  if (!token) return null;
  if (sharedSource && sharedToken === token && sharedSource.readyState !== 2) {
    return sharedSource;
  }
  if (sharedSource) {
    try { sharedSource.close(); } catch {}
  }
  sharedSource = null;
  attached.clear();
  sharedToken = token;
  const url = `/api/events?token=${encodeURIComponent(token)}`;
  sharedSource = new EventSource(url);
  // Re-attach dispatchers for all types that already have listeners.
  for (const type of listeners.keys()) {
    sharedSource.addEventListener(type, dispatcherFor(type));
    attached.add(type);
  }
  sharedSource.onerror = () => {
    if (sharedSource && sharedSource.readyState === 2) {
      sharedSource = null;
      attached.clear();
    }
  };
  return sharedSource;
}

function bindIfNeeded(type) {
  if (attached.has(type)) return;
  if (!sharedSource) return;
  sharedSource.addEventListener(type, dispatcherFor(type));
  attached.add(type);
}

export function useEventStream(type, handler) {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);

  useEffect(() => {
    if (!type) return;
    const wrapped = (payload, e) => handlerRef.current?.(payload, e);

    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(wrapped);

    ensureSource();
    bindIfNeeded(type);

    return () => {
      const cur = listeners.get(type);
      if (!cur) return;
      cur.delete(wrapped);
      if (cur.size === 0) listeners.delete(type);
    };
  }, [type]);
}

// Forcefully close the shared stream — call on logout so the server stops
// pushing to a now-defunct token.
export function closeEventStream() {
  if (sharedSource) {
    try { sharedSource.close(); } catch {}
  }
  sharedSource = null;
  sharedToken = null;
  attached.clear();
  listeners.clear();
}
