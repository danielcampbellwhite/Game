const BASE = '/api';

let token = localStorage.getItem('mafia_token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('mafia_token', t);
  else localStorage.removeItem('mafia_token');
}
export function getToken() { return token; }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    // Surface intra-city location/travel lockouts as a window event so
    // App.jsx can route the player to /city without every page having
    // to special-case the 409. See middleware/location.js.
    if (typeof window !== 'undefined' && res.status === 409 &&
        (data?.not_at_location || data?.intra_travel_until)) {
      try { window.dispatchEvent(new CustomEvent('mafia:not-at-location', { detail: data })); } catch {}
    }
    throw err;
  }
  return data;
}

export const api = {
  get:    (p) => request('GET', p),
  post:   (p, b) => request('POST', p, b),
  patch:  (p, b) => request('PATCH', p, b),
  delete: (p, b) => request('DELETE', p, b),
};
