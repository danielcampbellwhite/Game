import { db } from '../db.js';
import { COMBAT_MOVES, moveById } from '../data.js';
import { effectiveStats } from './buffs.js';
import { rollMoveOutcome } from './combat.js';
import { saveCharacter, awardXp, loadCharacterById, publicProfileFor, isNewCharProtected, NEW_CHAR_PROTECTION_DAYS } from './character.js';
import { writeLog } from './log.js';
import { sendEvent } from './events.js';
import { bumpMission } from './missions.js';
import { loadMembership, activeWarBetween, bumpWarScoreFromAttack, handleLeaderDeath, gangBadgeFor } from './gangs.js';
import { softDeath } from './death.js';

// ── Tunables ───────────────────────────────────────────────────────────
export const CHALLENGE_TTL_MS    = 60_000;     // target has 60s to accept
export const TURN_DEADLINE_MS    = 45_000;     // turn-holder has 45s before auto-flee
export const TARGET_COOLDOWN_MS  = 60 * 60 * 1000;   // 1h between attacks on the same person
export const ATTACKER_COOLDOWN_MS = 5 * 60 * 1000;   // 5m between any attacks
export const KO_HOSPITAL_MIN     = 12;          // base hospital minutes for the loser
export const KO_HOSPITAL_VARIANCE_MIN = 8;      // + 0..N
export const CASH_TRANSFER_PCT   = 0.05;        // 5% of loser's cash → winner
export const ENGAGE_ENERGY        = 8;
export const ENGAGE_MIN_HP        = 30;

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Eligibility ────────────────────────────────────────────────────────
//
// Two flavours: `challengeEligibility` is the strict pre-issue check used
// when an attacker hits the "Attack" button (includes both attacker- and
// target-side cooldowns). `fightStartEligibility` is the looser re-check
// run when the target accepts — by that point the cooldown check would
// trip on the just-created challenge row, so we skip cooldown rules and
// only re-validate the situational guards (state, city, energy, etc).
function situationalEligibility(attacker, target) {
  const now = Date.now();
  if (!target) return 'Player not found.';
  if (attacker.id === target.id) return "You can't challenge yourself.";
  if (attacker.city !== target.city) return 'You must be in the same city to attack.';
  if (isNewCharProtected(target)) return `That player is under new-character protection (first ${NEW_CHAR_PROTECTION_DAYS} days).`;
  if (attacker.jail_until && attacker.jail_until > now) return "You're in jail.";
  if (attacker.hospital_until && attacker.hospital_until > now) return "You're in hospital.";
  if (attacker.travel_until && attacker.travel_until > now) return "You're travelling.";
  if (target.jail_until && target.jail_until > now) return 'Target is in jail.';
  if (target.hospital_until && target.hospital_until > now) return 'Target is in hospital.';
  if (target.travel_until && target.travel_until > now) return 'Target is travelling.';
  if (attacker.energy < ENGAGE_ENERGY) return `Need ${ENGAGE_ENERGY} energy to engage.`;
  if (attacker.health < ENGAGE_MIN_HP) return `Too injured to fight (need ${ENGAGE_MIN_HP} HP).`;
  if (loadActiveFightFor(attacker.id)) return "You're already in a PvP fight.";
  if (loadActiveFightFor(target.id))   return 'Target is already in a PvP fight.';
  if (db.prepare('SELECT 1 FROM active_fight WHERE char_id = ?').get(attacker.id)) {
    return "You're in a Fight Club fight already.";
  }
  if (db.prepare('SELECT 1 FROM active_fight WHERE char_id = ?').get(target.id)) {
    return 'Target is in a Fight Club fight already.';
  }
  return null;
}

export function challengeEligibility(attacker, target) {
  const sit = situationalEligibility(attacker, target);
  if (sit) return sit;
  const now = Date.now();
  // Cooldowns only apply when issuing a fresh challenge.
  const lastVsThisTarget = db.prepare(`
    SELECT created_at FROM pvp_challenges
    WHERE attacker_id = ? AND target_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(attacker.id, target.id);
  if (lastVsThisTarget && now - lastVsThisTarget.created_at < TARGET_COOLDOWN_MS) {
    const mins = Math.ceil((TARGET_COOLDOWN_MS - (now - lastVsThisTarget.created_at)) / 60000);
    return `You attacked them too recently — wait ${mins} more minute${mins === 1 ? '' : 's'}.`;
  }
  const lastAny = db.prepare(`
    SELECT created_at FROM pvp_challenges
    WHERE attacker_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(attacker.id);
  if (lastAny && now - lastAny.created_at < ATTACKER_COOLDOWN_MS) {
    const secs = Math.ceil((ATTACKER_COOLDOWN_MS - (now - lastAny.created_at)) / 1000);
    return `Catch your breath — ${secs}s before you can challenge again.`;
  }
  return null;
}

// Used when target hits Accept — only checks state-of-the-world guards.
// Cooldowns skipped: the challenge row that triggered acceptance would
// otherwise trip the per-target cooldown against itself.
export function fightStartEligibility(attacker, target) {
  return situationalEligibility(attacker, target);
}

// Murder-mode eligibility — additional gates on top of standard
// challenge eligibility. Both players must be in opposing gangs AND
// those two gangs must be in an active war whose contested city matches
// where the players are right now.
export function murderEligibility(attacker, target) {
  const aMem = loadMembership(attacker.id);
  const vMem = loadMembership(target.id);
  if (!aMem || !vMem) return 'Both players must be in gangs.';
  if (aMem.gang_id === vMem.gang_id) return "Can't murder a fellow gang member.";
  const war = activeWarBetween(aMem.gang_id, vMem.gang_id);
  if (!war) return 'Murder is only allowed during an active turf war between your two gangs.';
  if (war.contested_city !== attacker.city) return `Murder must happen in the contested city (${war.contested_city.replace(/_/g,' ')}).`;
  return null;
}

// ── State accessors ────────────────────────────────────────────────────
export function loadActiveFightFor(charId) {
  return db.prepare(
    'SELECT * FROM pvp_fights WHERE attacker_id = ? OR target_id = ?'
  ).get(charId, charId);
}

export function loadFightById(id) {
  return db.prepare('SELECT * FROM pvp_fights WHERE id = ?').get(id);
}

export function loadOpenChallengesFor(charId, role = 'either') {
  const now = Date.now();
  // Auto-expire pending challenges whose deadline has passed.
  db.prepare(`
    UPDATE pvp_challenges SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= ?
  `).run(now);
  if (role === 'attacker') {
    return db.prepare(
      `SELECT * FROM pvp_challenges WHERE attacker_id = ? AND status = 'pending'`
    ).all(charId);
  }
  if (role === 'target') {
    return db.prepare(
      `SELECT * FROM pvp_challenges WHERE target_id = ? AND status = 'pending'`
    ).all(charId);
  }
  return db.prepare(
    `SELECT * FROM pvp_challenges WHERE (attacker_id = ? OR target_id = ?) AND status = 'pending'`
  ).all(charId, charId);
}

// ── Fight lifecycle ────────────────────────────────────────────────────
//
// Convert an accepted challenge into a live pvp_fights row. Returns the
// new fight row.
export function startFight(challenge, attacker, target) {
  const now = Date.now();
  const mode = challenge.mode || 'knockout';
  const r = db.prepare(`
    INSERT INTO pvp_fights
      (attacker_id, target_id,
       attacker_hp, target_hp, attacker_max_hp, target_max_hp,
       turn, round, log_json, turn_deadline, city, created_at, mode)
    VALUES (?, ?, ?, ?, ?, ?, 'attacker', 1, '[]', ?, ?, ?, ?)
  `).run(
    attacker.id, target.id,
    attacker.health, target.health,
    attacker.max_health, target.max_health,
    now + TURN_DEADLINE_MS, attacker.city, now, mode
  );
  // Energy comes off both sides on engage — same as solo Fight Club.
  attacker.energy = Math.max(0, attacker.energy - ENGAGE_ENERGY);
  target.energy   = Math.max(0, target.energy   - ENGAGE_ENERGY);
  saveCharacter(attacker);
  saveCharacter(target);
  // The challenge row is consumed.
  db.prepare(`UPDATE pvp_challenges SET status = 'accepted' WHERE id = ?`).run(challenge.id);
  return loadFightById(r.lastInsertRowid);
}

// Run one round of the PvP fight using the side-keyed move. Mutates
// `fight` in place and returns the round entries that were appended.
//
// Symmetric with solo combat's runRound but resolves only the *active*
// player's move; the opposing side gets their turn on the next call.
export function runPvpTurn(fight, actingPlayer, opponent, moveId) {
  const move = moveById(moveId);
  if (!move) throw new Error('Unknown move');

  const eff = effectiveStats(actingPlayer);
  const oppEff = effectiveStats(opponent);
  const log = JSON.parse(fight.log_json || '[]');
  const round = fight.round;
  const actorRole = fight.attacker_id === actingPlayer.id ? 'attacker' : 'target';
  const oppRole = actorRole === 'attacker' ? 'target' : 'attacker';

  const entry = { round, who: actorRole, move: move.id, name: move.name };

  const outcome = rollMoveOutcome({
    move,
    attackerStr: eff.strength,
    attackerSpd: eff.speed,
    defenderDef: opponent.defence + (oppEff.defence - opponent.defence), // effective
    defenderSpd: oppEff.speed,
    defenderBlocking: false,
  });

  if (outcome.kind === 'skip') {
    // Block: skip your attack; the *next* incoming attack on you is halved.
    // We surface this via fight.turn flipping and a marker entry.
    entry.kind = 'block';
    entry.text = `🛡️ ${actingPlayer.name} braces for impact.`;
    fight._block_pending = actorRole; // ephemeral hint for next runPvpTurn
  } else if (outcome.kind === 'miss') {
    entry.kind = 'miss';
    entry.text = `${move.emoji} ${actingPlayer.name} threw a ${move.name.toLowerCase()} — missed.`;
  } else if (outcome.kind === 'dodge') {
    entry.kind = 'dodge';
    entry.text = `${opponent.name} slipped ${actingPlayer.name}'s ${move.name.toLowerCase()}.`;
  } else {
    // hit. Apply damage to the opposing HP column.
    let dmg = outcome.dmg;
    // Honour a defender Block from their previous turn (one-shot mitigation).
    const log2 = JSON.parse(fight.log_json || '[]');
    const lastOppBlock = [...log2].reverse().find(e => e.who === oppRole);
    if (lastOppBlock?.kind === 'block') {
      dmg = Math.max(1, Math.floor(dmg * 0.5));
      entry.blocked = true;
    }
    if (oppRole === 'attacker') fight.attacker_hp = Math.max(0, fight.attacker_hp - dmg);
    else                        fight.target_hp   = Math.max(0, fight.target_hp   - dmg);
    entry.kind = outcome.crit ? 'crit' : 'hit';
    entry.dmg = dmg;
    const blockTag = entry.blocked ? ' (blocked)' : '';
    entry.text = outcome.crit
      ? `💥 CRITICAL ${move.name}! ${opponent.name} takes ${dmg}${blockTag}.`
      : `${move.emoji} ${actingPlayer.name}'s ${move.name.toLowerCase()} lands for ${dmg}${blockTag}.`;
  }

  log.push(entry);
  fight.log_json = JSON.stringify(log);

  // Flip turn + advance round when target side's just acted (one round = one
  // strike per side, attacker first).
  if (actorRole === 'attacker') {
    fight.turn = 'target';
  } else {
    fight.turn = 'attacker';
    fight.round = round + 1;
  }
  fight.turn_deadline = Date.now() + TURN_DEADLINE_MS;

  return entry;
}

export function saveFight(fight) {
  db.prepare(`
    UPDATE pvp_fights
       SET attacker_hp = ?, target_hp = ?, turn = ?, round = ?,
           log_json = ?, turn_deadline = ?
     WHERE id = ?
  `).run(
    fight.attacker_hp, fight.target_hp,
    fight.turn, fight.round, fight.log_json,
    fight.turn_deadline, fight.id
  );
}

export function endFight(fight, attacker, target, outcome) {
  // Outcomes: 'attacker_won' | 'target_won' | 'fled_attacker' | 'fled_target'
  const winnerRole = outcome === 'attacker_won' ? 'attacker'
                  : outcome === 'target_won'   ? 'target'
                  : null;
  let summary = { outcome, mode: fight.mode || 'knockout' };

  if (winnerRole) {
    const winner = winnerRole === 'attacker' ? attacker : target;
    const loser  = winnerRole === 'attacker' ? target   : attacker;

    if (fight.mode === 'murder') {
      // ── Permadeath branch ─────────────────────────────────────────
      // Loser's cash on hand → winner. Bank balance is destroyed with
      // the character. Character row is deleted (cascades clean up
      // gang_members, dm_threads, etc).
      const cashTake = loser.cash || 0;
      if (cashTake > 0) {
        winner.cash += cashTake;
      }
      // Reputation kicker bigger than KO; XP scales similarly.
      const xp = 100 + (loser.level || 1) * 8;
      const lvls = awardXp(winner, xp);
      winner.reputation += 25 + (loser.level || 1) * 3;
      bumpMission(winner, 'combat_win', 1, { enemy: `pvp_${loser.id}` });
      // War scoreboard bump (kind=murder = 5pts).
      bumpWarScoreFromAttack(winner, loser, fight.city, 'murder');

      writeLog(winner.id, 'pvp', `☠️ You murdered ${loser.name} — took £${cashTake.toLocaleString()}, +${xp}xp.`, { opponent: loser.id, payout: cashTake, xp, mode: 'murder' }, true);
      writeLog(loser.id,  'pvp', `☠️ Murdered by ${winner.name} — lost everything, reset to level 10.`, { opponent: winner.id, mode: 'murder' }, true);

      // Sync winner HP from fight, then save.
      if (winnerRole === 'attacker') attacker.health = fight.attacker_hp;
      else                            target.health   = fight.target_hp;
      saveCharacter(winner);

      // Soft-death: keep the row + estate (bank, businesses, properties,
      // vehicles, stocks, level, stats, loans). Wipe inventory, equipped
      // gear, gang membership, transient state. The player will be
      // routed to the heir-creation flow on next login.
      db.prepare('DELETE FROM pvp_fights WHERE id = ?').run(fight.id);
      const { succession } = softDeath(loser, winner.name);

      summary = {
        ...summary,
        winner_id: winner.id,
        loser_id: loser.id,
        loser_name: loser.name,
        cash_taken: cashTake,
        xp,
        levels: lvls,
        succession,
      };
      return summary;
    }

    // ── Standard knockout branch ────────────────────────────────────
    const cashTake = Math.floor((loser.cash || 0) * CASH_TRANSFER_PCT);
    if (cashTake > 0) {
      loser.cash -= cashTake;
      winner.cash += cashTake;
    }
    const hospMin = KO_HOSPITAL_MIN + rng(0, KO_HOSPITAL_VARIANCE_MIN);
    loser.hospital_until = Date.now() + hospMin * 60 * 1000;
    loser.health = 1;
    loser.hospital_reason = `Knocked out by ${winner.name} in a back-alley brawl — admitted for ${hospMin} minutes${cashTake ? `, lost £${cashTake.toLocaleString()} on the way down` : ''}.`;
    const xp = 30 + (loser.level || 1) * 5;
    const lvls = awardXp(winner, xp);
    winner.reputation += 10 + (loser.level || 1) * 2;
    bumpMission(winner, 'combat_win', 1, { enemy: `pvp_${loser.id}` });
    // War scoreboard: only counts when both sides are in the warring gangs
    // and the fight took place in the contested city.
    bumpWarScoreFromAttack(winner, loser, fight.city, 'ko');

    writeLog(winner.id, 'pvp', `🥊 You knocked ${loser.name} out — +£${cashTake.toLocaleString()}, +${xp}xp.`, { opponent: loser.id, payout: cashTake, xp }, true);
    writeLog(loser.id,  'pvp', `🥊 ${winner.name} knocked you out${cashTake ? `, took £${cashTake.toLocaleString()}` : ''}. Hospital ${hospMin}m.`, { opponent: winner.id, lost: cashTake, hosp_min: hospMin }, true);

    if (winnerRole === 'attacker') attacker.health = fight.attacker_hp;
    else                            target.health   = fight.target_hp;
    summary = { ...summary, winner_id: winner.id, loser_id: loser.id, cash_taken: cashTake, hosp_min: hospMin, xp, levels: lvls };
  } else {
    // Flee — sync HP from fight, no penalties beyond what damage was taken.
    attacker.health = fight.attacker_hp;
    target.health   = fight.target_hp;
    const fleer = outcome === 'fled_attacker' ? attacker : target;
    const stayer = outcome === 'fled_attacker' ? target  : attacker;
    writeLog(fleer.id,  'pvp', `🏃 You bailed out of the fight with ${stayer.name}.`, { opponent: stayer.id });
    writeLog(stayer.id, 'pvp', `${fleer.name} bailed out of your fight.`, { opponent: fleer.id });
    summary = { ...summary, fleer_id: fleer.id };
  }

  saveCharacter(attacker);
  saveCharacter(target);
  db.prepare('DELETE FROM pvp_fights WHERE id = ?').run(fight.id);
  return summary;
}

// ── Lazy turn-deadline enforcement ─────────────────────────────────────
//
// Anywhere we read fight state, first check whether the active turn-holder
// has missed their deadline. If so, they auto-flee. Returns the (possibly
// new, possibly null) fight for the requesting character.
export function maybeAutoFlee(fight) {
  if (!fight) return null;
  const now = Date.now();
  if (now < fight.turn_deadline) return fight;
  const fleer = fight.turn === 'attacker'
    ? loadCharacterById(fight.attacker_id)
    : loadCharacterById(fight.target_id);
  const stayer = fight.turn === 'attacker'
    ? loadCharacterById(fight.target_id)
    : loadCharacterById(fight.attacker_id);
  const outcome = fight.turn === 'attacker' ? 'fled_attacker' : 'fled_target';
  const summary = endFight(fight, fight.turn === 'attacker' ? fleer : stayer,
                                  fight.turn === 'attacker' ? stayer : fleer,
                                  outcome);
  // Push the timeout result to both
  sendEvent(fleer.id,  'pvp.ended', { reason: 'turn_timeout', summary });
  sendEvent(stayer.id, 'pvp.ended', { reason: 'turn_timeout', summary });
  return null;
}

// ── Public payloads ────────────────────────────────────────────────────
export function publicFight(fight, viewerId) {
  if (!fight) return null;
  const att = loadCharacterById(fight.attacker_id);
  const tgt = loadCharacterById(fight.target_id);
  const youAreAttacker = viewerId === fight.attacker_id;
  return {
    id: fight.id,
    mode: fight.mode || 'knockout',
    you_role: youAreAttacker ? 'attacker' : 'target',
    your_turn: (youAreAttacker && fight.turn === 'attacker') || (!youAreAttacker && fight.turn === 'target'),
    turn: fight.turn,
    round: fight.round,
    turn_deadline: fight.turn_deadline,
    you: {
      id: youAreAttacker ? att.id : tgt.id,
      name: youAreAttacker ? att.name : tgt.name,
      avatar: youAreAttacker ? att.avatar : tgt.avatar,
      hp: youAreAttacker ? fight.attacker_hp : fight.target_hp,
      max_hp: youAreAttacker ? fight.attacker_max_hp : fight.target_max_hp,
    },
    opponent: youAreAttacker
      ? publicProfileFor(tgt, viewerId, gangBadgeFor)
      : publicProfileFor(att, viewerId, gangBadgeFor),
    opponent_hp: youAreAttacker ? fight.target_hp : fight.attacker_hp,
    opponent_max_hp: youAreAttacker ? fight.target_max_hp : fight.attacker_max_hp,
    log: JSON.parse(fight.log_json || '[]'),
    moves: COMBAT_MOVES,
  };
}

export function publicChallenge(ch, viewerId) {
  if (!ch) return null;
  const isAttacker = viewerId === ch.attacker_id;
  const otherId = isAttacker ? ch.target_id : ch.attacker_id;
  const other = loadCharacterById(otherId);
  return {
    id: ch.id,
    mode: ch.mode || 'knockout',
    you_role: isAttacker ? 'attacker' : 'target',
    other: other ? publicProfileFor(other, viewerId, gangBadgeFor) : null,
    expires_at: ch.expires_at,
    status: ch.status,
  };
}
