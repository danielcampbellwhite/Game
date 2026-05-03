import { db } from '../db.js';
import { ORGANISED_CRIMES, orgCrimeById } from '../data.js';
import { loadCharacterById, saveCharacter, awardXp } from './character.js';
import { writeLog } from './log.js';
import { sendEvent } from './events.js';
import { bumpMission } from './missions.js';

//  Plan/role helpers 

export function loadPlan(id) {
  return db.prepare('SELECT * FROM oc_plans WHERE id = ?').get(id);
}

export function loadRoles(planId) {
  return db.prepare('SELECT * FROM oc_roles WHERE plan_id = ? ORDER BY id').all(planId);
}

// Plans the character is involved in (as leader or assigned role) and not
// yet completed. Used by the index.
export function activePlansFor(charId) {
  const planIds = new Set();
  const asLeader = db.prepare(
    "SELECT id FROM oc_plans WHERE leader_id = ? AND status IN ('recruiting','ready','executing')"
  ).all(charId);
  for (const p of asLeader) planIds.add(p.id);
  const asMember = db.prepare(`
    SELECT p.id FROM oc_plans p
    JOIN oc_roles r ON r.plan_id = p.id
    WHERE r.assigned_char_id = ? AND p.status IN ('recruiting','ready','executing')
  `).all(charId);
  for (const p of asMember) planIds.add(p.id);
  if (!planIds.size) return [];
  const ids = Array.from(planIds);
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM oc_plans WHERE id IN (${placeholders}) ORDER BY id DESC`).all(...ids);
}

// True if a character is currently committed to any active plan.
export function isInActivePlan(charId) {
  const r = db.prepare(`
    SELECT 1 FROM oc_roles r
    JOIN oc_plans p ON p.id = r.plan_id
    WHERE r.assigned_char_id = ? AND p.status IN ('recruiting','ready','executing')
    LIMIT 1
  `).get(charId);
  return !!r;
}

// Snapshot of the plan — crime def, roles with assigned-player profiles,
// status, and a `ready` flag computed on the fly.
export function publicPlan(plan, viewerId = null, profileResolver = null) {
  if (!plan) return null;
  const crime = orgCrimeById(plan.crime_id);
  const roles = loadRoles(plan.id);
  const enriched = roles.map(r => {
    const def = crime?.roles.find(x => x.id === r.role_id);
    const member = r.assigned_char_id ? loadCharacterById(r.assigned_char_id) : null;
    return {
      role_id: r.role_id,
      name: def?.name || r.role_id,
      stat: def?.stat,
      min: def?.min,
      share: def?.share,
      assigned: member && profileResolver ? profileResolver(member, viewerId) : (member ? { id: member.id, name: member.name, avatar: member.avatar, level: member.level } : null),
      assigned_at: r.assigned_at,
      filled: !!r.assigned_char_id,
    };
  });
  const filled = enriched.filter(r => r.filled).length;
  return {
    id: plan.id,
    crime: crime ? { id: crime.id, name: crime.name, emoji: crime.emoji, desc: crime.desc, payoutMin: crime.payoutMin, payoutMax: crime.payoutMax, risk: crime.risk, levelGate: crime.levelGate, energy: crime.energy } : null,
    leader_id: plan.leader_id,
    status: plan.status,
    created_at: plan.created_at,
    executed_at: plan.executed_at,
    roles: enriched,
    filled, total: enriched.length,
    ready: filled === enriched.length,
  };
}

//  Plan lifecycle 

export function createPlan(leader, crimeId) {
  const crime = orgCrimeById(crimeId);
  if (!crime) return { error: 'Unknown heist.' };
  if (leader.level < crime.levelGate) return { error: `Requires level ${crime.levelGate} to lead this heist.` };
  if (isInActivePlan(leader.id)) return { error: "You're already committed to an active heist." };
  const leaderRole = crime.roles[0];
  if ((leader[leaderRole.stat] || 0) < leaderRole.min) {
    return { error: `Leading this needs ${leaderRole.stat} ≥ ${leaderRole.min}.` };
  }
  const now = Date.now();
  const r = db.prepare(`
    INSERT INTO oc_plans (crime_id, leader_id, status, created_at) VALUES (?, ?, 'recruiting', ?)
  `).run(crime.id, leader.id, now);
  const planId = r.lastInsertRowid;
  // Seed all roles, leader auto-assigned to slot 0.
  const ins = db.prepare(`
    INSERT INTO oc_roles (plan_id, role_id, assigned_char_id, assigned_at) VALUES (?, ?, ?, ?)
  `);
  for (const role of crime.roles) {
    if (role.id === leaderRole.id) ins.run(planId, role.id, leader.id, now);
    else ins.run(planId, role.id, null, null);
  }
  return { ok: true, plan: loadPlan(planId) };
}

export function inviteToRole(plan, roleId, target) {
  if (plan.status !== 'recruiting') return { error: 'Plan is no longer recruiting.' };
  const crime = orgCrimeById(plan.crime_id);
  const def = crime?.roles.find(r => r.id === roleId);
  if (!def) return { error: 'Bad role id.' };
  if (def.id === crime.roles[0].id) return { error: "Leader role can't be reassigned." };
  if (!target) return { error: 'Player not found.' };
  if (target.level < crime.levelGate) return { error: `Player is under the heist level gate (${crime.levelGate}).` };
  if ((target[def.stat] || 0) < def.min) return { error: `Player's ${def.stat} is too low (need ≥ ${def.min}).` };
  if (isInActivePlan(target.id)) return { error: 'Player is already on another heist.' };
  // Sending the invite is just a notification + assignment slot; the player
  // accepts via a separate API call.
  return { ok: true };
}

export function assignRole(plan, roleId, charId) {
  const r = db.prepare(`
    UPDATE oc_roles SET assigned_char_id = ?, assigned_at = ?
    WHERE plan_id = ? AND role_id = ? AND assigned_char_id IS NULL
  `).run(charId, Date.now(), plan.id, roleId);
  if (r.changes !== 1) return { error: 'Role already filled or missing.' };
  // Promote plan to 'ready' if every role is now filled.
  const remaining = db.prepare(
    'SELECT COUNT(*) AS c FROM oc_roles WHERE plan_id = ? AND assigned_char_id IS NULL'
  ).get(plan.id).c;
  if (remaining === 0) {
    db.prepare("UPDATE oc_plans SET status = 'ready' WHERE id = ?").run(plan.id);
  }
  return { ok: true };
}

export function leaveRole(plan, charId) {
  const row = db.prepare(
    'SELECT * FROM oc_roles WHERE plan_id = ? AND assigned_char_id = ?'
  ).get(plan.id, charId);
  if (!row) return { error: 'Not in this plan.' };
  if (charId === plan.leader_id) return { error: 'Leader cannot leave — cancel the plan instead.' };
  db.prepare(
    'UPDATE oc_roles SET assigned_char_id = NULL, assigned_at = NULL WHERE id = ?'
  ).run(row.id);
  // Revert plan to recruiting if it was previously ready.
  db.prepare(`
    UPDATE oc_plans SET status = 'recruiting'
     WHERE id = ? AND status IN ('ready')
  `).run(plan.id);
  return { ok: true, role_id: row.role_id };
}

export function cancelPlan(plan) {
  db.prepare("UPDATE oc_plans SET status = 'cancelled' WHERE id = ?").run(plan.id);
  return { ok: true };
}

//  Execution 
//
// Returns a result object describing everything that happened. Mutates
// every participant's character row (cash, energy, xp, possible jail/
// hospital) and writes log entries / mission bumps / SSE pushes.
const RISK_TABLE = {
  low:     { jail: 0.20, hosp: 0.10, jailMin: 8,   hospMin: 5  },
  med:     { jail: 0.30, hosp: 0.18, jailMin: 18,  hospMin: 12 },
  high:    { jail: 0.45, hosp: 0.25, jailMin: 45,  hospMin: 25 },
  extreme: { jail: 0.60, hosp: 0.25, jailMin: 120, hospMin: 50 },
};

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export function executePlan(plan) {
  if (plan.status !== 'ready') return { error: 'Plan is not ready to execute.' };
  const crime = orgCrimeById(plan.crime_id);
  const roles = loadRoles(plan.id);
  // Re-verify every participant: still alive, free, has energy, still meets
  // stat gate. Any disqualifier aborts cleanly.
  const participants = [];
  for (const r of roles) {
    if (!r.assigned_char_id) return { error: 'Plan has unfilled roles.' };
    const ch = loadCharacterById(r.assigned_char_id);
    if (!ch) return { error: 'A participant has gone missing.' };
    const def = crime.roles.find(x => x.id === r.role_id);
    const now = Date.now();
    if (ch.jail_until && ch.jail_until > now) return { error: `${ch.name} is in jail.` };
    if (ch.hospital_until && ch.hospital_until > now) return { error: `${ch.name} is in hospital.` };
    if (ch.travel_until && ch.travel_until > now) return { error: `${ch.name} is travelling.` };
    if (ch.energy < crime.energy) return { error: `${ch.name} doesn't have ${crime.energy} energy.` };
    if ((ch[def.stat] || 0) < def.min) return { error: `${ch.name}'s ${def.stat} dropped below the gate.` };
    participants.push({ char: ch, role: def });
  }

  //  Roll success 
  // Each participant contributes a competence ratio (their stat / role.min)
  // capped at 1.5. Crew score is the average. We then roll vs a 0.6
  // baseline plus crew score: combined < 1.0 → bust; 1.0–1.4 → partial; 1.4+ → full.
  let comp = 0;
  const log = [];
  for (const p of participants) {
    const ratio = Math.min(1.5, (p.char[p.role.stat] || 0) / p.role.min);
    comp += ratio;
    log.push({ char_id: p.char.id, name: p.char.name, role: p.role.id, stat: p.role.stat, value: p.char[p.role.stat], ratio: +ratio.toFixed(2) });
  }
  const avgComp = comp / participants.length;
  const roll = avgComp * (0.85 + Math.random() * 0.30); // ±15% variance
  let outcome;
  if (roll >= 1.4)      outcome = 'full';
  else if (roll >= 1.0) outcome = 'partial';
  else                  outcome = 'bust';

  //  Apply energy & vitals 
  for (const p of participants) {
    p.char.energy = Math.max(0, p.char.energy - crime.energy);
  }

  let payoutTotal = 0;
  const splits = [];
  if (outcome !== 'bust') {
    const payoutBase = rng(crime.payoutMin, crime.payoutMax);
    payoutTotal = outcome === 'full' ? payoutBase : Math.floor(payoutBase * 0.45);
    for (const p of participants) {
      const cut = Math.floor(payoutTotal * (p.role.share || 0));
      p.char.cash += cut;
      const xp = Math.floor((outcome === 'full' ? 1.0 : 0.5) * (50 + crime.levelGate * 6));
      const lvls = awardXp(p.char, xp);
      p.char.reputation += outcome === 'full' ? 25 + crime.levelGate : 10 + Math.floor(crime.levelGate / 2);
      bumpMission(p.char, 'crime_success', 1, { tier: 'major', crime: crime.id });
      splits.push({ char_id: p.char.id, name: p.char.name, role: p.role.id, cut, xp, levels: lvls });
      writeLog(p.char.id, 'oc', `${crime.emoji} "${crime.name}" ${outcome === 'full' ? 'paid out' : 'partially paid'} — your cut: £${cut.toLocaleString()} +${xp}xp.`, { plan_id: plan.id, outcome, cut, xp }, true);
    }
  } else {
    // Bust: every participant rolls jail/hospital independently.
    const risk = RISK_TABLE[crime.risk] || RISK_TABLE.high;
    for (const p of participants) {
      const c = Math.random();
      if (c < risk.jail) {
        const mins = Math.floor(risk.jailMin * (1 + Math.random() * 0.6));
        p.char.jail_until = Date.now() + mins * 60 * 1000;
        p.char.jail_reason = `Caught running "${crime.name}" with the crew — sentenced to ${mins} minutes.`;
        splits.push({ char_id: p.char.id, name: p.char.name, role: p.role.id, jailed: mins });
        writeLog(p.char.id, 'oc', ` "${crime.name}" went sideways — jailed ${mins}m.`, { plan_id: plan.id }, true);
      } else if (c < risk.jail + risk.hosp) {
        const mins = Math.floor(risk.hospMin * (1 + Math.random() * 0.7));
        p.char.hospital_until = Date.now() + mins * 60 * 1000;
        p.char.health = Math.max(1, Math.floor(p.char.health * 0.3));
        p.char.hospital_reason = `Took a beating during the failed "${crime.name}" — admitted for ${mins} minutes.`;
        splits.push({ char_id: p.char.id, name: p.char.name, role: p.role.id, hospital: mins });
        writeLog(p.char.id, 'oc', ` Botched "${crime.name}" — hospital ${mins}m.`, { plan_id: plan.id }, true);
      } else {
        splits.push({ char_id: p.char.id, name: p.char.name, role: p.role.id, escaped: true });
        writeLog(p.char.id, 'oc', `"${crime.name}" failed — slipped away clean but empty-handed.`, { plan_id: plan.id });
      }
    }
  }

  // Save everyone.
  for (const p of participants) saveCharacter(p.char);

  // Persist plan + result rows.
  const success = outcome !== 'bust';
  db.prepare(`
    UPDATE oc_plans SET status = ?, executed_at = ? WHERE id = ?
  `).run(success ? 'complete' : 'failed', Date.now(), plan.id);
  db.prepare(`
    INSERT INTO oc_results (plan_id, success, payout_total, payout_split_json, log_json, executed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(plan.id, success ? 1 : 0, payoutTotal, JSON.stringify(splits), JSON.stringify(log), Date.now());

  // Push outcome to all participants.
  const result = { outcome, payout_total: payoutTotal, splits, crew: log };
  for (const p of participants) {
    sendEvent(p.char.id, 'oc.executed', { plan_id: plan.id, result });
  }
  return { ok: true, result };
}
