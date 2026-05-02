import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { cityById } from '../data.js';

const router = Router();

// ── Tunables ───────────────────────────────────────────────────────────
const MAX_ACTIVE_PER_PLAYER = 3;
const LISTING_TTL_MS        = 7 * 24 * 60 * 60 * 1000; // 7 days
const TITLE_MIN = 3;
const TITLE_MAX = 60;
const BODY_MIN  = 10;
const BODY_MAX  = 500;
const RATE_MAX  = 40;

// Categories — fixed enum so the client can colour-code consistently.
// Values are stored as-is; emoji + label are rendered client-side from
// this same list (kept in sync via the GET /categories surface).
export const CATEGORIES = [
  { id: 'protection',   emoji: '🛡️', label: 'Protection' },
  { id: 'driver',       emoji: '🚗', label: 'Driver' },
  { id: 'mechanic',     emoji: '🔧', label: 'Mechanic' },
  { id: 'hacker',       emoji: '💻', label: 'Hacker' },
  { id: 'medic',        emoji: '🩹', label: 'Medic' },
  { id: 'lookout',      emoji: '👁️', label: 'Lookout' },
  { id: 'muscle',       emoji: '🤜', label: 'Muscle' },
  { id: 'investigator', emoji: '🕵️', label: 'Investigator' },
  { id: 'tutor',        emoji: '🎓', label: 'Tutor' },
  { id: 'other',        emoji: '📦', label: 'Other' },
];
const CATEGORY_IDS = new Set(CATEGORIES.map(c => c.id));

// Lazy-expire any listings whose TTL has passed before the caller sees
// the board. Cheap because it's keyed on (city, expires_at).
function pruneExpired(now) {
  db.prepare('DELETE FROM job_board_listings WHERE expires_at <= ?').run(now);
}

function decorate(row, posterById) {
  const p = posterById.get(row.poster_id);
  const meta = CATEGORIES.find(c => c.id === row.category) || { emoji: '📦', label: row.category };
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    rate_text: row.rate_text,
    category: row.category,
    category_label: meta.label,
    category_emoji: meta.emoji,
    created_at: row.created_at,
    expires_at: row.expires_at,
    poster: p ? {
      id: p.id, name: p.name, avatar: p.avatar, level: p.level,
    } : null,
  };
}

// GET /api/job-board
//
// Returns active listings in the caller's current city, plus the static
// category catalogue and a couple of UX-relevant counts (how many of the
// caller's posting slots are still free, etc.).
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const now = Date.now();
  pruneExpired(now);

  const rows = db.prepare(`
    SELECT * FROM job_board_listings
    WHERE city = ? AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(ch.city, now);

  // Bulk-load posters so we don't hit the DB per row.
  const ids = [...new Set(rows.map(r => r.poster_id))];
  const posterRows = ids.length
    ? db.prepare(`SELECT id, name, avatar, level FROM characters WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const posterById = new Map(posterRows.map(p => [p.id, p]));

  const myActive = db.prepare(
    'SELECT COUNT(*) as n FROM job_board_listings WHERE poster_id = ? AND expires_at > ?'
  ).get(ch.id, now).n;

  res.json({
    city: ch.city,
    cityName: cityById(ch.city)?.name,
    categories: CATEGORIES,
    listings: rows.map(r => decorate(r, posterById)),
    my_active_count: myActive,
    max_per_player: MAX_ACTIVE_PER_PLAYER,
    ttl_ms: LISTING_TTL_MS,
  });
});

// POST /api/job-board
router.post('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { category, title, body, rate_text } = req.body || {};

  if (!CATEGORY_IDS.has(category)) {
    return res.status(400).json({ error: 'Pick a category from the list.' });
  }
  const t = (title || '').trim();
  if (t.length < TITLE_MIN || t.length > TITLE_MAX) {
    return res.status(400).json({ error: `Title must be ${TITLE_MIN}-${TITLE_MAX} characters.` });
  }
  const b = (body || '').trim();
  if (b.length < BODY_MIN || b.length > BODY_MAX) {
    return res.status(400).json({ error: `Description must be ${BODY_MIN}-${BODY_MAX} characters.` });
  }
  const r = (rate_text || '').trim();
  if (!r.length || r.length > RATE_MAX) {
    return res.status(400).json({ error: `Rate must be 1-${RATE_MAX} characters.` });
  }

  const now = Date.now();
  pruneExpired(now);

  const active = db.prepare(
    'SELECT COUNT(*) as n FROM job_board_listings WHERE poster_id = ? AND expires_at > ?'
  ).get(ch.id, now).n;
  if (active >= MAX_ACTIVE_PER_PLAYER) {
    return res.status(409).json({ error: `You can have at most ${MAX_ACTIVE_PER_PLAYER} active listings — retract one first.` });
  }

  const result = db.prepare(`
    INSERT INTO job_board_listings (poster_id, city, category, title, body, rate_text, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ch.id, ch.city, category, t, b, r, now, now + LISTING_TTL_MS);

  const row = db.prepare('SELECT * FROM job_board_listings WHERE id = ?').get(result.lastInsertRowid);
  const posterById = new Map([[ch.id, { id: ch.id, name: ch.name, avatar: ch.avatar, level: ch.level }]]);
  res.json({ ok: true, listing: decorate(row, posterById) });
});

// DELETE /api/job-board/:id — retract your own listing
router.delete('/:id', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  const row = db.prepare('SELECT * FROM job_board_listings WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Listing not found.' });
  if (row.poster_id !== ch.id) return res.status(403).json({ error: 'Not your listing.' });
  db.prepare('DELETE FROM job_board_listings WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
