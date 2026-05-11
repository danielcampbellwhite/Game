import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const BAND_COLOR = {
  inner:    'text-money-300',
  trusted:  'text-money-400',
  regular:  'text-gold-400',
  stranger: 'text-ink-100/55',
};

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
      else setMsg(`Cleaned £${amount.toLocaleString()} → ${fmt(r.legal)} legal.${r.newScore ? ` Score with your fence: ${r.newScore}.` : ''}`);
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
  const npc = data.npc;
  const bandColor = npc ? (BAND_COLOR[npc.band.tier] || 'text-ink-100/65') : 'text-ink-100/65';

  return (
    <div className="space-y-4 max-w-xl">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      {npc && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-ink-100/45">Your fence in this city</div>
              <div className="font-display text-xl mt-0.5">{npc.name}</div>
              <p className="text-[13px] text-ink-100/55 leading-snug mt-1">{npc.blurb}</p>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-[12px] uppercase tracking-wide ${bandColor}`}>{npc.band.label}</div>
              <div className="text-[13px] text-ink-100/55 tabular-nums">score {npc.score}</div>
              {npc.band.bonus > 0 && (
                <div className="text-[12px] text-money-300 mt-0.5">+{Math.round(npc.band.bonus * 100)}% on rate</div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card title=" The Fence" subtitle="Turns illegal cash into legal at 70% (plus perks and your standing with the contact). Stings happen — the bigger the wash, the higher the heat.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Your illegal cash</div>
            <div className="font-display text-2xl text-blood-300 tabular-nums">{fmt(illegalCash)}</div>
          </div>
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Effective rate</div>
            <div className="font-display text-2xl tabular-nums">{Math.round(data.rate * 100)}%</div>
            <div className="text-[11px] text-ink-100/40 tabular-nums">
              base {Math.round(data.bonuses.base * 100)}%
              {data.bonuses.perkPct ? ` · perk +${data.bonuses.perkPct}%` : ''}
              {data.bonuses.npcPct  ? ` · contact +${data.bonuses.npcPct}%` : ''}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-[13px] text-ink-100/60">Amount to launder</label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min={0} step={1000} value={amount}
              onChange={e => setAmount(e.target.value)} className="flex-1 min-w-[140px]" />
            <button className="btn btn-ghost text-[13px]" onClick={() => setAmount(illegalCash)}>Max</button>
          </div>
          {num > 0 && (
            <div className="text-[13px] text-ink-100/65 space-y-0.5">
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
