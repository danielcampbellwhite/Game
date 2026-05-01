import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { COMBAT_MOVES } from '../data.js';
import { publicCharacter, loadCharacterById } from '../services/character.js';
import {
  challengeEligibility, fightStartEligibility, murderEligibility,
  loadActiveFightFor, loadFightById,
  loadOpenChallengesFor, startFight, runPvpTurn, saveFight,
  endFight, maybeAutoFlee, publicFight, publicChallenge,
  CHALLENGE_TTL_MS,
} from '../services/pvp.js';
import { sendEvent } from '../services/events.js';

const router = Router();

// GET /api/pvp/state
//
// Returns the caller's active fight (if any) plus pending challenges
// (incoming + outgoing). Lazy-flees expired turns first.
router.get('/state', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  let fight = loadActiveFightFor(ch.id);
  fight = maybeAutoFlee(fight);
  const incoming = loadOpenChallengesFor(ch.id, 'target').map(c => publicChallenge(c, ch.id));
  const outgoing = loadOpenChallengesFor(ch.id, 'attacker').map(c => publicChallenge(c, ch.id));
  res.json({
    fight: publicFight(fight, ch.id),
    incoming,
    outgoing,
    moves: COMBAT_MOVES,
  });
});

router.post('/challenge', requireAuth, requireCharacter, (req, res) => {
  const attacker = req.character;
  const targetId = parseInt(req.body?.target_id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad target id' });
  const target = loadCharacterById(targetId);
  const mode = req.body?.mode === 'murder' ? 'murder' : 'knockout';
  const err = challengeEligibility(attacker, target);
  if (err) return res.status(400).json({ error: err });
  if (mode === 'murder') {
    const merr = murderEligibility(attacker, target);
    if (merr) return res.status(403).json({ error: merr });
  }

  const now = Date.now();
  const r = db.prepare(`
    INSERT INTO pvp_challenges (attacker_id, target_id, status, created_at, expires_at, mode)
    VALUES (?, ?, 'pending', ?, ?, ?)
  `).run(attacker.id, target.id, now, now + CHALLENGE_TTL_MS, mode);
  const challenge = db.prepare('SELECT * FROM pvp_challenges WHERE id = ?').get(r.lastInsertRowid);

  // Push to target — they'll see a challenge prompt.
  sendEvent(target.id, 'pvp.challenged', {
    challenge: publicChallenge(challenge, target.id),
  });
  // Echo to attacker's other tabs.
  sendEvent(attacker.id, 'pvp.challenge.sent', {
    challenge: publicChallenge(challenge, attacker.id),
  });

  res.json({ ok: true, challenge: publicChallenge(challenge, attacker.id) });
});

router.post('/challenges/:id/accept', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  const challenge = db.prepare('SELECT * FROM pvp_challenges WHERE id = ?').get(id);
  if (!challenge || challenge.target_id !== ch.id) return res.status(404).json({ error: 'Challenge not found' });
  if (challenge.status !== 'pending') return res.status(409).json({ error: 'Challenge no longer pending.' });
  if (challenge.expires_at <= Date.now()) {
    db.prepare(`UPDATE pvp_challenges SET status = 'expired' WHERE id = ?`).run(id);
    return res.status(410).json({ error: 'Challenge expired.' });
  }

  const attacker = loadCharacterById(challenge.attacker_id);
  const target = ch;
  // Re-check fight-start eligibility — situational only, no cooldowns.
  const err = fightStartEligibility(attacker, target);
  if (err) {
    db.prepare(`UPDATE pvp_challenges SET status = 'expired' WHERE id = ?`).run(id);
    return res.status(409).json({ error: `Cannot start fight: ${err}` });
  }

  const fight = startFight(challenge, attacker, target);
  // Decline / cancel any other pending challenges involving either side —
  // they're now busy.
  db.prepare(`
    UPDATE pvp_challenges SET status = 'expired'
     WHERE status = 'pending'
       AND id != ?
       AND (attacker_id IN (?, ?) OR target_id IN (?, ?))
  `).run(challenge.id, attacker.id, target.id, attacker.id, target.id);

  sendEvent(attacker.id, 'pvp.fight_started', { fight: publicFight(fight, attacker.id) });
  sendEvent(target.id,   'pvp.fight_started', { fight: publicFight(fight, target.id) });
  res.json({ ok: true, fight: publicFight(fight, ch.id), character: publicCharacter(ch) });
});

router.post('/challenges/:id/decline', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  const challenge = db.prepare('SELECT * FROM pvp_challenges WHERE id = ?').get(id);
  if (!challenge || challenge.target_id !== ch.id) return res.status(404).json({ error: 'Challenge not found' });
  if (challenge.status !== 'pending') return res.status(409).json({ error: 'Challenge no longer pending.' });
  db.prepare(`UPDATE pvp_challenges SET status = 'declined' WHERE id = ?`).run(id);
  sendEvent(challenge.attacker_id, 'pvp.declined', {
    challenge_id: id,
    by: { id: ch.id, name: ch.name },
  });
  res.json({ ok: true });
});

router.post('/attack', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  let fight = loadActiveFightFor(ch.id);
  fight = maybeAutoFlee(fight);
  if (!fight) return res.status(404).json({ error: 'No active fight.' });

  const youAreAttacker = ch.id === fight.attacker_id;
  const isYourTurn = (youAreAttacker && fight.turn === 'attacker') || (!youAreAttacker && fight.turn === 'target');
  if (!isYourTurn) return res.status(409).json({ error: "It's not your turn." });

  const moveId = req.body?.move_id;
  if (!COMBAT_MOVES.find(m => m.id === moveId)) return res.status(400).json({ error: 'Unknown move' });

  const attacker = loadCharacterById(fight.attacker_id);
  const target   = loadCharacterById(fight.target_id);
  const me  = youAreAttacker ? attacker : target;
  const opp = youAreAttacker ? target   : attacker;

  const entry = runPvpTurn(fight, me, opp, moveId);

  // Resolve KO?
  if (fight.attacker_hp <= 0 || fight.target_hp <= 0) {
    const outcome = fight.attacker_hp <= 0 ? 'target_won' : 'attacker_won';
    const summary = endFight(fight, attacker, target, outcome);
    const payload = {
      reason: 'ko',
      summary,
      last_round: entry,
    };
    sendEvent(attacker.id, 'pvp.ended', payload);
    sendEvent(target.id,   'pvp.ended', payload);
    return res.json({
      ok: true,
      ended: true,
      summary,
      last_round: entry,
      character: publicCharacter(ch.id === attacker.id ? attacker : target),
    });
  }

  saveFight(fight);
  // Push live state to both sides — each gets their own perspective.
  sendEvent(attacker.id, 'pvp.turn', { fight: publicFight(fight, attacker.id), last_round: entry });
  sendEvent(target.id,   'pvp.turn', { fight: publicFight(fight, target.id),   last_round: entry });
  res.json({ ok: true, ended: false, fight: publicFight(fight, ch.id), last_round: entry });
});

router.post('/flee', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const fight = loadActiveFightFor(ch.id);
  if (!fight) return res.status(404).json({ error: 'No active fight.' });
  const attacker = loadCharacterById(fight.attacker_id);
  const target   = loadCharacterById(fight.target_id);
  const outcome = ch.id === fight.attacker_id ? 'fled_attacker' : 'fled_target';
  const summary = endFight(fight, attacker, target, outcome);
  const payload = { reason: 'flee', summary };
  sendEvent(attacker.id, 'pvp.ended', payload);
  sendEvent(target.id,   'pvp.ended', payload);
  res.json({ ok: true, summary, character: publicCharacter(ch.id === attacker.id ? attacker : target) });
});

export default router;
