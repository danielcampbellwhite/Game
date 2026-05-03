# Admin / God Mode

The admin panel at `/admin` lets you edit any player's account — level,
cash, stats, vitals, jail/hospital release, and more.

Access is gated by the `users.is_admin` flag in the database. To switch
that flag on for the **first** admin you need a one-time bootstrap.
After that, day-to-day admin work needs nothing but your normal login.

---

## First-time bootstrap

### 1. Pick a secret token

Anything long and random — treat it like a password.

```
example: g0d-m0de-mafia-2026-xyz789
```

### 2. Set it on Railway

Service → **Variables** → add:

| Name          | Value                              |
|---------------|------------------------------------|
| `ADMIN_TOKEN` | the secret you just picked         |

Save. Railway will redeploy automatically.

### 3. After the deploy finishes, log in to the game and open your browser console

Run this, substituting your token:

```js
fetch('/api/admin/promote-self', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'X-Admin-Token': 'PASTE_YOUR_ADMIN_TOKEN_HERE'
  }
}).then(r => r.json()).then(console.log)
```

Expected response:

```json
{ "ok": true, "user_id": 1, "message": "You are now an admin. ADMIN_TOKEN can be removed." }
```

If you see `{ "error": "Bad admin token." }` — the value in
`X-Admin-Token` didn't match `ADMIN_TOKEN` on the server. Check the
env var on Railway and the deploy actually picked it up.

### 4. Refresh the page

A red **Admin** link will appear in the top nav. Open it.

### 5. (Optional) Remove ADMIN_TOKEN from Railway

The flag is now persisted in your `users` row. Admin works for you
forever without the env var. Only keep `ADMIN_TOKEN` if you might want
to bootstrap a *second* admin account later.

---

## Promoting another admin later

If you ever need to add a second admin:

1. Re-add `ADMIN_TOKEN` on Railway and redeploy
2. The other person logs in to their account and runs the same
   `promote-self` fetch from their browser console
3. Remove `ADMIN_TOKEN` again

There is no "promote a different user" endpoint by design — every
admin grants themselves the flag from a logged-in session, which keeps
the audit trail clean.

---

## What the panel does

- **Searchable player list** — every character on the server, sorted
  by recent activity
- **Per-player editor**:
  - **Numeric fields**: level, cash, bank, dirty cash, reputation,
    happiness, health, energy, nerve, strength, defence, speed,
    intelligence. Type a value, click *Save fields*. Only changed
    fields are persisted.
  - **Quick actions**: Max stats · Full vitals · +£1M · +£100M ·
    Release from jail · Discharge from hospital
- Every edit writes a `system` log entry to the *targeted* character's
  log feed, so the player can see something happened to their account
  (and the audit trail lives inside the game).

---

## Security notes

- Bootstrap (`/promote-self`) requires both a valid JWT *and* a
  matching `ADMIN_TOKEN` header. The compare is constant-time.
- Every other admin endpoint requires `users.is_admin = 1` in the DB.
  No token leaks in browser history.
- The `Admin` link is rendered only when `character.is_admin` is true,
  but that's just a UI hint — the server still re-checks on every API
  call. Spoofing the client flag does nothing.

---

## API reference

| Endpoint                            | Auth                       | Purpose                              |
|-------------------------------------|----------------------------|--------------------------------------|
| `POST /api/admin/promote-self`      | JWT + `X-Admin-Token`      | Bootstrap. Sets is_admin = 1 on caller |
| `POST /api/admin/buff-self`         | JWT + admin                | Convenience: lvl 100, max stats, +£100M |
| `GET  /api/admin/players`           | JWT + admin                | List all players                     |
| `GET  /api/admin/players/:id`       | JWT + admin                | Fetch one player                     |
| `POST /api/admin/players/:id/edit`  | JWT + admin                | Apply edits (see body below)         |

### Edit body shape

All fields are optional; send only what you want to change.

```js
{
  // Numeric writes (clamped to safe bounds server-side)
  level: 100,
  cash: 1000000,
  bank: 0,
  dirty_cash: 0,
  reputation: 5000,
  happiness: 100,
  health: 595,
  energy: 595,
  nerve: 30,
  strength: 35,
  defence: 30,
  speed: 30,
  intelligence: 110,

  // Convenience flags
  maxStats: true,             // strength/defence/speed/intelligence to caps
  fullVitals: true,           // health/energy/nerve/happy to max
  cashAdd: 100_000_000,       // delta — added to current cash
  releaseFromJail: true,      // clears jail_until + reason
  releaseFromHospital: true   // clears hospital_until + heals to full
}
```
