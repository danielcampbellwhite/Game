import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { JOBS } from '../data.js';
import { saveCharacter, awardXp, publicCharacter } from '../services/character.js';
import { bumpMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';

const router = Router();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

// ── Tunables ───────────────────────────────────────────────────────────
//
// Players check in at most once per hour during their shift; each
// check-in immediately credits one hourly wage to pending_pay. Stay
// online and you make more money. Skip an entire scheduled shift
// (zero check-ins between its start and end) and you're fired.
const CHECKIN_COOLDOWN_MS = 60 * 60 * 1000;       // 1h between check-ins

const jobById = id => JOBS.find(j => j.id === id);

function meetsGates(ch, job) {
  const g = job.gates || {};
  if ((ch.level         || 0) < (g.level         || 0)) return false;
  if ((ch.strength      || 0) < (g.strength      || 0)) return false;
  if ((ch.defence       || 0) < (g.defence       || 0)) return false;
  if ((ch.speed         || 0) < (g.speed         || 0)) return false;
  if ((ch.intelligence  || 0) < (g.intelligence  || 0)) return false;
  if ((ch.reputation    || 0) < (g.reputation    || 0)) return false;
  return true;
}

// ─── Shift schedule helpers ──────────────────────────────────────────

// Returns {start, end} (UTC ms) for the shift starting on the given calendar
// day. `dateForDay` only its UTC date matters; we set the time from schedule.
function shiftWindow(dateForDay, schedule) {
  const d = new Date(dateForDay);
  d.setUTCHours(schedule.startHour, 0, 0, 0);
  const start = d.getTime();
  return { start, end: start + schedule.durationHours * HOUR_MS };
}
function isWorkingDay(date, schedule) {
  return schedule.days.includes(date.getUTCDay());
}
// Current open shift (looks at today + yesterday for overnight shifts).
function findCurrentShift(now, schedule) {
  for (let off = 0; off <= 1; off++) {
    const d = new Date(now - off * DAY_MS);
    if (!isWorkingDay(d, schedule)) continue;
    const w = shiftWindow(d, schedule);
    if (now >= w.start && now < w.end) return w;
  }
  return null;
}
function findNextShift(now, schedule) {
  for (let off = 0; off < 14; off++) {
    const d = new Date(now + off * DAY_MS);
    if (!isWorkingDay(d, schedule)) continue;
    const w = shiftWindow(d, schedule);
    if (w.start > now) return w;
  }
  return null;
}
// Most recent shift whose end has fully passed. Used by the auto-fire
// check to ask "did the player turn up to that one?".
function findMostRecentClosedShift(now, schedule) {
  for (let off = 0; off < 14; off++) {
    const d = new Date(now - off * DAY_MS);
    if (!isWorkingDay(d, schedule)) continue;
    const w = shiftWindow(d, schedule);
    if (w.end <= now) return w;
  }
  return null;
}

// ─── Employment helpers ──────────────────────────────────────────────

function loadEmployment(charId) {
  return db.prepare('SELECT * FROM employment WHERE char_id = ?').get(charId);
}

// Fire if the most recent shift that has fully closed (end ≤ now) and
// started after the player's hire date had zero check-ins during it.
// Pending pay is dropped on fire — collect before getting sacked.
function autoFire(employment, charId) {
  if (!employment) return null;
  const job = jobById(employment.job_id);
  if (!job?.schedule) return employment;
  const now = Date.now();
  const closed = findMostRecentClosedShift(now, job.schedule);
  if (!closed) return employment;
  if (closed.start < (employment.hired_at || 0)) return employment;  // pre-hire shift, ignore
  // Did the player turn up at any point during that shift?
  const last = employment.last_checkin_at || 0;
  if (last < closed.start) {
    db.prepare('DELETE FROM employment WHERE char_id = ?').run(charId);
    writeLog(charId, 'job', `🔥 Fired from ${job.name} — missed your shift on ${new Date(closed.start).toUTCString()}.`, null, true);
    return null;
  }
  return employment;
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function describeSchedule(schedule) {
  if (!schedule) return '';
  // Compact day list — collapse contiguous runs
  const sorted = [...schedule.days].sort((a, b) => a - b);
  // Days are 0-6 with Sun=0. Re-order Mon-first for readability.
  const reordered = sorted.map(d => (d === 0 ? 7 : d)).sort((a, b) => a - b).map(d => d === 7 ? 0 : d);
  let parts = [];
  let runStart = reordered[0], prev = reordered[0];
  for (let i = 1; i <= reordered.length; i++) {
    const cur = reordered[i];
    const monPrev = prev === 0 ? 7 : prev;
    const monCur = cur === 0 ? 7 : cur;
    if (i === reordered.length || monCur - monPrev !== 1) {
      parts.push(runStart === prev ? DAY_NAMES[runStart] : `${DAY_NAMES[runStart]}–${DAY_NAMES[prev]}`);
      runStart = cur;
    }
    prev = cur;
  }
  const start = `${String(schedule.startHour).padStart(2,'0')}:00`;
  const endHour = (schedule.startHour + schedule.durationHours) % 24;
  const end = `${String(endHour).padStart(2,'0')}:00`;
  const overnight = (schedule.startHour + schedule.durationHours) >= 24 ? ' (overnight)' : '';
  return `${parts.join(', ')} · ${start}–${end} UTC${overnight}`;
}

function publicEmployment(employment) {
  if (!employment) return null;
  const job = jobById(employment.job_id);
  if (!job) return null;
  const now = Date.now();
  const current = findCurrentShift(now, job.schedule);
  const next = findNextShift(now, job.schedule);
  // Cooldown anchor: zero if never checked in, so the very first check-in
  // is immediately allowed once the shift opens.
  const lastCheckin = employment.last_checkin_at || 0;
  const nextCheckinAt = lastCheckin
    ? lastCheckin + CHECKIN_COOLDOWN_MS
    : 0;
  const cooldownReady = now >= nextCheckinAt;
  // "Did you turn up?" flag for the currently-open shift. Drives both
  // the fire-warning banner and the contextual UI copy.
  const turnedUpForCurrent = !!current && lastCheckin >= current.start && lastCheckin < current.end;
  // If you haven't checked in for the current shift, you'll be sacked
  // when the shift ends. If you have, the next firing risk is the next
  // shift's end. We surface only the immediately-relevant deadline.
  const fireAt = current && !turnedUpForCurrent
    ? current.end
    : next ? next.end : null;
  return {
    job: { id: job.id, name: job.name, emoji: job.emoji, hourly: job.hourly, task: job.task, taskEnergy: job.taskEnergy, xp: job.xp,
           schedule: job.schedule, scheduleLabel: describeSchedule(job.schedule) },
    hired_at: employment.hired_at,
    last_checkin_at: lastCheckin || null,
    current_shift: current,
    next_shift: next,
    on_shift_now: !!current,
    turned_up_for_current_shift: turnedUpForCurrent,
    next_checkin_at: nextCheckinAt || null,
    cooldown_ready: cooldownReady,
    can_checkin_now: !!current && cooldownReady,
    pending_pay: employment.pending_pay || 0,
    total_earned: employment.total_earned || 0,
    fire_at: fireAt,
    fire_reason: current && !turnedUpForCurrent
      ? 'no_show_current_shift'
      : (!current && next ? 'no_show_next_shift' : null),
    checkin_cooldown_ms: CHECKIN_COOLDOWN_MS,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const employment = autoFire(loadEmployment(ch.id), ch.id);

  const employed = !!employment;
  const jobs = JOBS.map(j => ({
    ...j,
    eligible: meetsGates(ch, j),
    isCurrent: employed && employment.job_id === j.id,
    locked: !meetsGates(ch, j),
    scheduleLabel: describeSchedule(j.schedule),
  }));

  res.json({ jobs, employment: publicEmployment(employment) });
});

router.post('/apply', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const job = jobById(req.body?.job_id);
  if (!job) return res.status(400).json({ error: 'Unknown job' });
  if (!meetsGates(ch, job)) return res.status(403).json({ error: "You don't meet the requirements for that role." });
  const existing = autoFire(loadEmployment(ch.id), ch.id);
  if (existing) return res.status(409).json({ error: 'You already have a job — quit it first.' });

  const now = Date.now();
  // last_checkin_at = 0 so the first check-in isn't gated by the cooldown,
  // and so the autoFire deadline anchors on hired_at instead.
  db.prepare(`
    INSERT INTO employment (char_id, job_id, hired_at, last_paid_at, last_checkin_at, pending_pay)
    VALUES (?, ?, ?, ?, 0, 0)
  `).run(ch.id, job.id, now, now);

  writeLog(ch.id, 'job', `Hired as ${job.name} — £${job.hourly.toLocaleString()}/hr while on shift. Schedule: ${describeSchedule(job.schedule)}.`);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/quit', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const employment = autoFire(loadEmployment(ch.id), ch.id);
  if (!employment) return res.status(400).json({ error: "You're not employed." });
  const job = jobById(employment.job_id);

  const pay = employment.pending_pay || 0;
  if (pay > 0) ch.cash += pay;
  db.prepare('DELETE FROM employment WHERE char_id = ?').run(ch.id);
  writeLog(ch.id, 'job', `Quit ${job?.name}.${pay > 0 ? ` Final pay £${pay.toLocaleString()}.` : ''}`);
  saveCharacter(ch);
  res.json({ ok: true, finalPay: pay, character: publicCharacter(ch) });
});

router.post('/checkin', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const employment = autoFire(loadEmployment(ch.id), ch.id);
  if (!employment) return res.status(400).json({ error: "You're not employed." });
  const job = jobById(employment.job_id);
  if (!job) return res.status(400).json({ error: 'Job missing.' });

  const now = Date.now();
  const current = findCurrentShift(now, job.schedule);
  if (!current) {
    const next = findNextShift(now, job.schedule);
    return res.status(409).json({
      error: 'Outside shift hours.',
      nextShift: next,
    });
  }
  // 1-hour cooldown between check-ins (skipped on the very first check-in
  // for a fresh hire so they can clock in the moment a shift opens).
  const lastCheckin = employment.last_checkin_at || 0;
  if (lastCheckin && now - lastCheckin < CHECKIN_COOLDOWN_MS) {
    const wait = Math.ceil((CHECKIN_COOLDOWN_MS - (now - lastCheckin)) / 1000);
    return res.status(429).json({
      error: `Already checked in this hour — next check-in in ${Math.floor(wait / 60)}m ${wait % 60}s.`,
      nextCheckinAt: lastCheckin + CHECKIN_COOLDOWN_MS,
    });
  }
  if (ch.energy < job.taskEnergy) return res.status(400).json({ error: `Need ${job.taskEnergy} energy.` });

  ch.energy -= job.taskEnergy;
  const lvls = awardXp(ch, job.xp);
  ch.reputation += Math.floor(job.xp / 5);
  ch.happiness = Math.min(100, ch.happiness + 1);
  bumpMission(ch, 'job_checkin', 1, { job: job.id });

  // Credit one hour's wage immediately to pending; can be collected anytime.
  const newPending = (employment.pending_pay || 0) + job.hourly;
  db.prepare(`
    UPDATE employment
    SET last_checkin_at = ?, pending_pay = ?, total_earned = total_earned + ?, last_checkin_shift_end = NULL
    WHERE char_id = ?
  `).run(now, newPending, job.hourly, ch.id);

  writeLog(ch.id, 'job', `${job.emoji} Hourly check-in: ${job.task}. +£${job.hourly.toLocaleString()} pending.`);
  saveCharacter(ch);
  res.json({
    ok: true,
    levels: lvls,
    earned: job.hourly,
    pending_pay: newPending,
    next_checkin_at: now + CHECKIN_COOLDOWN_MS,
    character: publicCharacter(ch),
  });
});

router.post('/collect', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const employment = autoFire(loadEmployment(ch.id), ch.id);
  if (!employment) return res.status(400).json({ error: "You're not employed." });

  const pay = employment.pending_pay || 0;
  if (pay <= 0) return res.status(400).json({ error: 'Nothing to collect — check in to earn an hour of wages.' });

  ch.cash += pay;
  db.prepare('UPDATE employment SET pending_pay = 0 WHERE char_id = ?').run(ch.id);

  const job = jobById(employment.job_id);
  writeLog(ch.id, 'job', `Collected £${pay.toLocaleString()} of unpaid wages from ${job?.name}.`);
  saveCharacter(ch);
  res.json({ ok: true, pay, character: publicCharacter(ch) });
});

export default router;
