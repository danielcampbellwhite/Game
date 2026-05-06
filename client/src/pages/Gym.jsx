import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

const STAT_COLORS = {
  strength: 'text-blood-400',
  defence:  'text-blue-300',
  speed:    'text-yellow-300',
  accuracy: 'text-emerald-300',
};

function BuffStrip({ buffs }) {
  const active = ['strength', 'defence', 'speed'].filter(s => buffs?.[s]?.current > 0);
  if (!active.length) return <p className="text-[13px] text-ink-100/50">No active buffs. Train below to gain temporary stat boosts (decay 1 point per hour).</p>;
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {active.map(s => (
        <div key={s} className="flex flex-col">
          <span className={`uppercase tracking-wide ${STAT_COLORS[s]}`}>{s} +{buffs[s].current}</span>
          <span className="text-[12px] text-ink-100/50">fades in <Timer until={buffs[s].fadesAt} /></span>
        </div>
      ))}
    </div>
  );
}

export default function Gym() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/gym')); }
  useEffect(() => { load(); }, [character?.cash, character?.energy]);

  async function train(machine) {
    setBusy(machine.id); setMsg(null);
    try {
      const r = await api.post('/gym/train', { machine_id: machine.id });
      const summary = Object.entries(machine.buffs).map(([s, v]) => `+${v} ${s}`).join(', ');
      const perm = Object.entries(r.permanentGains || {})
        .map(([s, v]) => `+${v} ${s.toUpperCase()} (PERMANENT!)`).join(', ');
      setMsg(perm
        ? ` ${machine.name}: ${summary} · ${perm}`
        : `${machine.name}: ${summary}`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  return (
    <div className="space-y-4">
      <Card title=" Iron Foundry Gym" subtitle="Temporary buffs decay 1 point per hour. Keep training and you'll also slowly grow your base stats permanently — until you hit the cap, after which it's just temp buffs.">
        <BuffStrip buffs={data.buffs} />
        <div className="mt-3 pt-3 border-t border-ink-100/10">
          <div className="text-[12px] uppercase text-ink-100/55 mb-2">Permanent stat progress (next +1)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {['strength','defence','speed'].map(s => {
              const cap = character.stat_caps?.[s];
              const atCap = cap != null && data.base[s] >= cap;
              const pct = atCap ? 100 : Math.min(100, Math.round((data.progress[s] || 0) * 100));
              return (
                <div key={s}>
                  <div className="flex items-baseline justify-between">
                    <span className={`uppercase ${STAT_COLORS[s]}`}>{s}</span>
                    <span className="text-ink-100/55 tabular-nums">{data.base[s]}{cap != null ? ` / ${cap}` : ''}</span>
                  </div>
                  <div className="bar mt-1"><div className={atCap ? 'bg-money-500' : (s === 'strength' ? 'bg-blood-500' : s === 'defence' ? 'bg-blue-400' : 'bg-yellow-400')} style={{ width: pct + '%' }} /></div>
                  <div className="text-[12px] tabular-nums">
                    {atCap ? <span className="text-money-400 uppercase">MAX — temp buffs only</span> : <span className="text-ink-100/40">{pct}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title="Machines">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.machines.map(m => {
            const cant = character.energy < m.energy || character.cash < m.cost;
            return (
              <div key={m.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{m.emoji} {m.name}</div>
                  <div className="text-[12px] text-ink-100/50">{m.energy} en · {fmt(m.cost)}</div>
                </div>
                <div className="text-[13px] text-ink-100/55 mt-1">{m.desc}</div>
                <div className="flex flex-wrap gap-x-2 mt-2">
                  {Object.entries(m.buffs).map(([s, v]) => (
                    <span key={s} className={`text-[12px] uppercase tracking-wide ${STAT_COLORS[s]}`}>+{v} {s}</span>
                  ))}
                </div>
                <button disabled={cant || busy === m.id} className="btn btn-gold w-full text-xs mt-3"
                  onClick={() => train(m)}>
                  {busy === m.id ? '...' : 'Train'}
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
