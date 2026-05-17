import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const TIER_COLOR = {
  Elite:     'text-gold-400',
  Excellent: 'text-money-400',
  Good:      'text-emerald-300',
  Fair:      'text-yellow-300',
  Building:  'text-blood-400',
};

export default function Bank() {
  const { refresh } = useGame();
  const [info, setInfo] = useState(null);
  const [dep, setDep] = useState('');
  const [loan, setLoan] = useState('');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  // PIN-issued screen — shown once after open-account so the player
  // can write the number down.
  const [issuedPin, setIssuedPin] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setInfo(await api.get('/bank')); }
  useEffect(() => { load(); }, []);

  async function open() {
    setBusy('open'); setMsg(null);
    try {
      const r = await api.post('/bank/open-account', {});
      if (r.pin) setIssuedPin(r.pin);
      setMsg('Welcome to First National.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function deposit() {
    if (!dep) return;
    setBusy('d'); setMsg(null);
    try {
      await api.post('/bank/deposit', { amount: +dep });
      setMsg(`Deposited ${fmt(+dep)}.`);
      setDep('');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function takeLoan() {
    if (!loan) return;
    setBusy('l'); setMsg(null);
    try {
      await api.post('/bank/loan', { amount: +loan });
      setMsg('Loan taken.');
      setLoan('');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function repay(id) {
    setBusy(`r${id}`); setMsg(null);
    try {
      await api.post('/bank/repay', { id });
      setMsg('Loan repaid.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!info) return null;

  // Pre-account state: walk the player through opening one before any
  // counter / ATM / loan flows are usable.
  if (!info.account_opened && !issuedPin) {
    return (
      <Card title="First National — Open an account"
        subtitle="A short walk-in and you're set up. You'll get a 4-digit PIN to withdraw cash; deposits don't need one.">
        {msg && <p className="text-xs text-money-400 mb-3">{msg}</p>}
        <button
          disabled={busy === 'open'}
          onClick={open}
          className="btn btn-primary text-sm">
          {busy === 'open' ? '…' : 'Open my account'}
        </button>
      </Card>
    );
  }

  // PIN reveal modal — shown only once. Player has to confirm "got it".
  if (issuedPin) {
    return (
      <Card title="Your new PIN">
        <p className="text-xs text-ink-100/65 mb-3">
          The cashier slides a card across the counter and points to four pencilled digits.
          Write this down — you'll need it to withdraw cash anywhere.
        </p>
        <div className="text-center font-display text-4xl tracking-[0.4em] text-money-300 my-4">{issuedPin}</div>
        <p className="text-[12px] text-ink-100/55 mb-3">
          You can change it any time at the counter or on the bank app. Forgot it?
          The bank will DM you a reminder.
        </p>
        <button
          onClick={() => { setIssuedPin(null); load(); }}
          className="btn btn-primary text-sm">
          I've got it
        </button>
      </Card>
    );
  }

  const tier = info.credit?.tier || 'Building';
  const rate = info.credit?.rate ?? 0.13;

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title="First National"
        subtitle={`Hourly interest on deposits: ${(info.interestRateHourly * 100).toFixed(3)}%.`}>
        <div className="grid sm:grid-cols-3 gap-2">
          <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Balance</div>
            <div className="font-display text-2xl text-money-300 tabular-nums">{fmt(info.bank)}</div>
          </div>
          <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Pocket cash</div>
            <div className="font-display text-2xl text-ink-100 tabular-nums">{fmt(info.cash)}</div>
          </div>
          <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-ink-100/55">PIN</div>
            <div className="font-display text-lg text-ink-100">• • • •</div>
            <div className="text-[11px] text-ink-100/45">change via app or change-pin form</div>
          </div>
        </div>
      </Card>

      <Card title="Deposit cash"
        subtitle="Just slide the bills across — no PIN required for deposits.">
        <div className="flex gap-2">
          <input type="number" min="1" value={dep} onChange={e => setDep(e.target.value)}
            placeholder={`up to ${fmt(info.cash)} cash`} className="flex-1 min-w-0" />
          <button disabled={!dep || busy === 'd'} className="btn btn-money shrink-0" onClick={deposit}>
            {busy === 'd' ? '…' : 'Deposit'}
          </button>
        </div>
      </Card>

      <AtmCard info={info} onChange={async () => { await refresh(); await load(); }} />

      <ChangePinCard onChange={async () => { await refresh(); await load(); }} />

      <Card title="Credit Profile" subtitle="Like a real-world credit score: built from your level, reputation, and net worth.">
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[12px] uppercase text-ink-100/50">Rating</div>
            <div className={`font-display text-2xl ${TIER_COLOR[tier]}`}>{tier}</div>
          </div>
          <div>
            <div className="text-[12px] uppercase text-ink-100/50">Loan rate</div>
            <div className="font-display text-2xl">{(rate * 100).toFixed(0)}%</div>
            <div className="text-[12px] text-ink-100/45">flat, 7-day term</div>
          </div>
          <div>
            <div className="text-[12px] uppercase text-ink-100/50">Borrow capacity</div>
            <div className="font-display text-2xl text-money-400">{fmt(info.maxLoan)}</div>
          </div>
        </div>
      </Card>

      <Card title="Take a loan" subtitle={`Up to ${fmt(info.maxLoan)} at ${(rate * 100).toFixed(0)}% — repay within 7 days.`}>
        <div className="flex gap-2 mb-3">
          <input type="number" min="1000" value={loan} onChange={e => setLoan(e.target.value)} placeholder="Borrow amount" className="flex-1" />
          <button disabled={!loan || busy === 'l'} className="btn btn-primary" onClick={takeLoan}>
            {busy === 'l' ? '…' : 'Take loan'}
          </button>
        </div>
        {info.loans.length ? (
          <ul className="space-y-2">
            {info.loans.map(l => (
              <li key={l.id} className="flex items-center justify-between rounded-md bg-ink-950/40 border border-ink-100/10 p-2 text-xs">
                <span>Owe {fmt(l.principal)} — due {new Date(l.due_at).toLocaleString()}</span>
                <button disabled={busy === `r${l.id}`} className="btn btn-money text-xs" onClick={() => repay(l.id)}>
                  {busy === `r${l.id}` ? '…' : 'Repay'}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-100/50">No active loans.</p>}
      </Card>
    </div>
  );
}

// ─── ATM mini-game ────────────────────────────────────────────
// A keypad with a fresh random digit layout each session — taps the
// PIN one digit at a time. Mirrors the small "look down, find the
// number" tension of using a real cash machine.
function AtmCard({ info, onChange }) {
  const [amount, setAmount]  = useState('');
  const [pin, setPin]        = useState('');
  const [busy, setBusy]      = useState(false);
  const [msg, setMsg]        = useState(null);
  const [layoutSeed, setLayoutSeed] = useState(() => Math.random());

  // Shuffle the keypad each render-cycle the player isn't typing —
  // gives the mini-game its "ATM" feel. Stable while they're keying
  // a PIN in so the buttons don't move under their thumb.
  const keys = React.useMemo(() => {
    const digits = ['1','2','3','4','5','6','7','8','9','0'];
    // Fisher-Yates with the seed (deterministic per layoutSeed).
    let s = Math.floor(layoutSeed * 1e9) >>> 0;
    function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits;
  }, [layoutSeed]);

  function pressDigit(d) {
    if (pin.length >= 4) return;
    setPin(p => p + d);
  }
  function clear() { setPin(''); }
  function reshuffle() { setPin(''); setLayoutSeed(Math.random()); }

  async function withdraw() {
    if (busy) return;
    const amt = parseInt(amount, 10);
    if (!amt || amt < 1) { setMsg('Enter an amount.'); return; }
    if (pin.length !== 4) { setMsg('Enter your 4-digit PIN.'); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post('/bank/atm/withdraw', { amount: amt, pin });
      setMsg(`Dispensed ${fmt(amt)}.`);
      setPin(''); setAmount(''); reshuffle();
      await onChange?.();
    } catch (e) { setMsg(e.message); setPin(''); reshuffle(); }
    finally { setBusy(false); }
  }

  const lockedMs = info.pin_lockout_ms_left || 0;
  const locked = lockedMs > 0;

  return (
    <Card title="ATM"
      subtitle={locked
        ? 'Card temporarily locked. Reset your PIN from the bank app to unlock.'
        : 'Enter your PIN to withdraw. PIN keypad reshuffles each session.'}>
      {msg && <p className="text-xs text-money-400 mb-2">{msg}</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Amount + PIN display */}
        <div className="space-y-2">
          <label className="text-[11px] uppercase tracking-wide text-ink-100/55">Amount</label>
          <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder={`up to ${fmt(info.bank)}`}
            disabled={locked}
            className="w-full" />
          <div className="text-[11px] uppercase tracking-wide text-ink-100/55 mt-2">PIN</div>
          <div className="font-display text-2xl tracking-[0.5em] text-money-300 text-center border border-ink-100/10 rounded-md py-2 bg-ink-950/40">
            {pin.padEnd(4, '·').split('').map((c, i) => (
              <span key={i}>{i < pin.length ? '•' : '·'}</span>
            ))}
          </div>
          <div className="flex gap-1 text-[11px]">
            <button onClick={clear} disabled={locked || busy} className="btn btn-ghost text-[11px] flex-1">Clear</button>
            <button onClick={reshuffle} disabled={locked || busy} className="btn btn-ghost text-[11px] flex-1">Shuffle</button>
          </div>
          <button onClick={withdraw} disabled={locked || busy || pin.length !== 4 || !amount}
            className="btn btn-primary w-full text-xs mt-1">
            {busy ? '…' : 'Withdraw'}
          </button>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {keys.slice(0, 9).map(d => (
            <button key={d} onClick={() => pressDigit(d)} disabled={locked || busy || pin.length >= 4}
              className="aspect-square rounded-lg bg-ink-900/70 hover:bg-ink-800 border border-ink-100/15 font-display text-2xl text-ink-50 tabular-nums">
              {d}
            </button>
          ))}
          <div />
          <button onClick={() => pressDigit(keys[9])} disabled={locked || busy || pin.length >= 4}
            className="aspect-square rounded-lg bg-ink-900/70 hover:bg-ink-800 border border-ink-100/15 font-display text-2xl text-ink-50 tabular-nums">
            {keys[9]}
          </button>
          <div />
        </div>
      </div>
    </Card>
  );
}

// ─── Change PIN ────────────────────────────────────────────────
function ChangePinCard({ onChange }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function change() {
    if (busy) return;
    if (!/^\d{4}$/.test(newPin)) { setMsg('New PIN must be 4 digits.'); return; }
    if (newPin !== confirmPin)   { setMsg('PINs don\'t match.'); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post('/bank/change-pin', { old_pin: oldPin, new_pin: newPin });
      setMsg('PIN updated.');
      setOldPin(''); setNewPin(''); setConfirmPin('');
      await onChange?.();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function forgot() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      await api.post('/bank/forgot-pin', {});
      setMsg('The bank just DM\'d you a reminder. Check Messages.');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card title="PIN management"
      subtitle="Change your PIN or ask the bank to DM you a reminder if you've forgotten it.">
      {msg && <p className="text-xs text-money-400 mb-2">{msg}</p>}
      <div className="grid sm:grid-cols-3 gap-2 mb-2">
        <input type="text" inputMode="numeric" maxLength="4" value={oldPin}
          onChange={e => setOldPin(e.target.value.replace(/\D/g,'').slice(0,4))}
          placeholder="Old PIN" />
        <input type="text" inputMode="numeric" maxLength="4" value={newPin}
          onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
          placeholder="New PIN" />
        <input type="text" inputMode="numeric" maxLength="4" value={confirmPin}
          onChange={e => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
          placeholder="Confirm new" />
      </div>
      <div className="flex gap-2">
        <button onClick={change} disabled={busy || !oldPin || !newPin || !confirmPin}
          className="btn btn-primary text-xs">
          {busy ? '…' : 'Change PIN'}
        </button>
        <button onClick={forgot} disabled={busy} className="btn btn-ghost text-xs">
          Forgot PIN? Text it to me
        </button>
      </div>
    </Card>
  );
}
