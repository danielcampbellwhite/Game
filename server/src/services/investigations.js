// Detective → evidence bar → trial → criminal record. The slow-burn
// counterpart to instant jail. Every crime drips evidence into an
// open investigation; once the bar fills, charges are filed and the
// player faces a trial they must resolve (plead, lawyer up, bribe,
// or take their chances in court). Convictions stack into a permanent
// criminal record that softens or hardens over time and shapes how
// the cops treat you on subsequent jail rolls.
//
// Inline migrations — three new tables, all idempotent.

import { db } from '../db.js';
import { writeLog } from './log.js';
import { sendEvent } from './events.js';
import { applyJailSentence } from './character.js';

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_investigations (
      char_id           INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      detective_name    TEXT    NOT NULL,
      evidence          REAL    NOT NULL DEFAULT 0,
      started_at        INTEGER NOT NULL,
      last_evidence_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_trials (
      char_id           INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      base_jail_min     INTEGER NOT NULL,
      detective_name    TEXT    NOT NULL,
      effective_evidence REAL   NOT NULL,
      lawyer_count      INTEGER NOT NULL DEFAULT 0,
      bribed            INTEGER NOT NULL DEFAULT 0,
      filed_at          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS criminal_records (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id           INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      crime_tier        TEXT,
      jail_min          INTEGER NOT NULL,
      convicted_at      INTEGER NOT NULL,
      detective_name    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_crimrec_char ON criminal_records(char_id, convicted_at);
  `);
} catch {}

export const EVIDENCE_TO_FILE   = 100;
export const HEAT_TO_TRIGGER    = 50;
export const LAWYER_MAX         = 3;
export const LAWYER_BASE_COST   = 5_000;
export const LAWYER_PER_EV      = 100;       // cost scales with evidence
export const LAWYER_REDUCE_PCT  = 0.20;      // each hire knocks 20% off effective evidence
export const BRIBE_COST         = 50_000;
export const BRIBE_REDUCTION    = 0.30;      // flat -30% conviction chance
export const RECORD_TTL_MS      = 30 * 24 * 60 * 60 * 1000; // 30 days

// Per-tier evidence weight — successful crimes drip a little, failed
// ones drip more (witnesses, fingerprints, etc.).
const TIER_EVIDENCE = {
  street: 2,
  cyber:  3,
  gta:    5,
  major:  10,
};
const FAILURE_MULTIPLIER = 1.6;

const DETECTIVE_NAMES = [
  'Det. Robert Murphy',
  'Insp. Eleanor Vance',
  'Det. Tomas Marquez',
  'Insp. Hua Lin',
  'Det. Anya Petrov',
  'Insp. Caleb O\'Brien',
  'Det. Frank Russo',
  'Insp. Yuki Tanaka',
];
function randomDetectiveName() {
  return DETECTIVE_NAMES[Math.floor(Math.random() * DETECTIVE_NAMES.length)];
}

export function getActiveInvestigation(charId) {
  return db.prepare('SELECT * FROM active_investigations WHERE char_id = ?').get(charId) || null;
}
export function getPendingTrial(charId) {
  return db.prepare('SELECT * FROM pending_trials WHERE char_id = ?').get(charId) || null;
}
function clearInvestigation(charId) {
  db.prepare('DELETE FROM active_investigations WHERE char_id = ?').run(charId);
}
function clearTrial(charId) {
  db.prepare('DELETE FROM pending_trials WHERE char_id = ?').run(charId);
}

// Lazy expiry — convictions older than RECORD_TTL_MS drop off your
// record. Called from recordWeight() on every read so the row count
// stays accurate without a cron.
export function expireOldConvictions(charId, now = Date.now()) {
  const cutoff = now - RECORD_TTL_MS;
  db.prepare('DELETE FROM criminal_records WHERE char_id = ? AND convicted_at < ?').run(charId, cutoff);
}
export function listConvictions(charId) {
  expireOldConvictions(charId);
  return db.prepare(
    'SELECT * FROM criminal_records WHERE char_id = ? ORDER BY convicted_at DESC'
  ).all(charId);
}
// recordWeight: 0–2 = nothing meaningful; 3–4 = tougher cops;
// 5+ = pariah (banks, estate agents shut you out, longer sentences).
export function recordWeight(charId) {
  expireOldConvictions(charId);
  return db.prepare('SELECT COUNT(*) AS n FROM criminal_records WHERE char_id = ?').get(charId).n;
}

// Open an investigation on a player. No-op if one already exists.
export function ensureInvestigation(ch, now = Date.now()) {
  if (getActiveInvestigation(ch.id)) return null;
  const name = randomDetectiveName();
  db.prepare(`
    INSERT INTO active_investigations (char_id, detective_name, evidence, started_at, last_evidence_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(ch.id, name, now, now);
  writeLog(ch.id, 'investigation',
    ` ${name} has opened a case on you. They'll build a file every time you slip up.`,
    { detective: name }, true);
  sendEvent(ch.id, 'investigation.opened', { detective: name });
  return { detective_name: name, evidence: 0 };
}

// Drip evidence after a crime. Successful crimes drip the base value;
// failed ones drip 1.6× (more witnesses, more mistakes). When evidence
// hits EVIDENCE_TO_FILE the case is wrapped, a trial is filed, and
// the investigation slot is closed (the trial slot now holds the
// player's attention until resolved).
export function bumpEvidence(ch, crimeTier, succeeded, opts = {}) {
  const inv = getActiveInvestigation(ch.id);
  if (!inv) return null;
  const base = TIER_EVIDENCE[crimeTier] ?? 1;
  const points = base * (succeeded ? 1 : FAILURE_MULTIPLIER);
  const now = Date.now();
  const newEv = (inv.evidence || 0) + points;
  if (newEv >= EVIDENCE_TO_FILE) {
    // Charges filed. Base sentence scales with the evidence pile;
    // cap at a sensible maximum so a thousand small priors don't
    // mean life in prison.
    const baseJailMin = Math.min(240, 30 + Math.floor(newEv / 4));
    db.prepare(`
      INSERT INTO pending_trials (char_id, base_jail_min, detective_name, effective_evidence, lawyer_count, bribed, filed_at)
      VALUES (?, ?, ?, ?, 0, 0, ?)
    `).run(ch.id, baseJailMin, inv.detective_name, newEv, now);
    clearInvestigation(ch.id);
    writeLog(ch.id, 'investigation',
      ` ${inv.detective_name} filed charges. You're due in court. Resolve it before doing anything else.`,
      { detective: inv.detective_name, evidence: newEv, baseJailMin }, true);
    sendEvent(ch.id, 'trial.filed', { detective: inv.detective_name, baseJailMin });
    return { filed: true, baseJailMin };
  }
  db.prepare('UPDATE active_investigations SET evidence = ?, last_evidence_at = ? WHERE char_id = ?')
    .run(newEv, now, ch.id);
  return { evidence: newEv };
}

// Per-crime hook used by routes/crimes.js — also opens an
// investigation when heat just crossed the threshold.
export function recordCrimeForInvestigation(ch, crimeTier, succeeded, heatNow) {
  if (!getActiveInvestigation(ch.id) && heatNow >= HEAT_TO_TRIGGER) {
    ensureInvestigation(ch);
  }
  return bumpEvidence(ch, crimeTier, succeeded);
}

// Trial actions — each returns { ok, ... } or { error }. They all
// assume the trial exists; routes/trials.js handles the not-found case.
function recomputeEffectiveEvidence(trial) {
  // Each lawyer multiplicatively shaves 20% off effective evidence.
  const lawyerMul = Math.pow(1 - LAWYER_REDUCE_PCT, trial.lawyer_count || 0);
  return Math.max(0, trial.effective_evidence * lawyerMul);
}
export function lawyerCost(trial) {
  return LAWYER_BASE_COST + Math.floor((trial.effective_evidence || 0) * LAWYER_PER_EV / 10);
}

export function pleadGuilty(ch) {
  const trial = getPendingTrial(ch.id);
  if (!trial) return { error: 'No pending trial.' };
  // 60% of base sentence, but conviction lands on your record.
  const jailMin = Math.max(1, Math.floor(trial.base_jail_min * 0.6));
  applyJailSentence(ch, jailMin * 60 * 1000,
    `Pleaded guilty before ${trial.detective_name}'s case. ${jailMin}m inside.`);
  addConviction(ch.id, 'plea', jailMin, trial.detective_name);
  clearTrial(ch.id);
  writeLog(ch.id, 'investigation',
    `Pleaded guilty before ${trial.detective_name}. ${jailMin}m + 1 conviction on the record.`,
    { jail_min: jailMin }, true);
  return { ok: true, jailMin, conviction: true };
}

export function hireLawyer(ch) {
  const trial = getPendingTrial(ch.id);
  if (!trial) return { error: 'No pending trial.' };
  if ((trial.lawyer_count || 0) >= LAWYER_MAX) return { error: 'You already have a full legal team.' };
  const cost = lawyerCost(trial);
  if (ch.cash < cost) return { error: `Need £${cost.toLocaleString()} for the retainer.` };
  ch.cash -= cost;
  const newCount = (trial.lawyer_count || 0) + 1;
  // Multiplicative shave; recomputed live every time. We store both
  // the new count and the freshly-reduced evidence so the UI can
  // show the effect immediately.
  const reducedEvidence = recomputeEffectiveEvidence({ ...trial, lawyer_count: newCount });
  db.prepare('UPDATE pending_trials SET lawyer_count = ?, effective_evidence = ? WHERE char_id = ?')
    .run(newCount, reducedEvidence, ch.id);
  writeLog(ch.id, 'investigation',
    `Hired a lawyer (£${cost.toLocaleString()}) — evidence weight down to ${Math.round(reducedEvidence)}.`,
    { lawyer_count: newCount, cost }, false);
  return { ok: true, cost, newCount, reducedEvidence };
}

export function bribeJudge(ch) {
  const trial = getPendingTrial(ch.id);
  if (!trial) return { error: 'No pending trial.' };
  if (trial.bribed) return { error: 'You already paid off this judge.' };
  if (ch.cash < BRIBE_COST) return { error: `Need £${BRIBE_COST.toLocaleString()}.` };
  ch.cash -= BRIBE_COST;
  db.prepare('UPDATE pending_trials SET bribed = 1 WHERE char_id = ?').run(ch.id);
  writeLog(ch.id, 'investigation',
    `Slipped £${BRIBE_COST.toLocaleString()} to the judge — odds tipped your way.`,
    { cost: BRIBE_COST }, false);
  return { ok: true, cost: BRIBE_COST };
}

export function goToCourt(ch) {
  const trial = getPendingTrial(ch.id);
  if (!trial) return { error: 'No pending trial.' };
  // Conviction chance: scales with effective evidence, dampened by
  // a bribed judge. Clamp so it's never a sure thing either way.
  const effective = trial.effective_evidence || 0;
  let convictionChance = 0.25 + effective * 0.005;
  if (trial.bribed) convictionChance -= BRIBE_REDUCTION;
  convictionChance = Math.max(0.05, Math.min(0.95, convictionChance));

  const roll = Math.random();
  if (roll < convictionChance) {
    // Record weight ramps the sentence up — priors hurt.
    const weight = recordWeight(ch.id);
    const mul = weight >= 5 ? 1.5 : weight >= 3 ? 1.25 : 1;
    const jailMin = Math.max(1, Math.floor(trial.base_jail_min * mul));
    applyJailSentence(ch, jailMin * 60 * 1000,
      `Convicted in ${trial.detective_name}'s case. ${jailMin}m inside.`);
    addConviction(ch.id, 'court', jailMin, trial.detective_name);
    clearTrial(ch.id);
    writeLog(ch.id, 'investigation',
      ` Convicted (${Math.round(convictionChance * 100)}% odds). ${jailMin}m and a new mark on the record.`,
      { jail_min: jailMin, convictionChance }, true);
    return { ok: true, convicted: true, jailMin, convictionChance };
  }
  // Acquitted — trial dropped, no record entry.
  clearTrial(ch.id);
  ch.happiness = Math.min(100, (ch.happiness || 0) + 5);
  writeLog(ch.id, 'investigation',
    ` Acquitted (${Math.round(convictionChance * 100)}% conviction odds). Walked free.`,
    { convictionChance }, true);
  return { ok: true, acquitted: true, convictionChance };
}

// Append a row to the criminal record. Lazy expiry will clean it up
// after RECORD_TTL_MS.
export function addConviction(charId, crimeTier, jailMin, detectiveName) {
  db.prepare(`
    INSERT INTO criminal_records (char_id, crime_tier, jail_min, convicted_at, detective_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(charId, crimeTier, jailMin, Date.now(), detectiveName);
}

// Reputation/heat multipliers driven by record weight — consumed by
// crimes.js / loans / property routes for the cascading-consequence
// gates noted in the design doc.
export function jailMultiplier(charId) {
  const w = recordWeight(charId);
  if (w >= 5) return 1.5;
  if (w >= 3) return 1.25;
  return 1;
}
export function refusesService(charId) {
  return recordWeight(charId) >= 5;
}
