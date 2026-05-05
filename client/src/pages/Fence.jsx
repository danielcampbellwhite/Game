import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

export default function Fence() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/fence')); }
  useEffect(() => { load(); }, [character?.dirty_cash]);

  async function launder() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/fence/launder', { amount: parseInt(amount, 10) });
      if (r.busted) setMsg(` Sting — lost £${amount.toLocaleString()} and jailed ${r.jailMin}m.`);
      else setMsg(`Cleaned £${amount.toLocaleString()} → ${fmt(r.legal)} legal.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!data) return null;
  const illegalCash = data.illegalCash || 0;
  const num = parseInt(amount, 10) || 0;
  const bustChance = Math.min(
    data.bust.cap,
    data.bust.base + (num / 100000) * data.bust.per100k
  );
  const expected = Math.floor(num * data.rate);
  const tooMuch = num > illegalCash;

  return (
    <div className="space-y-4 max-w-xl">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title=" The Fence" subtitle="Discreet contact in the city's underworld. Turns illegal cash into legal at 70% — but sting operations happen, and the bigger the wash the higher the heat.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase text-ink-100/55">Your illegal cash</div>
            <div className="font-display text-2xl text-blood-300 tabular-nums">{fmt(illegalCash)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/55">Conversion rate</div>
            <div className="font-display text-2xl tabular-nums">{Math.round(data.rate * 100)}%</div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-[11px] text-ink-100/60">Amount to launder</label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min={0} step={1000} value={amount}
              onChange={e => setAmount(e.target.value)} className="flex-1 min-w-[140px]" />
            <button className="btn btn-ghost text-[11px]" onClick={() => setAmount(illegalCash)}>Max</button>
          </div>
          {num > 0 && (
            <div className="text-[11px] text-ink-100/65 space-y-0.5">
              <div>Payout if it goes clean: <span className="text-money-400 tabular-nums">{fmt(expected)}</span> legal.</div>
              <div>Bust chance at this size: <span className="tabular-nums">{Math.round(bustChance * 100)}%</span> — sting seizes the cash and jails you.</div>
            </div>
          )}
          <button onClick={launder} disabled={busy || num <= 0 || tooMuch}
            className="btn btn-primary w-full text-xs">
            {busy ? '…' : tooMuch ? 'Not that much illegal cash' : `Launder ${fmt(num)}`}
          </button>
        </div>
      </Card>
    </div>
  );
}
