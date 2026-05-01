import { db } from '../db.js';
import { DAILY_MISSIONS, missionById } from '../data.js';
import { writeLog } from './log.js';

// UTC day key. Missions reset at 00:00 UTC.
function utcDay(now = Date.now()) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// XP reward scales with character level so a level-30 player isn't claiming
// the same 60 XP a level-1 is. cash is left flat — the appeal of missions
// is the XP boost, not the payout.
function scaledXp(baseXp, level) {
  const lvl = Math.max(1, level || 1);
  return Math.floor(baseXp * (1 + (lvl - 1) * 0.6));
}

function pickRandom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollFreshSet(charId, level, day) {
  // One easy + one med + one hard. Skip duplicate templates inside the day.
  const byTier = { easy: [], med: [], hard: [] };
  for (const m of DAILY_MISSIONS) byTier[m.tier]?.push(m);

  const picks = [];
  for (const tier of ['easy', 'med', 'hard']) {
    const choice = pickRandom(byTier[tier]);
    if (choice) picks.push(choice);
  }

  db.prepare('DELETE FROM daily_missions WHERE char_id = ?').run(charId);
  const ins = db.prepare(`
    INSERT INTO daily_missions (char_id, mission_id, progress, target, reward_xp, reward_cash, claimed, rolled_day)
    VALUES (?, ?, 0, ?, ?, ?, 0, ?)
  `);
  for (const m of picks) ins.run(charId, m.id, m.target, scaledXp(m.xp, level), m.cash, day);
  return picks.map(m => m.id);
}

// Load current-day missions, rolling fresh if the existing batch is stale
// or missing. Returns the rows from the DB (joined with template metadata).
export function loadMissions(ch) {
  const day = utcDay();
  let rows = db.prepare('SELECT * FROM daily_missions WHERE char_id = ?').all(ch.id);
  if (!rows.length || rows[0].rolled_day !== day) {
    rollFreshSet(ch.id, ch.level || 1, day);
    rows = db.prepare('SELECT * FROM daily_missions WHERE char_id = ?').all(ch.id);
  }
  return rows.map(r => {
    const tpl = missionById(r.mission_id);
    return {
      id: r.mission_id,
      name: tpl?.name || r.mission_id,
      emoji: tpl?.emoji || '❓',
      desc: tpl?.desc || '',
      tier: tpl?.tier || 'easy',
      progress: r.progress,
      target: r.target,
      complete: r.progress >= r.target,
      claimed: !!r.claimed,
      reward_xp: r.reward_xp,
      reward_cash: r.reward_cash,
    };
  });
}

// Increment progress for any active mission whose template matches the
// type+meta. Called from the player-action routes (crimes, gym, etc).
//
// `meta` on the mission template is a partial filter — every key must
// match the corresponding key in the bump's `meta`. e.g. mission meta
// {tier:'major'} matches a bump meta {tier:'major', crime:'bank_rob'}.
export function bumpMission(ch, type, count = 1, meta = null) {
  if (!count || count <= 0) return;
  // Make sure today's missions exist before bumping. Cheap on hot path
  // because once the day is established this is two indexed reads.
  const day = utcDay();
  const sample = db.prepare('SELECT rolled_day FROM daily_missions WHERE char_id = ? LIMIT 1').get(ch.id);
  if (!sample || sample.rolled_day !== day) {
    rollFreshSet(ch.id, ch.level || 1, day);
  }
  const rows = db.prepare('SELECT mission_id, progress, target, claimed FROM daily_missions WHERE char_id = ?').all(ch.id);
  const update = db.prepare('UPDATE daily_missions SET progress = ? WHERE char_id = ? AND mission_id = ?');
  for (const r of rows) {
    if (r.claimed) continue;
    if (r.progress >= r.target) continue;
    const tpl = missionById(r.mission_id);
    if (!tpl || tpl.type !== type) continue;
    if (tpl.meta) {
      if (!meta) continue;
      let ok = true;
      for (const [k, v] of Object.entries(tpl.meta)) {
        if (meta[k] !== v) { ok = false; break; }
      }
      if (!ok) continue;
    }
    const next = Math.min(r.target, r.progress + count);
    if (next !== r.progress) {
      update.run(next, ch.id, r.mission_id);
      if (next >= r.target) {
        writeLog(ch.id, 'mission', `🎯 Mission ready to claim: ${tpl.name}.`, { mission: tpl.id }, true);
      }
    }
  }
}

export function claimMission(ch, missionId) {
  const row = db.prepare('SELECT * FROM daily_missions WHERE char_id = ? AND mission_id = ?').get(ch.id, missionId);
  if (!row) return { error: 'Mission not active.' };
  if (row.claimed) return { error: 'Already claimed.' };
  if (row.progress < row.target) return { error: 'Mission not complete yet.' };
  db.prepare('UPDATE daily_missions SET claimed = 1 WHERE char_id = ? AND mission_id = ?').run(ch.id, missionId);
  return { ok: true, xp: row.reward_xp, cash: row.reward_cash };
}
