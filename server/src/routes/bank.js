import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter, computeNetWorth } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

// Credit tiers — like a credit score, this affects both how much you can
// borrow and the interest rate you pay. Built from level + reputation.
const CREDIT_TIERS = [
  { name: 'Elite',     minLevel: 50, minRep: 5000, rate: 0.06 },
  { name: 'Excellent', minLevel: 30, minRep: 2000, rate: 0.07 },
  { name: 'Good',      minLevel: 18, minRep: 500,  rate: 0.08 },
  { name: 'Fair',      minLevel: 8,  minRep: 0,    rate: 0.10 },
  { name: 'Building',  minLevel: 0,  minRep: 0,    rate: 0.13 },
];

function creditTier(ch) {
  for (const tier of CREDIT_TIERS) {
    if (ch.level >= tier.minLevel && ch.reputation >= tier.minRep) return tier;
  }
  return CREDIT_TIERS[CREDIT_TIERS.length - 1];
}

// Borrowing capacity = level × £8k + reputation × £2 + 5% of net worth,
// minus anything you already owe. Net worth excludes dirty cash by design
// — the bank can't see (or trust) money that isn't on the books.
function maxBorrow(ch, networth, totalOwed) {
  const fromLevel = ch.level * 8000;
  const fromRep   = ch.reputation * 2;
  const fromNw    = Math.floor(networth * 0.05);
  return {
    fromLevel, fromRep, fromNw, totalOwed,
    max: Math.max(0, fromLevel + fromRep + fromNw - totalOwed),
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const loans = db.prepare('SELECT * FROM loans WHERE char_id = ?').all(ch.id);
  const totalOwed = loans.reduce((a, l) => a + l.principal, 0);
  const networth = computeNetWorth(ch);
  const tier = creditTier(ch);
  const borrow = maxBorrow(ch, networth, totalOwed);
  res.json({
    cash: ch.cash,
    bank: ch.bank,
    loans,
    maxLoan: borrow.max,
    breakdown: borrow,
    credit: { tier: tier.name, rate: tier.rate },
    networth,
    interestRateHourly: 0.0002,
  });
});

router.post('/deposit', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const amount = Math.max(1, parseInt(req.body?.amount || 0, 10));
  if (ch.cash < amount) return res.status(400).json({ error: 'Not enough cash' });
  ch.cash -= amount; ch.bank += amount;
  writeLog(ch.id, 'bank', `Deposited £${amount}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/withdraw', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const amount = Math.max(1, parseInt(req.body?.amount || 0, 10));
  if (ch.bank < amount) return res.status(400).json({ error: 'Not enough in bank' });
  ch.bank -= amount; ch.cash += amount;
  writeLog(ch.id, 'bank', `Withdrew £${amount}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/loan', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const amount = Math.max(1000, parseInt(req.body?.amount || 0, 10));
  const loans = db.prepare('SELECT * FROM loans WHERE char_id = ?').all(ch.id);
  // Single-open-loan rule. Without this you could stack loans against
  // an inflated net-worth surface (live stock prices, vehicle book
  // values) and then cash out into illiquid assets — the auto-default
  // only seizes cash and bank, so the rest of your portfolio stayed
  // safe. Repay the open loan before taking another.
  if (loans.length > 0) {
    return res.status(409).json({ error: 'You already have an open loan. Repay it before taking another.' });
  }
  const totalOwed = loans.reduce((a, l) => a + l.principal, 0);
  const networth = computeNetWorth(ch);
  const borrow = maxBorrow(ch, networth, totalOwed);
  if (amount > borrow.max) return res.status(400).json({ error: `Max loan is £${borrow.max.toLocaleString()}` });
  const tier = creditTier(ch);
  const rate = tier.rate;
  const dueAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const principal = Math.floor(amount * (1 + rate));
  db.prepare('INSERT INTO loans (char_id, principal, rate, due_at, taken_at) VALUES (?, ?, ?, ?, ?)')
    .run(ch.id, principal, rate, dueAt, Date.now());
  ch.cash += amount;
  writeLog(ch.id, 'bank', `Took £${amount.toLocaleString()} loan @ ${(rate * 100).toFixed(0)}% (${tier.name} credit) — owe £${principal.toLocaleString()} in 7 days.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), owed: principal, rate, tier: tier.name });
});

router.post('/repay', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = req.body?.id;
  const loan = db.prepare('SELECT * FROM loans WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (ch.cash < loan.principal) return res.status(400).json({ error: 'Not enough cash to repay' });
  ch.cash -= loan.principal;
  db.prepare('DELETE FROM loans WHERE id = ?').run(loan.id);
  writeLog(ch.id, 'bank', `Repaid £${loan.principal} loan.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
