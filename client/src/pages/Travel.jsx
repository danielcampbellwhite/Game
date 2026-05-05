import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
import { fmt } from '../components/Money.jsx';

export default function Travel() {
  const { refresh, character } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/travel')); }
  useEffect(() => { load(); }, [character?.city]);

  async function fly(city, klass) {
    setBusy(`fly-${city}-${klass}`); setMsg(null);
    try {
      await api.post('/travel/fly', { city, klass });
      setMsg('Boarded.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function drive(city) {
    setBusy(`drive-${city}`); setMsg(null);
    try {
      await api.post('/travel/drive', { city });
      setMsg('On the road.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const grounded = !!character?.active_vehicle_id;
  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title=" Drive" subtitle="Cheaper, slower, no customs check at the border. You bring your active car with you.">
        {!grounded ? (
          <p className="text-xs text-ink-100/55">You need an active car to drive between cities. Buy or steal one first.</p>
        ) : !data.drives?.length ? (
          <p className="text-xs text-ink-100/55">No road from {data.currentCity} — that one's only reachable by air.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {data.drives.map(d => (
              <div key={d.city} className={`rounded-lg p-3 border bg-ink-950/40 ${d.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{d.name}</div>
                  {d.locked
                    ? <LockBadge level={d.unlockLevel} />
                    : <div className="text-[10px] text-ink-100/45 tabular-nums">{d.km.toLocaleString()} km</div>}
                </div>
                <div className="text-[11px] text-ink-100/60 mt-0.5">
                  {fmt(d.cost)} petrol · {Math.round(d.durationMs / 60000)} min · -{d.conditionCost.toFixed(1)}% condition
                </div>
                <button disabled={d.locked || !!busy || character.cash < d.cost} className="btn btn-money w-full text-xs mt-2"
                  onClick={() => drive(d.city)}>
                  {d.locked ? 'Locked' : busy === `drive-${d.city}` ? '…' : `Drive · ${fmt(d.cost)}`}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title=" Fly" subtitle={`Currently in: ${data.currentCity}`}>
        {grounded && (
          <p className="text-xs text-yellow-300 mb-3">
            You're driving a car. Stash it in a garage (or sell it) before flying out.
            Customs may also seize drugs at the gate.
          </p>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          {data.flights.map(f => (
            <div key={f.city} className={`rounded-lg p-3 border bg-ink-950/40 ${f.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-medium">{f.emoji} {f.name}</div>
                {f.locked && <LockBadge level={f.unlockLevel} />}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                {Object.entries(f.classes).map(([k, v]) => (
                  <button key={k} disabled={f.locked || !!busy || grounded || character.cash < v.cost} className="btn"
                    onClick={() => fly(f.city, k)}>
                    <div>
                      <div className="capitalize">{k}</div>
                      <div className="text-[10px] text-ink-100/60">{fmt(v.cost)}</div>
                      <div className="text-[10px] text-ink-100/40">{v.durationMs === 0 ? 'instant' : `${Math.round(v.durationMs/60000)}m`}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
