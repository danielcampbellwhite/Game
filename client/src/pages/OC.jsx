import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { useEventStream } from '../hooks/useEventStream.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const RISK_STYLE = {
  low:     'text-money-400',
  med:     'text-yellow-400',
  high:    'text-blood-400',
  extreme: 'text-blood-300 font-semibold',
};

export default function OC() {
  const { character } = useGame();
  const nav = useNavigate();
  const [data, setData] = useState({ crimes: [], plans: [] });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    const [c, p] = await Promise.all([
      api.get('/oc/crimes'),
      api.get('/oc/plans/active'),
    ]);
    setData({ crimes: c.crimes || [], plans: p.plans || [] });
  }
  useEffect(() => { load(); }, []);
  useEventStream('oc.role_filled', () => load());
  useEventStream('oc.role_left', () => load());
  useEventStream('oc.cancelled', () => load());
  useEventStream('oc.executed', () => load());

  async function start(crimeId) {
    setBusy('start-' + crimeId); setMsg(null);
    try {
      const r = await api.post('/oc/plans', { crime_id: crimeId });
      nav(`/oc/plans/${r.plan.id}`);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs text-blood-400">{msg}</p></Card>}

      {data.plans.length > 0 && (
        <Card title="🗂 Your active plans">
          <ul className="space-y-2">
            {data.plans.map(p => (
              <li key={p.id}>
                <Link to={`/oc/plans/${p.id}`}
                  className="block rounded-lg p-3 border border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">{p.crime?.emoji} {p.crime?.name}</div>
                    <div className="text-[10px] uppercase tracking-wide text-ink-100/55">{p.status}</div>
                  </div>
                  <div className="text-[11px] text-ink-100/55 mt-1">
                    Crew: {p.filled} / {p.total}{character?.id === p.leader_id ? ' · you lead' : ''}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="🎯 Heist catalogue" subtitle="Bigger crews, bigger scores. Roles gate by stat — recruit a balanced crew or it goes sideways.">
        <div className="grid sm:grid-cols-2 gap-3">
          {data.crimes.map(c => {
            const tooLow = (character?.level ?? 0) < c.levelGate;
            const tooDumb = (character?.intelligence ?? 0) < c.roles[0].min;
            const cant = tooLow || tooDumb;
            return (
              <div key={c.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{c.emoji} {c.name}</div>
                  <div className={`text-[10px] uppercase ${RISK_STYLE[c.risk]}`}>{c.risk}</div>
                </div>
                <p className="text-[11px] text-ink-100/55 mt-1">{c.desc}</p>
                <div className="text-[11px] text-ink-100/65 mt-2">
                  Payout {fmt(c.payoutMin)}–{fmt(c.payoutMax)} · Energy {c.energy} · Lvl {c.levelGate}+
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                  {c.roles.map(r => (
                    <div key={r.id} className="text-ink-100/65">
                      <span className="text-ink-100/85">{r.name}</span>
                      <span className="text-ink-100/45 ml-1">{r.stat} ≥ {r.min}</span>
                    </div>
                  ))}
                </div>
                <button
                  disabled={cant || busy === 'start-' + c.id}
                  onClick={() => start(c.id)}
                  className="btn btn-primary w-full text-xs mt-3"
                  title={tooLow ? `Need level ${c.levelGate}` : tooDumb ? `Leader needs ${c.roles[0].stat} ≥ ${c.roles[0].min}` : 'Start planning this heist'}>
                  {busy === 'start-' + c.id ? '…' : cant ? (tooLow ? `Need lvl ${c.levelGate}` : `Need ${c.roles[0].stat} ≥ ${c.roles[0].min}`) : 'Plan this heist'}
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
