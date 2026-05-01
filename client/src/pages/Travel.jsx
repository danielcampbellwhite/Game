import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
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
    setBusy(`${city}-${klass}`); setMsg(null);
    try {
      await api.post('/travel/fly', { city, klass });
      setMsg('Boarded.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  return (
    <Card title="✈️ Travel" subtitle={`Currently in: ${data.currentCity}`}>
      {msg && <p className="text-xs text-blood-400 mb-3">{msg}</p>}
      <div className="grid md:grid-cols-2 gap-3">
        {data.flights.map(f => (
          <div key={f.city} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
            <div className="font-medium">{f.emoji} {f.name}</div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              {Object.entries(f.classes).map(([k, v]) => (
                <button key={k} disabled={!!busy || character.cash < v.cost} className="btn"
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
  );
}
