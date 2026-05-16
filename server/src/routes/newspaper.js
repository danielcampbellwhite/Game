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

// Strip game-stats grammar from a log message so it reads as
// print copy. Catches:
//   "Atk 24 vs Def 18 (60%)"   → ''
//   "+18xp" / "+£500 +8xp"     → drops the xp tail
//   "(turf +15%)"              → ''
//   "(60% odds)" / "(60% chance)" → ''
//   trailing emoji prefixes    → trimmed
//   numeric stat brackets like "(STR 25)" — left alone, gangsters
//     still talk about each other in tabloid-speak
// Tidies up the spacing + punctuation left behind.
function sanitizeForPrint(text) {
  if (!text) return text;
  let out = String(text);
  // "Atk N vs Def N" + an optional trailing "(NN%)" parenthetical.
  out = out.replace(/\bAtk\s+\d+\s+vs\s+Def\s+\d+(?:\s*\(\d+%(?:\s*(?:odds|chance))?\))?\s*\.?/gi, '');
  // Standalone "(NN%)" / "(NN% odds)" / "(NN% chance)" parentheticals.
  out = out.replace(/\s*\(\d+%\s*(?:odds|chance)?\)/gi, '');
  // "+18xp" — strip xp gain mentions.
  out = out.replace(/\s*\+\d+xp\b/gi, '');
  // "(turf +15%)" — territorial multiplier callouts.
  out = out.replace(/\s*\(turf\s*\+\d+%\)/gi, '');
  // "(intel +5%)" / similar generic bracketed % bonuses.
  out = out.replace(/\s*\([^()]*\+\d+%[^()]*\)/g, '');
  // Any parenthetical containing a "N/M" ratio (QTE hits / sequence
  // lengths) — strip the whole bracket.
  out = out.replace(/\s*\([^()]*\d+\/\d+[^()]*\)/g, '');
  // Any parenthetical containing "% odds" / "% chance" alongside
  // other prose (e.g. "5/5 clean, 95% odds" already caught above,
  // but "(95% odds)" left over after other strips lands here).
  out = out.replace(/\s*\([^()]*\d+%\s*(?:odds|chance)[^()]*\)/gi, '');
  // Collapse "  " and stray " ." / " ," left behind.
  out = out.replace(/\s+([.,])/g, '$1');
  out = out.replace(/\s{2,}/g, ' ').trim();
  // If we stripped everything off a sentence, leave a no-op rather
  // than an empty headline.
  if (!out) return text.trim();
  return out;
}

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
//
// Each row gets a `story` field — a noir narrative sentence built
// from the crime template id + payout + actor handle. The story is
// what the client renders as the body copy; the raw payout / actor
// stay on the row for the headline summary line.
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
  return rows.map(r => {
    const actor = display(r.name, r.reputation, r.char_id);
    return {
      name:    actor,
      payout:  r.payout,
      crime:   r.crime,
      when:    r.created_at,
      story:   crimeNarrative(r.crime, r.payout, actor),
    };
  });
}

// Noir narrative copy for a crime tier/id. The catalogue is small —
// most player crimes route into one of a dozen archetypes. Unknown
// ids fall through to a generic wire-service sentence so the page
// never reads "undefined".
function crimeNarrative(crimeId, payout, actor) {
  const money = '£' + (payout || 0).toLocaleString();
  const t = (s) => s.replace(/\{actor\}/g, actor).replace(/\{money\}/g, money);
  const lc = String(crimeId || '').toLowerCase();
  // Tier-specific narratives. The catalogue ids in data.js group by
  // theme: gta_*, mug, jewellery, phishing, drug_run, etc.
  if (lc.startsWith('gta_'))                   return t('A vehicle was reported stolen overnight. The booster slipped through with {money}-worth of luxury auto. CCTV came back empty.');
  if (lc.includes('jewell') || lc === 'jewellery') return t('A jewellery shop had its display cases shattered just before close. Detectives put the haul at {money}. No suspects in custody.');
  if (lc.includes('bank') || lc.includes('vault')) return t('A bank job came good for {actor}\'s crew — tellers cleaned out at {money} before the vault timers tripped.');
  if (lc.includes('phish') || lc.includes('hack') || lc.includes('cyber')) return t('A phishing run drained accounts across the city — {money} in untraceable transfers. Banks are reviewing logs.');
  if (lc.includes('drug') || lc.includes('deal'))  return t('A drug deal moved through a side alley off the dock road. {money} changed hands. No bodies, this time.');
  if (lc.includes('mug'))                       return t('A pedestrian was muggedin broad daylight. The assailant lifted {money} and bolted into the crowd.');
  if (lc.includes('bike'))                      return t('A pushbike was reported stolen from a railway station. Owner valued it at {money}.');
  if (lc.includes('shop') || lc.includes('store') || lc.includes('till')) return t('A high-street till was emptied in under a minute. Owners are out {money}. Insurance adjusters next.');
  if (lc.includes('art') || lc.includes('gallery')) return t('A piece was lifted from a downtown gallery. Insurers value the missing work at {money}. The frame was left behind.');
  if (lc.includes('casino') || lc.includes('slot'))  return t('A casino cage walked out with {money} unaccounted for. Pit bosses are reviewing the floor cameras.');
  if (lc.includes('lab') || lc.includes('produce'))  return t('Police raided a suspected production lab; the operators had already cleared out, but a ledger suggests {money} went out the door this week.');
  if (lc.includes('extort') || lc.includes('protect')) return t('A small-business owner reportedly paid {money} in "protection" money. No one is naming anyone.');
  if (lc.includes('major') || lc.includes('heist')) return t('A coordinated heist hit the district hard — {money} netted, getaway vehicles recovered burnt out three blocks away.');
  return t('A job came good. {money} ended up in unknown pockets. Detectives have no suspects.');
}

// Turf flips by gang in the last 24h, with attacker/defender gang
// names pulled from the log meta (or falling back to the attacker's
// CURRENT gang for legacy rows). Returned shape ready for a
// narrative paragraph + a tidy list.
function recentTurfFlipsRich(city, since, limit = 12) {
  const rows = db.prepare(`
    SELECT l.id, l.created_at, l.message, l.meta_json,
           c.name AS actor_name, c.reputation AS actor_rep, l.char_id AS actor_id
    FROM log l
    JOIN characters c ON c.id = l.char_id
    WHERE c.city = ? AND l.created_at >= ?
      AND l.type = 'turf' AND l.message LIKE '%TOOK%'
    ORDER BY l.id DESC
    LIMIT ?
  `).all(city, since, limit);
  return rows.map(r => {
    let meta = {};
    try { meta = r.meta_json ? JSON.parse(r.meta_json) : {}; } catch {}
    // Fallback for legacy rows: look up the actor's CURRENT gang.
    if (!meta.attacker_gang_name && r.actor_id) {
      const mem = db.prepare('SELECT g.id, g.name, g.tag, g.faction FROM gang_members m JOIN gangs g ON g.id = m.gang_id WHERE m.char_id = ?').get(r.actor_id);
      if (mem) {
        meta.attacker_gang_name = mem.name;
        meta.attacker_gang_tag  = mem.tag;
        meta.attacker_faction   = mem.faction;
      }
    }
    return {
      when:               r.created_at,
      area:               meta.area_name || null,
      attacker_gang_name: meta.attacker_gang_name || null,
      attacker_gang_tag:  meta.attacker_gang_tag  || null,
      attacker_faction:   meta.attacker_faction   || null,
      defender_gang_name: meta.defender_gang_name || null,
      defender_gang_tag:  meta.defender_gang_tag  || null,
      defender_faction:   meta.defender_faction   || null,
      // Lead actor name fallback if there's no gang info at all.
      actor: display(r.actor_name, r.actor_rep, r.actor_id),
    };
  });
}

// One paragraph of newsroom copy summarising the day's flips. Names
// each gang involved, the count of sectors swapped, and gestures at
// the civilian impact. Returns null if no flips today.
function turfWarStory(flips, cityName) {
  if (!flips.length) return null;
  // Group by attacker gang to count sectors taken.
  const byAttacker = {};
  for (const f of flips) {
    const k = f.attacker_gang_name || f.attacker_faction || 'an unaffiliated crew';
    byAttacker[k] = (byAttacker[k] || 0) + 1;
  }
  // Set of defenders who LOST ground today.
  const defenders = Array.from(new Set(
    flips.map(f => f.defender_gang_name).filter(Boolean)
  ));
  const attackerEntries = Object.entries(byAttacker).sort((a, b) => b[1] - a[1]);
  const topName = attackerEntries[0][0];
  const topCount = attackerEntries[0][1];
  const sectorWord = topCount === 1 ? 'sector' : 'sectors';
  const totalSectors = flips.length;

  let opening;
  if (attackerEntries.length === 1) {
    if (defenders.length === 1) {
      opening = `${topName} tightened its grip on ${cityName}, peeling ${topCount} ${sectorWord} away from ${defenders[0]}.`;
    } else if (defenders.length > 1) {
      opening = `${topName} went on the offensive across ${cityName}, claiming ${topCount} ${sectorWord} from rival crews.`;
    } else {
      opening = `${topName} planted flags in ${topCount} unclaimed ${sectorWord} across ${cityName}.`;
    }
  } else {
    const players = attackerEntries.map(([name, n]) => `${name} (${n})`).join(', ');
    opening = `Open warfare broke out across ${cityName} — ${totalSectors} sectors changed hands. Front lines: ${players}.`;
  }

  // Sector-list sentence + civilian flavour.
  const areaList = flips.map(f => f.area).filter(Boolean).slice(0, 5);
  const areasText = areaList.length
    ? ` ${areaList.length === 1 ? 'Block affected' : 'Blocks affected'}: ${areaList.join(', ')}.`
    : '';

  const civilianFlavour = [
    'Locals reported shuttered shopfronts and a noticeable absence of regular patrols.',
    'Civilians in the contested blocks kept off the streets after dark — the usual evening trade dried up.',
    'Small businesses pulled their shutters early. Cafés took the day off. The cops, predictably, stayed out of it.',
    'Bus drivers re-routed around the worst of it. Schools released early.',
    'Residents reported sirens in irregular bursts through the morning. Nobody answered the precinct line.',
  ];
  const seed = (flips[0]?.when || Date.now()) % civilianFlavour.length;
  const flavour = civilianFlavour[seed];

  return opening + areasText + ' ' + flavour;
}

// Murders that landed in the last 24 h. Always name the victim;
// only name the killer if their reputation puts them above the
// "named" threshold (display() handles this) AND the attempt was
// logged with the kill outcome. Same noir voice as the rest.
function recentMurdersNamed(city, since, n = 12) {
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
    // Victims: always named (they're dead and on the obits page).
    const victim = targetRow?.name || 'an unidentified body';
    // Killer: only named if reputation puts them above the threshold.
    // Below that, the cops "don't know who did it".
    const killerKnown = (r.reputation || 0) >= NAMED_REPUTATION_FLOOR;
    return {
      victim,
      attacker:    killerKnown ? r.name : null,
      attackerKnown: killerKnown,
      cashTaken:   r.cash_taken || 0,
      when:        r.created_at,
    };
  });
}

// Murders that landed in the last 24 h, attacker side (the kill
// outcome is logged on both attacker and victim; we read the attacker
// row so we can pull cashTaken from meta).
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
  // Travel arrivals ("Arrived at Bank") are noise on a front page —
  // they aren't news. Drop the 'travel' kind entirely.
  const rawEvents = recentEventsInCity(targetCity, since, ['crime', 'turf', 'casino'], 40);
  // Anonymise + scrub game-stat grammar before sending. Two-pass:
  // first swap the actor handle for a low-rep alias, then strip
  // any "Atk/Def/xp/turf%" stat tokens leaked from the raw log.
  const headlines = rawEvents.map(r => ({
    type: r.type,
    when: r.created_at,
    text: sanitizeForPrint(
      r.message.replace(r.name, display(r.name, r.reputation, r.char_id))
    ),
  })).slice(0, 12);

  const turf = turfSnapshot(targetCity);
  const earners = topEarners(targetCity, since);
  const big = bigScores(targetCity, since);
  const murders = recentMurdersNamed(targetCity, since);
  const turfFlips = recentTurfFlipsRich(targetCity, since);
  const turfWar = turfWarStory(turfFlips, meta.name);
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
    turfWar,
    turf,
    blotter: { jailings, hospital },
    citiesAvailable: CITIES.map(c => ({ id: c.id, name: c.name })),
  });
});

export default router;
