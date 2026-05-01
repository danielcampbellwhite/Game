import { COMBAT_MOVES, ENEMY_MOVE_WEIGHTS, moveById } from '../data.js';
import { effectiveStats } from './buffs.js';

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// Bare-knuckle base. The fight club doesn't care what's in your inventory —
// you check guns and armour at the door. Strength scales damage; speed
// drives crits and dodges. With strength 1 you barely bruise anyone; with
// strength at the cap (35) you can put a kingpin's lieutenant down.
const BARE_HAND_BASE = 5;

// Pick an enemy move from the weighted distribution. The AI doesn't block —
// blocks are a player-only utility for now to keep the AI simple and the
// pace forward-moving.
export function pickEnemyMove() {
  const total = ENEMY_MOVE_WEIGHTS.reduce((acc, [, w]) => acc + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of ENEMY_MOVE_WEIGHTS) {
    r -= w;
    if (r <= 0) return moveById(id);
  }
  return COMBAT_MOVES[0];
}

// Resolve a single attack roll. Returns one of:
//   { kind: 'miss' }     — the attacker whiffed
//   { kind: 'dodge' }    — the defender slipped a clean swing
//   { kind: 'hit', dmg, crit }
// `defenderBlocking` halves a successful hit.
export function rollMoveOutcome({
  move,
  attackerStr,
  attackerSpd,
  defenderDef,
  defenderSpd,
  defenderBlocking,
}) {
  if (move.defensive) return { kind: 'skip' };

  // 1. Intrinsic miss based on the move's accuracy.
  const hitChance = clamp(move.hit, 0.05, 0.99);
  if (Math.random() > hitChance) return { kind: 'miss' };

  // 2. Defender dodge — only if they're faster, capped at 50%. Gives speed
  // a defensive role on top of its offensive crit-boost role.
  const dodgeChance = clamp((defenderSpd - attackerSpd) * 0.01, 0, 0.50);
  if (dodgeChance > 0 && Math.random() < dodgeChance) return { kind: 'dodge' };

  // 3. Crit chance is the move's base plus a speed bonus (faster fighters
  // see openings better). Capped to keep haymakers from auto-critting.
  const critBonus = Math.min(0.25, attackerSpd * 0.004);
  const isCrit = Math.random() < clamp(move.crit + critBonus, 0, 0.95);

  // 4. Damage — bare-knuckle. No weapon/armour input, just stats.
  const variance = 0.85 + Math.random() * 0.30;
  const raw = (BARE_HAND_BASE + attackerStr) * move.dmgMul * variance;
  const mitigation = defenderDef / 2;
  let dmg = Math.max(1, Math.floor(raw - mitigation));
  if (isCrit) dmg *= 2;
  if (defenderBlocking) dmg = Math.max(1, Math.floor(dmg * 0.5));
  return { kind: 'hit', dmg, crit: isCrit };
}

// Run a single round: player's chosen move, then the enemy's auto-rolled
// reply. Mutates `fight` (player_hp / enemy_hp / round / log) in place and
// returns the round entries written so the route can echo them back.
export function runRound(fight, player, enemy, playerMoveId) {
  const playerMove = moveById(playerMoveId);
  if (!playerMove) throw new Error('Unknown move');

  const eff = effectiveStats(player);
  const log = JSON.parse(fight.log_json || '[]');

  const round = fight.round;
  const playerEntry = { round, who: 'player', move: playerMove.id, name: playerMove.name };

  // ── Player turn ────────────────────────────────────────────────────────
  const playerOutcome = rollMoveOutcome({
    move: playerMove,
    attackerStr: eff.strength,
    attackerSpd: eff.speed,
    defenderDef: enemy.def,
    defenderSpd: enemy.spd,
    defenderBlocking: false,
  });

  if (playerOutcome.kind === 'skip') {
    playerEntry.kind = 'block';
    playerEntry.text = `🛡️ You brace for impact.`;
  } else if (playerOutcome.kind === 'miss') {
    playerEntry.kind = 'miss';
    playerEntry.text = `${playerMove.emoji} You threw a ${playerMove.name.toLowerCase()} — missed.`;
  } else if (playerOutcome.kind === 'dodge') {
    playerEntry.kind = 'dodge';
    playerEntry.text = `${enemy.name} slipped your ${playerMove.name.toLowerCase()}.`;
  } else {
    fight.enemy_hp = Math.max(0, fight.enemy_hp - playerOutcome.dmg);
    playerEntry.kind = playerOutcome.crit ? 'crit' : 'hit';
    playerEntry.dmg = playerOutcome.dmg;
    playerEntry.text = playerOutcome.crit
      ? `💥 CRITICAL ${playerMove.name}! ${enemy.name} takes ${playerOutcome.dmg}.`
      : `${playerMove.emoji} Your ${playerMove.name.toLowerCase()} lands for ${playerOutcome.dmg}.`;
  }
  log.push(playerEntry);

  // If the enemy's down, the fight ends before they can reply.
  if (fight.enemy_hp <= 0) {
    fight.log_json = JSON.stringify(log);
    return { roundEntries: [playerEntry], ended: true, playerWon: true };
  }

  // ── Enemy turn ─────────────────────────────────────────────────────────
  const enemyMove = pickEnemyMove();
  const enemyEntry = { round, who: 'enemy', move: enemyMove.id, name: enemyMove.name };
  const enemyOutcome = rollMoveOutcome({
    move: enemyMove,
    attackerStr: enemy.str,
    attackerSpd: enemy.spd,
    defenderDef: eff.defence,
    defenderSpd: eff.speed,
    defenderBlocking: playerMove.defensive,
  });

  if (enemyOutcome.kind === 'miss') {
    enemyEntry.kind = 'miss';
    enemyEntry.text = `${enemy.name} threw a ${enemyMove.name.toLowerCase()} — wide.`;
  } else if (enemyOutcome.kind === 'dodge') {
    enemyEntry.kind = 'dodge';
    enemyEntry.text = `You ducked ${enemy.name}'s ${enemyMove.name.toLowerCase()}.`;
  } else {
    fight.player_hp = Math.max(0, fight.player_hp - enemyOutcome.dmg);
    enemyEntry.kind = enemyOutcome.crit ? 'crit' : 'hit';
    enemyEntry.dmg = enemyOutcome.dmg;
    const blockTag = playerMove.defensive ? ' (blocked)' : '';
    enemyEntry.text = enemyOutcome.crit
      ? `💥 ${enemy.name} lands a CRITICAL ${enemyMove.name.toLowerCase()}${blockTag} for ${enemyOutcome.dmg}.`
      : `${enemyMove.emoji} ${enemy.name}'s ${enemyMove.name.toLowerCase()}${blockTag} hits you for ${enemyOutcome.dmg}.`;
  }
  log.push(enemyEntry);

  fight.round = round + 1;
  fight.log_json = JSON.stringify(log);

  const ended = fight.player_hp <= 0;
  return { roundEntries: [playerEntry, enemyEntry], ended, playerWon: false };
}
