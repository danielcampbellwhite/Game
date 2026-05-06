import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

export default function Repair() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/repair')); }
  useEffect(() => { load(); }, [character?.active_vehicle_id]);

  async function repair() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/repair');
      setMsg(`Repaired for ${fmt(r.cost)}. Back to 100%.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!data) return null;
  const a = data.active;
  return (
    <div className="space-y-4 max-w-xl">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title=" Repair Shop" subtitle={`Workshop in ${data.cityName}. Brings your active car back to 100% condition.`}>
        {!a ? (
          <p className="text-sm text-ink-100/60">
            No active car. <Link className="text-blood-300 underline" to="/inventory">Drive one</Link> here first.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
              <div className="flex justify-between items-baseline gap-2">
                <div className="font-medium">{a.maker} {a.name}</div>
                <div className="text-[12px] text-ink-100/45">Tier {a.tier} · book {fmt(a.cityBook)}</div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-ink-800 overflow-hidden">
                  <div
                    className={a.condition >= 75 ? 'bg-money-500' : a.condition >= 40 ? 'bg-yellow-400' : 'bg-blood-500'}
                    style={{ width: `${Math.max(0, Math.min(100, a.condition))}%`, height: '100%' }}
                  />
                </div>
                <span className="text-xs tabular-nums w-10 text-right">{Math.round(a.condition)}%</span>
              </div>
            </div>

            {a.condition >= 100 ? (
              <p className="text-xs text-money-400">Already in perfect shape — nothing to do here.</p>
            ) : (
              <div className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <p className="text-[13px] text-ink-100/60">
                  Restore <span className="text-ink-50">{Math.round(100 - a.condition)}%</span> condition for
                  <span className="text-money-400 tabular-nums"> {fmt(a.cost)}</span>.
                </p>
                <button onClick={repair} disabled={busy || character.cash < a.cost}
                  className="btn btn-money w-full text-xs mt-2">
                  {busy
                    ? '…'
                    : character.cash < a.cost
                      ? `Need ${fmt(a.cost - character.cash)} more`
                      : `Repair · ${fmt(a.cost)}`}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
