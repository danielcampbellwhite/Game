import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { ENEMIES, enemyById, COMBAT_MOVES } from '../data.js';
import { saveCharacter, awardXp, publicCharacter } from '../services/character.js';
import { runRound } from '../services/combat.js';
import { bumpMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';

const router = Router();

const ENGAGE_ENERGY = 8;
const ENGAGE_MIN_HP = 30;

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function loadFight(charId) {
  return db.prepare('SELECT * FROM active_fight WHERE char_id = ?').get(charId);
}
function deleteFight(charId) {
  db.prepare('DELETE FROM active_fight WHERE char_id = ?').run(charId);
}
function saveFight(fight) {
  db.prepare(`
    UPDATE active_fight
       SET player_hp = ?, enemy_hp = ?, round = ?, log_json = ?
     WHERE char_id = ?
  `).run(fight.player_hp, fight.enemy_hp, fight.round, fight.log_json, fight.char_id);
}

function publicFight(fight, ch) {
  if (!fight) return null;
  const enemy = enemyById(fight.enemy_id);
  return {
    enemy_id: fight.enemy_id,
    enemy_name: enemy?.name || fight.enemy_id,
    enemy_level: enemy?.level,
    player_hp: fight.player_hp,
    enemy_hp: fight.enemy_hp,
    enemy_max_hp: fight.enemy_max_hp,
    player_max_hp: ch.max_health,
    round: fight.round,
    log: JSON.parse(fight.log_json || '[]'),
    started_at: fight.started_at,
  };
}

// ── Targets / catalogue ────────────────────────────────────────────────

router.get('/targets', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  res.json({
    targets: ENEMIES.map(e => ({
      ...e,
      locked: ch.level + 5 < e.level,
      recommended: ch.level >= e.level - 3 && ch.level <= e.level + 5,
    })),
    moves: COMBAT_MOVES,
  });
});

router.get('/state', requireAuth, requireCharacter, (req, res) => {
  const fight = loadFight(req.character.id);
  res.json({ fight: publicFight(fight, req.character), moves: COMBAT_MOVES });
});

// ── Engage / attack / flee ─────────────────────────────────────────────

router.post('/start', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  if (loadFight(ch.id)) return res.status(409).json({ error: 'You are already in a fight.' });

  const enemy = enemyById(req.body?.enemy_id);
  if (!enemy) return res.status(400).json({ error: 'Unknown target' });
  if (ch.level + 5 < enemy.level) return res.status(403).json({ error: 'Too tough — gain levels first' });
  if (ch.energy < ENGAGE_ENERGY) return res.status(400).json({ error: `Need ${ENGAGE_ENERGY} energy to engage` });
  if (ch.health < ENGAGE_MIN_HP) return res.status(400).json({ error: `Too injured to fight (need ${ENGAGE_MIN_HP} HP)` });

  // Fight Club is bare-knuckle: no weapons, no armour, no ammo. You check
  // it all at the door. used_ammo is left at 0 for the schema's sake.
  ch.energy -= ENGAGE_ENERGY;
  saveCharacter(ch);

  const now = Date.now();
  db.prepare(`
    INSERT INTO active_fight
      (char_id, enemy_id, player_hp, enemy_hp, enemy_max_hp, round, log_json, used_ammo, started_at)
    VALUES (?, ?, ?, ?, ?, 1, '[]', 0, ?)
  `).run(ch.id, enemy.id, ch.health, enemy.hp, enemy.hp, now);

  const fight = loadFight(ch.id);
  res.json({
    ok: true,
    fight: publicFight(fight, ch),
    character: publicCharacter(ch),
  });
});

router.post('/attack', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const fight = loadFight(ch.id);
  if (!fight) return res.status(404).json({ error: 'No active fight.' });

  const moveId = req.body?.move_id;
  const move = COMBAT_MOVES.find(m => m.id === moveId);
  if (!move) return res.status(400).json({ error: 'Unknown move' });

  const enemy = enemyById(fight.enemy_id);
  if (!enemy) {
    deleteFight(ch.id);
    return res.status(500).json({ error: 'Enemy data missing — fight cancelled.' });
  }

  const result = runRound(fight, ch, enemy, move.id);
  // Sync player HP from the fight back onto the character row so the
  // dashboard reflects damage taken.
  ch.health = fight.player_hp;

  if (!result.ended) {
    saveFight(fight);
    saveCharacter(ch);
    return res.json({
      ok: true,
      fight: publicFight(fight, ch),
      character: publicCharacter(ch),
      roundEntries: result.roundEntries,
      ended: false,
    });
  }

  // Fight ended — apply outcome and clear the row.
  let summary = { ended: true, playerWon: result.playerWon };
  if (result.playerWon) {
    const payout = rng(enemy.loot[0], enemy.loot[1]);
    const xp = enemy.level * 25;
    ch.cash += payout;
    const levels = awardXp(ch, xp);
    ch.reputation += enemy.level * 5;
    bumpMission(ch, 'combat_win', 1, { enemy: enemy.id });
    writeLog(ch.id, 'combat', `Defeated ${enemy.name} — +£${payout.toLocaleString()} +${xp}xp.`, { enemy: enemy.id });
    summary = { ...summary, payout, xp, levels };
  } else {
    // KO'd — hospitalised, lose 10% cash, full HP set to 1 (existing rules)
    const mins = enemy.level + rng(5, 15);
    ch.hospital_until = Date.now() + mins * 60 * 1000;
    ch.health = 1;
    const lost = Math.floor(ch.cash * 0.1);
    ch.cash -= lost;
    ch.hospital_reason = `Knocked out by ${enemy.name} at the Fight Club — admitted for ${mins} minutes${lost ? `, lost £${lost.toLocaleString()} on the way down` : ''}.`;
    writeLog(ch.id, 'combat', `KO'd by ${enemy.name}. Hospital ${mins} min, lost £${lost.toLocaleString()}.`, { enemy: enemy.id }, true);
    summary = { ...summary, hospital_min: mins, cash_lost: lost };
  }
  deleteFight(ch.id);
  saveCharacter(ch);

  res.json({
    ok: true,
    ended: true,
    fight: null,
    character: publicCharacter(ch),
    roundEntries: result.roundEntries,
    summary,
  });
});

router.post('/flee', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const fight = loadFight(ch.id);
  if (!fight) return res.status(404).json({ error: 'No active fight.' });
  const enemy = enemyById(fight.enemy_id);

  // Persist whatever damage you took before bailing.
  ch.health = fight.player_hp;
  // Small reputation knock — running from a fight isn't free.
  const repLoss = Math.min(ch.reputation, (enemy?.level || 1) * 2);
  ch.reputation -= repLoss;
  deleteFight(ch.id);
  writeLog(ch.id, 'combat', `Bailed out of the fight with ${enemy?.name || 'the opponent'}.${repLoss ? ` Lost ${repLoss} reputation.` : ''}`, { enemy: enemy?.id });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), repLoss });
});

export default router;
