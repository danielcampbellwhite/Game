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
  const [dep, setDep] = useState(''); const [wd, setWd] = useState(''); const [loan, setLoan] = useState('');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setInfo(await api.get('/bank')); }
  useEffect(() => { load(); }, []);

  async function act(path, body, key, ok) {
    setBusy(key); setMsg(null);
    try { await api.post(`/bank/${path}`, body); setMsg(ok); await refresh(); await load(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!info) return null;
  const tier = info.credit?.tier || 'Building';
  const rate = info.credit?.rate ?? 0.13;

  return (
    <div className="space-y-4">
      <Card title=" Bank" subtitle={`Hourly interest on deposits: ${(info.interestRateHourly*100).toFixed(3)}%`}>
        {msg && <p className="text-xs text-money-400 mb-3">{msg}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-ink-100/60 mb-1">Deposit cash</div>
            <div className="flex gap-2">
              <input type="number" value={dep} onChange={e => setDep(e.target.value)} placeholder={fmt(info.cash)} className="flex-1" />
              <button disabled={!dep || busy === 'd'} className="btn btn-money" onClick={() => act('deposit', { amount: +dep }, 'd', 'Deposited')}>Deposit</button>
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-100/60 mb-1">Withdraw bank</div>
            <div className="flex gap-2">
              <input type="number" value={wd} onChange={e => setWd(e.target.value)} placeholder={fmt(info.bank)} className="flex-1" />
              <button disabled={!wd || busy === 'w'} className="btn" onClick={() => act('withdraw', { amount: +wd }, 'w', 'Withdrew')}>Withdraw</button>
            </div>
          </div>
        </div>
      </Card>

      <Card title=" Credit Profile" subtitle="Like a real-world credit score: built from your level, reputation, and net worth.">
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Rating</div>
            <div className={`font-display text-2xl ${TIER_COLOR[tier]}`}>{tier}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Loan rate</div>
            <div className="font-display text-2xl">{(rate * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-ink-100/45">flat, 7-day term</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Borrow capacity</div>
            <div className="font-display text-2xl text-money-400">{fmt(info.maxLoan)}</div>
          </div>
        </div>
        {info.breakdown && (
          <div className="mt-3 pt-3 border-t border-ink-100/10 text-[11px] text-ink-100/55">
            From level: <b className="text-ink-100/85">{fmt(info.breakdown.fromLevel)}</b> &nbsp;·&nbsp;
            From reputation: <b className="text-ink-100/85">{fmt(info.breakdown.fromRep)}</b> &nbsp;·&nbsp;
            From net worth: <b className="text-ink-100/85">{fmt(info.breakdown.fromNw)}</b>{' '}
            <span className="text-ink-100/40">(5% of {fmt(info.networth)})</span>
            {info.breakdown.totalOwed > 0 && (
              <> &nbsp;·&nbsp; <span className="text-blood-400">Less existing debt: {fmt(info.breakdown.totalOwed)}</span></>
            )}
          </div>
        )}
        <p className="text-[10px] text-ink-100/40 mt-2">
          Tiers: Building → Fair (lvl 8) → Good (lvl 18, rep 500) → Excellent (lvl 30, rep 2k) → Elite (lvl 50, rep 5k). Better tier = lower rate.
        </p>
      </Card>

      <Card title="Take a loan" subtitle={`Up to ${fmt(info.maxLoan)} at ${(rate * 100).toFixed(0)}% — repay within 7 days or it auto-debits with a 5%/day overdue penalty.`}>
        <div className="flex gap-2 mb-3">
          <input type="number" min="1000" value={loan} onChange={e => setLoan(e.target.value)} placeholder="Borrow amount" className="flex-1" />
          <button disabled={!loan || busy === 'l'} className="btn btn-primary" onClick={() => act('loan', { amount: +loan }, 'l', 'Loan taken')}>Take loan</button>
        </div>
        {loan && (
          <p className="text-[11px] text-ink-100/55 mb-2">
            You'll owe <b className="text-blood-400">{fmt(Math.floor(Number(loan) * (1 + rate)))}</b> total.
          </p>
        )}
        {info.loans.length ? (
          <ul className="space-y-2">
            {info.loans.map(l => (
              <li key={l.id} className="flex items-center justify-between rounded-md bg-ink-950/40 border border-ink-100/10 p-2 text-xs">
                <span>Owe {fmt(l.principal)} — due {new Date(l.due_at).toLocaleString()}</span>
                <button disabled={busy === `r${l.id}`} className="btn btn-money text-xs" onClick={() => act('repay', { id: l.id }, `r${l.id}`, 'Repaid')}>Repay</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-100/50">No active loans.</p>}
      </Card>
    </div>
  );
}
