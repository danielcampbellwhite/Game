import React, { useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from './Card.jsx';
import { fmt } from './Money.jsx';

// Bank-to-bank transfer form. Used by both the physical Bank page
// and the phone Bank app — same fields, same validations, same
// endpoint shape, just different paths.
//
// Props:
//   endpoint — '/bank/send' (physical) or '/online/bank-app/send'
//              (phone app). Both take { recipient_name, amount,
//              pin, memo }.
//   onDone   — callback after a successful transfer, so the parent
//              can re-fetch state.
//   compact  — slimmer layout for the phone view.
export default function SendMoneyForm({ endpoint, onDone, compact = false }) {
  const { refresh } = useGame();
  const [name, setName]     = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin]       = useState('');
  const [memo, setMemo]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState(null);

  async function send() {
    if (busy) return;
    if (!name.trim())       { setMsg('Enter the recipient\'s name.'); return; }
    if (!amount || amount < 1) { setMsg('Enter an amount.'); return; }
    if (!/^\d{4}$/.test(pin))  { setMsg('PIN must be 4 digits.'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post(endpoint, {
        recipient_name: name.trim(),
        amount: parseInt(amount, 10),
        pin,
        memo: memo.trim() || undefined,
      });
      setMsg(`Sent ${fmt(parseInt(amount, 10))} to ${r.sentTo?.name || name}.`);
      setName(''); setAmount(''); setPin(''); setMemo('');
      await refresh();
      await onDone?.();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Send money"
      subtitle="Bank transfer to another player. PIN required; the recipient needs a bank account too.">
      {msg && <p className={`text-xs mb-2 ${msg.startsWith('Sent') ? 'text-money-400' : 'text-blood-300'}`}>{msg}</p>}
      <div className={`grid ${compact ? 'grid-cols-1 gap-1.5' : 'sm:grid-cols-2 gap-2'}`}>
        <input type="text" value={name} onChange={e => setName(e.target.value.slice(0, 32))}
          placeholder="Recipient name (exact)" className="text-xs" />
        <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="Amount" className="text-xs" />
        <input type="text" inputMode="numeric" maxLength="4" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="Your PIN" className="text-xs" />
        <input type="text" value={memo} onChange={e => setMemo(e.target.value.slice(0, 60))}
          placeholder="Memo (optional)" className="text-xs" />
      </div>
      <button onClick={send} disabled={busy || !name || !amount || !pin}
        className="btn btn-primary text-xs w-full mt-2">
        {busy ? '…' : 'Send'}
      </button>
    </Card>
  );
}
