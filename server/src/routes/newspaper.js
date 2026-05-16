// Daily city newspaper. Aggregates the last 24 h of log activity
// across every character physically present in the requested city +
// global signals (turf flips, deaths, stock movers) into a single
// noir-style front page.
//
// Pure read endpoint — no DB writes. Cheap enough to call on every
// page-load; cache later if it becomes a hot path.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { CITIES, cityById } from '../data.js';
import { listAreasInCity } from '../services/areas.js';
import { hourBucket, BUCKET_LABEL, cityLocalTime } from '../services/clock.js';

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

// Reputation threshold below which players are anonymised. Keeps
// low-rep gangsters anonymous in the headlines ("a small-time
// associate") so they're not paraded by name for every fender-
// bender, while well-known names get printed.
const NAMED_REPUTATION_FLOOR = 800;

// Anonymous-name pool for the low-rep crowd. Same-shape strings so
// the page looks like a real paper rather than a debug dump.
const ALIASES = [
  'a small-time hustler',
  'an unnamed associate',
  'a known street fixer',
  'a low-level runner',
  'a face the cops half-recognised',
  'a local enforcer',
];
function aliasFor(charId) {
  return ALIASES[Math.abs(charId * 2654435761) % ALIASES.length];
}
function display(name, rep, charId) {
  return (rep || 0) >= NAMED_REPUTATION_FLOOR ? name : aliasFor(charId);
}

// Pull the day's notable log rows for a city. We JOIN characters so
// we can filter by city + tag rep/name onto each row. Limits keep
// the page fast even on busy servers.
function recentEventsInCity(city, since, kinds, limit = 80) {
  const placeholders = kinds.map(() => '?').join(',');
  return db.prepare(`
    SELECT l.id, l.char_id, l.type, l.message, l.created_at,
           c.name, c.reputation, c.city
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ? AND l.type IN (${placeholders})
    ORDER BY l.id DESC LIMIT ?
  `).all(city, since, ...kinds, limit);
}

// Last 24 h gross crime payouts per character in this city. Used for
// the "Top Earners" section.
function topEarners(city, since, n = 5) {
  const rows = db.prepare(`
    SELECT l.char_id, c.name, c.reputation,
           SUM(
             CASE
               WHEN json_extract(l.meta_json, '$.payout') IS NOT NULL
                 THEN CAST(json_extract(l.meta_json, '$.payout') AS INTEGER)
               ELSE 0
             END
           ) AS total
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ? AND l.type = 'crime'
    GROUP BY l.char_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT ?
  `).all(city, since, n);
  return rows.map(r => ({
    name:  display(r.name, r.reputation, r.char_id),
    total: r.total,
  }));
}

// Biggest SINGLE-attempt crime takes in the last 24h. Distinct from
// topEarners (which sums across the day) — surfaces the spectacular
// one-offs that make for actual newspaper copy.
function bigScores(city, since, n = 5) {
  const rows = db.prepare(`
    SELECT l.id, l.char_id, l.created_at, l.message, c.name, c.reputation,
           CAST(json_extract(l.meta_json, '$.payout') AS INTEGER) AS payout,
           json_extract(l.meta_json, '$.crime') AS crime
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ?
      AND l.type = 'crime'
      AND json_extract(l.meta_json, '$.payout') IS NOT NULL
      AND CAST(json_extract(l.meta_json, '$.payout') AS INTEGER) > 0
    ORDER BY payout DESC
    LIMIT ?
  `).all(city, since, n);
  return rows.map(r => ({
    name:    display(r.name, r.reputation, r.char_id),
    payout:  r.payout,
    crime:   r.crime,
    when:    r.created_at,
  }));
}

// Murders that landed in the last 24 h, attacker side (the kill
// outcome is logged on both attacker and victim; we read the attacker
// row so we can pull cashTaken from meta).
function recentMurders(city, since, n = 12) {
  const rows = db.prepare(`
    SELECT l.id, l.char_id, l.created_at, l.message, c.name, c.reputation,
           CAST(json_extract(l.meta_json, '$.target')    AS INTEGER) AS target_id,
           CAST(json_extract(l.meta_json, '$.cashTaken') AS INTEGER) AS cash_taken,
           json_extract(l.meta_json, '$.outcome')                    AS outcome
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ?
      AND l.type = 'pvp'
      AND json_extract(l.meta_json, '$.outcome') = 'kill'
    ORDER BY l.id DESC
    LIMIT ?
  `).all(city, since, n);
  return rows.map(r => {
    const targetRow = r.target_id
      ? db.prepare('SELECT name, reputation FROM characters WHERE id = ?').get(r.target_id)
      : null;
    return {
      attacker:  display(r.name, r.reputation, r.char_id),
      victim:    targetRow ? display(targetRow.name, targetRow.reputation, r.target_id) : 'an unknown body',
      cashTaken: r.cash_taken || 0,
      when:      r.created_at,
    };
  });
}

// Turf flips (successful captures) inside the city in the last
// 24 h. The log row's message holds the area name + odds; we re-use
// it as-is rather than re-parsing.
function recentTurfFlips(city, since, n = 8) {
  return db.prepare(`
    SELECT l.id, l.created_at, l.message, c.name AS actor_name, c.reputation AS actor_rep, l.char_id AS actor_id
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ?
      AND l.type = 'turf' AND l.message LIKE '%TOOK%'
    ORDER BY l.id DESC
    LIMIT ?
  `).all(city, since, n).map(r => ({
    text: r.message.replace(r.actor_name, display(r.actor_name, r.actor_rep, r.actor_id)),
    when: r.created_at,
  }));
}

// Police blotter — arrests + hospital admissions in the last 24 h.
function blotter(city, since) {
  return db.prepare(`
    SELECT COUNT(*) AS jailings
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ? AND l.message LIKE '%Jailed%'
  `).get(city, since).jailings;
}
function hospitalisations(city, since) {
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ? AND l.message LIKE '%Hospital%'
  `).get(city, since).n;
}

// Turf footprint per faction in this city right now.
function turfSnapshot(city) {
  const areas = listAreasInCity(city);
  const counts = {};
  for (const a of areas) {
    const key = a.faction || 'unclaimed';
    counts[key] = (counts[key] || 0) + 1;
  }
  return { counts, total: areas.length };
}

// Weather flavour — cosmetic. Seeded off (city, day) so the same day
// shows the same weather to every player.
const WEATHER = [
  'Rain on the asphalt',
  'Low-hanging fog',
  'Cold, clear, dangerous',
  'A bone-deep drizzle',
  'Smog so thick the streetlights wear haloes',
  'Crisp wind off the docks',
  'Heat haze warps the skyline',
  'A quiet snowfall settles over the boulevards',
  'Heavy clouds, no rain',
  'Sun glaring off the river',
];
function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}
function weatherFor(city, now) {
  const key = `${city}|${dayKey(now)}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return WEATHER[Math.abs(h) % WEATHER.length];
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetCity = req.query.city || ch.city;
  const meta = cityById(targetCity);
  if (!meta) return res.status(400).json({ error: 'Unknown city.' });

  const now = Date.now();
  const since = now - DAY_MS;

  // Headline pool — mix of crime, turf, casino jackpots, deaths.
  const rawEvents = recentEventsInCity(targetCity, since, ['crime', 'turf', 'casino', 'travel'], 40);
  // Anonymise / shape each row before sending.
  const headlines = rawEvents.map(r => ({
    type: r.type,
    when: r.created_at,
    text: r.message.replace(r.name, display(r.name, r.reputation, r.char_id)),
  })).slice(0, 12);

  const turf = turfSnapshot(targetCity);
  const earners = topEarners(targetCity, since);
  const big = bigScores(targetCity, since);
  const murders = recentMurders(targetCity, since);
  const turfFlips = recentTurfFlips(targetCity, since);
  const jailings = blotter(targetCity, since);
  const hospital = hospitalisations(targetCity, since);

  const { hour, minute } = cityLocalTime(targetCity, now);
  const bucket = hourBucket(targetCity, now);

  res.json({
    city: targetCity,
    cityName: meta.name,
    date: dayKey(now),
    localTime: { hour, minute, bucket, bucketLabel: BUCKET_LABEL[bucket] },
    weather: weatherFor(targetCity, now),
    headlines,
    earners,
    bigScores: big,
    murders,
    turfFlips,
    turf,
    blotter: { jailings, hospital },
    citiesAvailable: CITIES.map(c => ({ id: c.id, name: c.name })),
  });
});

export default router;
