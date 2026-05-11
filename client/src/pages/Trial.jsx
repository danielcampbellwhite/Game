import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Trial screen. Live conviction-chance preview at the top, four
// possible actions: hire a lawyer (-20% effective evidence, up to
// 3), bribe the judge (one-time -30% conviction chance), plead
// guilty (60% sentence + record), or go to court (roll). Resolving
// any way clears the trial and unblocks crime commits.

export default function Trial() {
  const { refresh, character } = useGame();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [outcome, setOutcome] = useState(null);

  async function load() {
    try {
      const r = await api.get('/trials');
      setData(r.trial);
      if (!r.trial && !outcome) nav('/');
    } catch (e) {
      setMsg(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function act(action, fn) {
    setBusy(action); setMsg(null);
    try {
      const r = await fn();
      await refresh();
      if (r.convicted) {
        setOutcome({ kind: 'convicted', jailMin: r.jailMin, convictionChance: r.convictionChance });
      } else if (r.acquitted) {
        setOutcome({ kind: 'acquitted', convictionChance: r.convictionChance });
      } else if (r.conviction) {
        setOutcome({ kind: 'pleaded', jailMin: r.jailMin });
      } else {
        // Lawyer / bribe — stay on page, reload state.
        await load();
      }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (outcome) {
    return (
      <div className="max-w-xl mx-auto">
        <Card>
          <div className="text-center py-4 space-y-3">
            {outcome.kind === 'acquitted' ? (
              <>
                <div className="font-display text-4xl text-money-300">ACQUITTED.</div>
                <p className="text-sm text-ink-100/75">
                  The jury didn't buy it ({Math.round(outcome.convictionChance * 100)}% conviction odds). Walked free.
                </p>
              </>
            ) : outcome.kind === 'convicted' ? (
              <>
                <div className="font-display text-4xl text-blood-300">GUILTY.</div>
                <p className="text-sm text-ink-100/75">
                  Convicted at {Math.round(outcome.convictionChance * 100)}% odds. {outcome.jailMin} minutes inside.
                </p>
                <p className="text-[12px] text-ink-100/55">A new mark on the record. Stacks for 60 days.</p>
              </>
            ) : (
              <>
                <div className="font-display text-3xl text-yellow-300">Pleaded out.</div>
                <p className="text-sm text-ink-100/75">
                  {outcome.jailMin} minutes inside. One conviction added to the record.
                </p>
              </>
            )}
            <button onClick={() => nav('/')} className="btn btn-primary text-xs mt-2">Close</button>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading...</p></Card>;

  const cc = data.convictionChance;
  const ccColor = cc >= 0.7 ? 'text-blood-300' : cc >= 0.4 ? 'text-yellow-300' : 'text-money-300';
  const evidenceColor = ccColor;

  return (
    <div className="max-w-xl mx-auto space-y-3">
      {msg && <Card><p className="text-xs text-blood-300">{msg}</p></Card>}

      <Card>
        <div className="border-b border-ink-100/15 pb-3 mb-3 text-center">
          <div className="text-[12px] uppercase tracking-widest text-blood-300">In the dock</div>
          <div className="font-display text-3xl mt-1">The People vs. {character?.name || 'You'}</div>
          <p className="text-[13px] text-ink-100/55 mt-1">
            {data.detective}'s file. Filed {Math.floor((Date.now() - data.filedAt) / 60000)} minutes ago.
          </p>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[12px] uppercase text-ink-100/55">Conviction odds</span>
          <span className={`font-display text-3xl tabular-nums ${ccColor}`}>{Math.round(cc * 100)}%</span>
        </div>
        <div className="h-2 mt-2 rounded-full bg-ink-100/10 overflow-hidden">
          <div className={evidenceColor.replace('text-', 'bg-')}
            style={{ width: `${cc * 100}%`, height: '100%' }} />
        </div>
        <div className="flex justify-between text-[11px] text-ink-100/55 tabular-nums mt-1">
          <span>Evidence weight: {Math.round(data.effectiveEvidence)}</span>
          <span>Base sentence: {data.baseJailMin}m</span>
        </div>
      </Card>

      <Card title="Hire a lawyer" subtitle={`Each hire shaves ${Math.round(data.lawyerReducePct * 100)}% off the evidence weight. Up to ${data.lawyerMax} hires per case.`}>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ink-100/65">
            {data.lawyerCount} of {data.lawyerMax} lawyers retained
          </span>
          <span className="text-money-300 tabular-nums">{fmt(data.lawyerCost)} next</span>
        </div>
        <button
          onClick={() => act('lawyer', () => api.post('/trials/hire-lawyer'))}
          disabled={busy === 'lawyer' || data.lawyerCount >= data.lawyerMax || (character?.cash || 0) < data.lawyerCost}
          className="btn btn-money text-xs w-full mt-2">
          {busy === 'lawyer' ? '...' :
            data.lawyerCount >= data.lawyerMax ? 'Full legal team' :
            (character?.cash || 0) < data.lawyerCost ? `Need ${fmt(data.lawyerCost - (character?.cash || 0))} more` :
            `Retain another lawyer (${fmt(data.lawyerCost)})`}
        </button>
      </Card>

      <Card title="Bribe the judge" subtitle={`One-time — ${Math.round(data.bribeReduction * 100)}% off conviction odds. Risky if it gets out, but in court it's cleaner than a witness flip.`}>
        {data.bribed ? (
          <p className="text-[13px] text-money-300">Judge is already on the payroll.</p>
        ) : (
          <button
            onClick={() => act('bribe', () => api.post('/trials/bribe'))}
            disabled={busy === 'bribe' || (character?.cash || 0) < data.bribeCost}
            className="btn btn-gold text-xs w-full">
            {busy === 'bribe' ? '...' :
              (character?.cash || 0) < data.bribeCost ? `Need ${fmt(data.bribeCost - (character?.cash || 0))} more` :
              `Pay ${fmt(data.bribeCost)}`}
          </button>
        )}
      </Card>

      <Card title="Plead guilty" subtitle="60% of the base sentence, conviction goes on the record. Saves you the courtroom but the priors hurt the next time you slip up.">
        <button
          onClick={() => act('plea', () => api.post('/trials/plead-guilty'))}
          disabled={busy === 'plea'}
          className="btn btn-ghost text-xs w-full">
          {busy === 'plea' ? '...' : `Plead guilty (${Math.floor(data.baseJailMin * 0.6)}m)`}
        </button>
      </Card>

      <Card title="Take it to court" subtitle="Roll the dice. Acquittal walks you out clean and keeps your record clear; conviction is full sentence + a new mark.">
        <button
          onClick={() => act('court', () => api.post('/trials/go-to-court'))}
          disabled={busy === 'court'}
          className="btn btn-primary text-xs w-full">
          {busy === 'court' ? '...' : `Go to court (${Math.round(cc * 100)}% conviction)`}
        </button>
      </Card>
    </div>
  );
}
