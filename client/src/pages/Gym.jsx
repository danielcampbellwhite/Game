import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import LockBadge from '../components/LockBadge.jsx';
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
    setBusy(`m-${machine.id}`); setMsg(null);
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

  async function join(gym) {
    setBusy(`j-${gym.id}`); setMsg(null);
    try {
      await api.post('/gym/join', { gym_id: gym.id });
      setMsg(`Welcome to ${gym.name}. Membership runs 7 days.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function renew() {
    setBusy('renew'); setMsg(null);
    try {
      await api.post('/gym/renew');
      setMsg('Membership renewed for another week.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const active = data.membership;
  const activeGym = active && data.gyms.find(g => g.id === active.gymId);
  const activeTier = activeGym?.tier || 0;
  // Only the machines the active gym lets you touch; the rest are
  // surfaced as "locked at this tier" so the player can see what
  // they'd unlock by upgrading.
  const visibleMachines = data.machines.filter(m => m.minTier <= Math.max(1, activeTier || 1));
  const upsellMachines  = data.machines.filter(m => m.minTier  > Math.max(1, activeTier || 1));

  return (
    <div className="space-y-4">
      <Card title=" Gym Memberships"
        subtitle="Pay a weekly fee for the gym tier you can stomach. Training costs only energy, but high-tier machines lock to high-tier members.">
        {active ? (
          <div className="rounded-md border border-money-500/40 bg-money-600/10 p-3 flex flex-wrap items-baseline gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] uppercase tracking-wide text-money-300">Active membership</div>
              <div className="font-medium">{activeGym?.name} <span className="text-ink-100/55 text-xs">· Tier {activeGym?.tier} · ×{activeGym?.progressionMul} progress rate</span></div>
              <div className="text-[12px] text-ink-100/55">Expires <Timer until={active.expiresAt} /></div>
            </div>
            <button disabled={busy === 'renew' || character.cash < activeGym?.weeklyFee}
              onClick={renew} className="btn btn-money text-xs">
              {busy === 'renew' ? '…' : `Renew · ${fmt(activeGym?.weeklyFee || 0)}`}
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-100/65">You're not a member of any gym. Pick one below to start training.</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {data.gyms.map(g => {
            const here = active?.gymId === g.id;
            return (
              <div key={g.id} className={`rounded-lg p-3 border ${
                here ? 'border-money-500/60 bg-money-600/10'
                : g.locked ? 'border-ink-100/10 bg-ink-950/40 opacity-60'
                : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'
              }`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{g.name}</div>
                  {g.locked ? <LockBadge level={g.levelGate} /> : <span className="text-[11px] uppercase tracking-wide text-ink-100/55">Tier {g.tier}</span>}
                </div>
                <p className="text-[12px] text-ink-100/55 mt-1">{g.blurb}</p>
                <div className="text-[12px] text-ink-100/65 mt-2">
                  <b className="text-money-400">{fmt(g.weeklyFee)}</b> / week · ×{g.progressionMul} permanent progress
                </div>
                {!here && !g.locked && (
                  <button disabled={busy === `j-${g.id}` || character.cash < g.weeklyFee}
                    onClick={() => join(g)} className="btn btn-primary text-xs w-full mt-3">
                    {busy === `j-${g.id}` ? '…' : (active ? 'Switch here' : 'Join')}
                  </button>
                )}
                {here && <div className="text-[11px] text-money-300 mt-2"> Your gym</div>}
              </div>
            );
          })}
        </div>
      </Card>

      {active && (
        <Card title=" Progress" subtitle="Temporary buffs decay 1 point/hour. Keep grinding to push your base stats up — until you hit the cap.">
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
      )}

      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      {active && (
        <Card title="Machines" subtitle="Energy only — no per-session cash cost.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleMachines.map(m => {
              const cant = character.energy < m.energy;
              return (
                <div key={m.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{m.emoji} {m.name}</div>
                    <div className="text-[12px] text-ink-100/50">{m.energy} en</div>
                  </div>
                  <div className="text-[13px] text-ink-100/55 mt-1">{m.desc}</div>
                  <div className="flex flex-wrap gap-x-2 mt-2">
                    {Object.entries(m.buffs).map(([s, v]) => (
                      <span key={s} className={`text-[12px] uppercase tracking-wide ${STAT_COLORS[s]}`}>+{v} {s}</span>
                    ))}
                  </div>
                  <button disabled={cant || busy === `m-${m.id}`} className="btn btn-gold w-full text-xs mt-3"
                    onClick={() => train(m)}>
                    {busy === `m-${m.id}` ? '…' : 'Train'}
                  </button>
                </div>
              );
            })}
          </div>
          {upsellMachines.length > 0 && (
            <div className="mt-4 pt-4 border-t border-ink-100/10">
              <div className="text-[12px] uppercase tracking-wide text-ink-100/55 mb-2">Available at higher-tier gyms</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {upsellMachines.map(m => (
                  <div key={m.id} className="rounded-md p-2 border border-ink-100/5 bg-ink-950/30 opacity-60">
                    <div className="flex justify-between text-xs">
                      <span>{m.emoji} {m.name}</span>
                      <span className="text-[11px] uppercase tracking-wide text-ink-100/45">Tier {m.minTier}+</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
