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
    throw err;
  }
  return data;
}

export const api = {
  get:    (p) => request('GET', p),
  post:   (p, b) => request('POST', p, b),
  patch:  (p, b) => request('PATCH', p, b),
  delete: (p) => request('DELETE', p),
};
