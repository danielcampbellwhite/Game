import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from './Card.jsx';
import { fmt } from './Money.jsx';

// Bank-to-bank transfer form. Used by both the physical Bank page
// and the phone Bank app — same fields, same validations, same
// endpoint shape, just different paths.
//
// Props:
//   endpoint    — '/bank/send' (physical) or '/online/bank-app/send'
//                 (phone app).
//   onDone      — callback after a successful transfer, so the parent
//                 can re-fetch state.
//   compact     — slimmer layout for the phone view.
//   collapsible — render inside a foldable Card (used on the phone
//                 to fit more sections on a small screen).
export default function SendMoneyForm({ endpoint, onDone, compact = false, collapsible = false }) {
  const { refresh } = useGame();
  const [name, setName]     = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin]       = useState('');
  const [memo, setMemo]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState(null);

  // Live autocomplete on the recipient name. As the player types we
  // hit /api/players/search?q=… and surface up to 6 matches; tapping
  // one fills the name field exactly so transfers don't go to the
  // wrong person because of a typo.
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const fetchRef = useRef(0);
  useEffect(() => {
    const q = name.trim();
    if (q.length < 2) { setResults([]); return; }
    const myReq = ++fetchRef.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/players/search?q=${encodeURIComponent(q)}&limit=6`);
        if (myReq === fetchRef.current) {
          setResults(r.players || []);
          setShowResults(true);
          setFocusIdx(-1);
        }
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [name]);

  function pickPlayer(p) {
    setName(p.name);
    setShowResults(false);
    setResults([]);
    setFocusIdx(-1);
  }

  function onNameKey(e) {
    if (!showResults || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); pickPlayer(results[focusIdx]); }
    else if (e.key === 'Escape') { setShowResults(false); }
  }

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
      setResults([]); setShowResults(false);
      await refresh();
      await onDone?.();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Send money"
      collapsible={collapsible}
      subtitle="Bank transfer to another player. PIN required; the recipient needs a bank account too.">
      {msg && <p className={`text-xs mb-2 ${msg.startsWith('Sent') ? 'text-money-400' : 'text-blood-300'}`}>{msg}</p>}
      <div className={`grid ${compact ? 'grid-cols-1 gap-1.5' : 'sm:grid-cols-2 gap-2'}`}>
        <div className="relative">
          <input type="text" value={name}
            onChange={e => { setName(e.target.value.slice(0, 32)); setShowResults(true); }}
            onFocus={() => { if (results.length > 0) setShowResults(true); }}
            onBlur={() => setTimeout(() => setShowResults(false), 120)}
            onKeyDown={onNameKey}
            placeholder="Recipient name"
            autoComplete="off"
            className="text-xs w-full" />
          {showResults && results.length > 0 && (
            <ul className="absolute z-30 left-0 right-0 mt-0.5 max-h-56 overflow-y-auto scrollbar rounded-md border border-ink-100/15 bg-ink-950/95 backdrop-blur shadow-xl shadow-black/60">
              {results.map((p, idx) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickPlayer(p); }}
                    className={`block w-full text-left px-2 py-1.5 text-[12px] ${idx === focusIdx ? 'bg-blood-700/60 text-white' : 'text-ink-100/90 hover:bg-ink-800/70'}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="text-[11px] text-ink-100/55 whitespace-nowrap">lvl {p.level}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
