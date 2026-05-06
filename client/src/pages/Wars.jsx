import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useEventStream } from '../hooks/useEventStream.js';
import Card from '../components/Card.jsx';

function timeLeft(ms) {
  const left = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Wars() {
  const [wars, setWars] = useState([]);
  const [turfs, setTurfs] = useState([]);
  const [, tick] = useState(0);

  async function load() {
    const [w, t] = await Promise.all([
      api.get('/gangs/wars/active'),
      api.get('/turfs'),
    ]);
    setWars(w.wars || []);
    setTurfs(t.turfs || []);
  }
  useEffect(() => { load(); }, []);
  useEventStream('gang.war.declared', () => load());

  // 1Hz tick for the countdown.
  useEffect(() => {
    const id = setInterval(() => tick(v => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <Card title=" Active wars" subtitle={wars.length ? `${wars.length} ongoing — turf changes hands at the end.` : 'No active wars.'}>
        {!wars.length ? (
          <p className="text-sm text-ink-100/55">Quiet on the streets right now.</p>
        ) : (
          <div className="space-y-3">
            {wars.map(w => {
              const remaining = w.ends_at - Date.now();
              const a_lead = w.score_a > w.score_b;
              const b_lead = w.score_b > w.score_a;
              return (
                <div key={w.id} className="rounded-lg p-3 border border-blood-500/30 bg-blood-700/10">
                  <div className="flex items-baseline justify-between text-xs text-ink-100/55">
                    <span>Contested: <b>{w.contested_city_name}</b></span>
                    <span className="font-mono tabular-nums">{timeLeft(remaining)} left</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 items-center">
                    <Link to={`/gangs/${w.gang_a.id}`} className={`rounded-lg p-2 border text-center transition ${a_lead ? 'border-money-500/40 bg-money-700/10' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
                      <div className="font-medium">{w.gang_a.name}</div>
                      <div className="text-[12px] text-ink-100/55">[{w.gang_a.tag}]</div>
                      <div className="font-display text-2xl text-money-400 mt-1 tabular-nums">{w.score_a}</div>
                    </Link>
                    <Link to={`/gangs/${w.gang_b.id}`} className={`rounded-lg p-2 border text-center transition ${b_lead ? 'border-money-500/40 bg-money-700/10' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
                      <div className="font-medium">{w.gang_b.name}</div>
                      <div className="text-[12px] text-ink-100/55">[{w.gang_b.tag}]</div>
                      <div className="font-display text-2xl text-blood-400 mt-1 tabular-nums">{w.score_b}</div>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title=" Held turfs" subtitle="Cities currently controlled by a gang. Members of the holding gang get -20% crime cooldowns while operating in their city.">
        {!turfs.length ? (
          <p className="text-sm text-ink-100/55">No held turfs. Win a war to claim a city.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {turfs.map(t => {
              const left = t.expires_at - Date.now();
              return (
                <div key={t.city} className="rounded-lg p-3 border border-gold-500/30 bg-gold-700/10">
                  <div className="text-sm font-medium">{t.city_name}</div>
                  <div className="text-[13px] text-ink-100/65 mt-1">
                    Held by <Link to={`/gangs/${t.gang.id}`} className="text-gold-400 hover:underline">{t.gang.name}</Link>
                    <span className="text-ink-100/45"> [{t.gang.tag}]</span>
                  </div>
                  <div className="text-[12px] text-ink-100/45 mt-2 tabular-nums">expires in {timeLeft(left)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
