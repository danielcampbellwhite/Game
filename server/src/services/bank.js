// Bank PIN helpers — used by both the physical bank route and the
// online bank-app endpoint so the two stay in lockstep on validation,
// lockouts, and DM notifications.

import { db } from '../db.js';
import { writeLog } from './log.js';
import { sendBankDm } from './bank-npc.js';

// Three wrong tries lock the card for the cooldown. Generous enough
// that an honest forgetter can recover from the phone app without
// being meaningfully griefed by repeat-failed attempts elsewhere.
export const PIN_MAX_ATTEMPTS    = 3;
export const PIN_LOCKOUT_MINUTES = 15;

export function isPinFormat(p) {
  return typeof p === 'string' && /^\d{4}$/.test(p);
}

export function randomPin() {
  let s = '';
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
  return s;
}

// Returns ms until the PIN lockout clears, or 0 if not locked.
export function pinLockoutMsLeft(ch) {
  const t = ch.bank_locked_until || 0;
  return t > Date.now() ? t - Date.now() : 0;
}

// Validates a PIN attempt. On success resets the attempt counter; on
// failure bumps it and applies the lockout when threshold is hit.
// Returns { ok, error, locked_until }.
export function verifyPin(ch, pin) {
  if (pinLockoutMsLeft(ch) > 0) {
    const m = Math.ceil(pinLockoutMsLeft(ch) / 60000);
    return { ok: false, error: `Card is locked. Try again in ~${m} min, or reset your PIN from the phone app.` };
  }
  if (!isPinFormat(pin)) return { ok: false, error: 'PIN must be 4 digits.' };
  if (ch.bank_pin === pin) {
    if (ch.bank_pin_attempts !== 0) {
      db.prepare('UPDATE characters SET bank_pin_attempts = 0 WHERE id = ?').run(ch.id);
      ch.bank_pin_attempts = 0;
    }
    return { ok: true };
  }
  // Wrong PIN.
  const attempts = (ch.bank_pin_attempts || 0) + 1;
  if (attempts >= PIN_MAX_ATTEMPTS) {
    const until = Date.now() + PIN_LOCKOUT_MINUTES * 60 * 1000;
    db.prepare('UPDATE characters SET bank_pin_attempts = 0, bank_locked_until = ? WHERE id = ?').run(until, ch.id);
    ch.bank_pin_attempts = 0;
    ch.bank_locked_until = until;
    return { ok: false, error: `Wrong PIN. Card locked for ${PIN_LOCKOUT_MINUTES} minutes. Reset your PIN from the bank app to recover.`, locked: true };
  }
  db.prepare('UPDATE characters SET bank_pin_attempts = ? WHERE id = ?').run(attempts, ch.id);
  ch.bank_pin_attempts = attempts;
  return { ok: false, error: `Wrong PIN. ${PIN_MAX_ATTEMPTS - attempts} tries left.` };
}

// Open a new account. Idempotent — already-open accounts return the
// existing flag so the caller can show "you've already opened one".
// Returns { pin, opened: bool, alreadyOpen: bool }.
export function openAccount(ch) {
  if (ch.bank_account_opened) {
    return { opened: false, alreadyOpen: true };
  }
  const pin = randomPin();
  db.prepare('UPDATE characters SET bank_account_opened = 1, bank_pin = ? WHERE id = ?').run(pin, ch.id);
  ch.bank_account_opened = 1;
  ch.bank_pin = pin;
  writeLog(ch.id, 'bank', `Opened a current account at First National. PIN issued.`);
  return { opened: true, alreadyOpen: false, pin };
}

// Change a PIN — requires the current one to authenticate the change.
export function changePin(ch, oldPin, newPin) {
  if (!ch.bank_account_opened) return { ok: false, error: 'No bank account. Open one at the bank first.' };
  if (!isPinFormat(newPin)) return { ok: false, error: 'New PIN must be 4 digits.' };
  const v = verifyPin(ch, oldPin);
  if (!v.ok) return v;
  db.prepare('UPDATE characters SET bank_pin = ?, bank_pin_attempts = 0 WHERE id = ?').run(newPin, ch.id);
  ch.bank_pin = newPin;
  ch.bank_pin_attempts = 0;
  writeLog(ch.id, 'bank', 'Changed bank PIN.');
  return { ok: true };
}

// "Forgot PIN" — fires off a DM from the Bank NPC with the current
// PIN. This is intentionally simple (no secret reset link, no email);
// the in-fiction conceit is the bank just texts you a reminder.
export function forgotPin(ch) {
  if (!ch.bank_account_opened) return { ok: false, error: 'No bank account on file. Open one at the bank first.' };
  const pin = ch.bank_pin || '0000';
  sendBankDm(ch.id, `Hi ${ch.name}, this is First National. Your PIN is ${pin}. Reply to this DM never — we won't read it.`);
  // Also clear any lockout so the player can immediately retry.
  if (ch.bank_locked_until) {
    db.prepare('UPDATE characters SET bank_locked_until = NULL, bank_pin_attempts = 0 WHERE id = ?').run(ch.id);
    ch.bank_locked_until = null;
    ch.bank_pin_attempts = 0;
  }
  writeLog(ch.id, 'bank', 'Requested a PIN reminder — bank sent a DM.');
  return { ok: true };
}

// Recent bank-flavoured log lines for the app's transaction history.
export function recentBankLog(charId, limit = 20) {
  return db.prepare(
    "SELECT id, type, message, created_at FROM log WHERE char_id = ? AND type IN ('bank','dealership','property','shop','drugs','delivery') ORDER BY id DESC LIMIT ?"
  ).all(charId, Math.max(1, Math.min(50, limit)));
}

// Bank-to-bank transfer. Source: sender's bank. Sink: recipient's
// bank. PIN authenticates the sender (it's effectively a withdrawal
// in their books). Returns { ok, sentTo: { id, name }, error }.
export function sendMoney(ch, { recipient_id, recipient_name, amount, pin, memo }) {
  const amt = Math.max(1, parseInt(amount, 10) || 0);
  if (!amt) return { ok: false, error: 'Enter an amount.' };
  if (!ch.bank_account_opened) return { ok: false, error: 'Open a bank account first.' };
  // Resolve the recipient by id, else by exact name (case-insensitive).
  let recipient = null;
  if (recipient_id) {
    recipient = db.prepare('SELECT id, name, bank, bank_account_opened FROM characters WHERE id = ?').get(parseInt(recipient_id, 10));
  } else if (recipient_name) {
    recipient = db.prepare('SELECT id, name, bank, bank_account_opened FROM characters WHERE LOWER(name) = LOWER(?)').get(String(recipient_name).trim());
  }
  if (!recipient) return { ok: false, error: 'Recipient not found.' };
  if (recipient.id === ch.id) return { ok: false, error: 'You can\'t transfer to yourself.' };
  if (!recipient.bank_account_opened) return { ok: false, error: `${recipient.name} hasn't opened a bank account.` };
  if (ch.bank < amt) return { ok: false, error: 'Not enough in your bank.' };
  const v = verifyPin(ch, pin);
  if (!v.ok) return { ok: false, error: v.error, locked: !!v.locked };
  // Apply both sides atomically.
  ch.bank -= amt;
  db.prepare('UPDATE characters SET bank = bank + ? WHERE id = ?').run(amt, recipient.id);
  const memoSuffix = memo && memo.trim() ? ` — note: "${String(memo).trim().slice(0, 60)}"` : '';
  writeLog(ch.id, 'bank',
    `Transferred £${amt.toLocaleString()} to ${recipient.name}${memoSuffix}.`,
    { recipient: recipient.id, amount: amt });
  writeLog(recipient.id, 'bank',
    `Received £${amt.toLocaleString()} from ${ch.name}${memoSuffix}.`,
    { sender: ch.id, amount: amt });
  return { ok: true, sentTo: { id: recipient.id, name: recipient.name } };
}
