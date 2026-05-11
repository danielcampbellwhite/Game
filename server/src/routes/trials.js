import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import {
  getPendingTrial,
  pleadGuilty,
  hireLawyer,
  bribeJudge,
  goToCourt,
  lawyerCost,
  LAWYER_MAX,
  LAWYER_REDUCE_PCT,
  BRIBE_COST,
  BRIBE_REDUCTION,
} from '../services/investigations.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const trial = getPendingTrial(req.character.id);
  if (!trial) return res.json({ trial: null });
  // Live conviction-chance preview so the player knows where they
  // stand before they pick an action.
  let convictionChance = 0.25 + (trial.effective_evidence || 0) * 0.005;
  if (trial.bribed) convictionChance -= BRIBE_REDUCTION;
  convictionChance = Math.max(0.05, Math.min(0.95, convictionChance));
  res.json({
    trial: {
      detective: trial.detective_name,
      baseJailMin: trial.base_jail_min,
      lawyerCount: trial.lawyer_count || 0,
      lawyerCost: lawyerCost(trial),
      lawyerMax: LAWYER_MAX,
      lawyerReducePct: LAWYER_REDUCE_PCT,
      bribed: !!trial.bribed,
      bribeCost: BRIBE_COST,
      bribeReduction: BRIBE_REDUCTION,
      effectiveEvidence: trial.effective_evidence,
      convictionChance,
      filedAt: trial.filed_at,
    },
  });
});

function respond(ch, res, result) {
  if (result.error) return res.status(400).json({ error: result.error });
  saveCharacter(ch);
  res.json({ ...result, character: publicCharacter(ch) });
}

router.post('/plead-guilty', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  respond(ch, res, pleadGuilty(ch));
});

router.post('/hire-lawyer', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  respond(ch, res, hireLawyer(ch));
});

router.post('/bribe', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  respond(ch, res, bribeJudge(ch));
});

router.post('/go-to-court', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  respond(ch, res, goToCourt(ch));
});

export default router;
