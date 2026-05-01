import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

function cooldownLabel(sec) {
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export default function University() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/university')); }
  useEffect(() => { load(); }, [character?.intelligence, character?.cash]);

  async function study(course) {
    setBusy(course.id); setMsg(null);
    try {
      await api.post('/university/study', { course_id: course.id });
      setMsg(`Completed ${course.name} — +${course.gain} intelligence (permanent).`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  return (
    <div className="space-y-4">
      <Card title="🏛️ Northbridge University" subtitle="Permanent intelligence gains. Cost scales with your current INT — each point gets dearer as you climb. Real-world course durations apply: short courses every few hours, top tutors only every few days.">
        <div className="text-xs flex items-baseline gap-4">
          <div>
            <span className="text-[10px] uppercase text-ink-100/50">Intelligence</span>
            <div className="font-display text-3xl text-violet-300 tabular-nums">
              {data.intelligence}{data.cap != null && <span className="text-ink-100/40"> / {data.cap}</span>}
            </div>
          </div>
          {data.maxed && (
            <span className="text-[10px] uppercase tracking-wide text-money-400 font-bold">MAX</span>
          )}
        </div>
      </Card>

      {data.maxed && (
        <Card>
          <p className="text-sm text-money-400 font-medium">🎓 You've graduated — for good.</p>
          <p className="text-xs text-ink-100/60 mt-1">
            You're at the intelligence cap of {data.cap}. Every job, crime bonus and gameplay
            requirement is already covered — there's nothing left for the university to sell you.
            Spend your time elsewhere.
          </p>
        </Card>
      )}

      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      {!data.maxed && (
        <Card title="Programmes">
          <div className="grid sm:grid-cols-2 gap-3">
            {data.courses.map(c => {
              const onCd = !c.ready;
              const cantAfford = character.cash < c.cost;
              const noEnergy = character.energy < c.energy;
              return (
                <div key={c.id} className={`rounded-lg p-3 border bg-ink-950/40 ${onCd ? 'opacity-60' : 'border-ink-100/10'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{c.emoji} {c.name}</div>
                    <div className="text-[10px] text-ink-100/50 text-right whitespace-nowrap">
                      {c.energy} en · {fmt(c.cost)}
                    </div>
                  </div>
                  <div className="text-[11px] text-ink-100/55 mt-1">{c.desc}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] uppercase text-violet-300 tracking-wide">+{c.gain} INT (permanent)</span>
                    <span className="text-[10px] text-ink-100/45">cooldown {cooldownLabel(c.cooldownSec)}</span>
                  </div>
                  <button disabled={onCd || cantAfford || noEnergy || busy === c.id} className="btn btn-gold w-full text-xs mt-3"
                    onClick={() => study(c)}>
                    {busy === c.id
                      ? '...'
                      : onCd
                        ? <>Ready in <Timer until={c.readyAt} onExpire={load} /></>
                        : 'Enrol'}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
