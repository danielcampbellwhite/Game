import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

const VITAL_COLORS = {
  energy: 'text-yellow-400',
  nerve: 'text-blood-400',
  health: 'text-money-400',
  happiness: 'text-pink-400',
};

export default function Drugs() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/drugs')); }
  useEffect(() => { load(); }, [character?.city]);

  async function trade(action, drug_id) {
    const n = Math.max(1, parseInt(qty[drug_id] || 1, 10));
    setBusy(`${action}-${drug_id}`); setMsg(null);
    try {
      await api.post(`/drugs/${action}`, { drug_id, qty: n });
      setMsg(`${action === 'buy' ? 'Bought' : 'Sold'} ${n} ${drug_id}`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function useStash(drug_id) {
    setBusy(`use-${drug_id}`); setMsg(null);
    try {
      const r = await api.post('/drugs/use', { drug_id });
      const parts = Object.entries(r.applied || {}).filter(([,v]) => v).map(([k,v]) => `${v>0?'+':''}${v} ${k}`).join(', ');
      setMsg(`Used 1 ${drug_id} — ${parts || 'no effect (already maxed)'}`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const invMap = Object.fromEntries(data.inventory.map(i => [i.id, i.qty]));

  return (
    <Card title="💊 Drug market" subtitle={`${data.city.replace('_', ' ')}`}>
      {msg && <p className="text-xs text-money-400 mb-3">{msg}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {data.market.map(d => {
          const owned = invMap[d.id] || 0;
          const locked = character.level < d.levelGate;
          return (
            <div key={d.id} className={`rounded-lg p-3 border bg-ink-950/40 ${locked ? 'opacity-50' : 'border-ink-100/10'}`}>
              <div className="flex justify-between items-baseline">
                <div className="font-medium">{d.name}</div>
                <div className="tabular-nums">{fmt(d.price)}</div>
              </div>
              <div className="text-[11px] text-ink-100/50">Base £{d.base} · Lvl {d.levelGate}+ · You hold: {owned}</div>
              <div className="flex gap-2 mt-2">
                <input type="number" min="1" placeholder="qty" value={qty[d.id] || ''} onChange={e => setQty({ ...qty, [d.id]: e.target.value })} className="w-20" />
                <button disabled={locked || !!busy} className="btn btn-primary text-xs flex-1" onClick={() => trade('buy', d.id)}>Buy</button>
                <button disabled={!owned || !!busy} className="btn btn-money text-xs flex-1" onClick={() => trade('sell', d.id)}>Sell</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-100/50 mt-3">Tip: prices drift hourly — fly to high-demand cities (Dubai, Tokyo) to dump high-margin product. Sales pay <span className="text-blood-400">dirty cash</span> — launder via car wash, nightclub, or casino.</p>

      {Object.values(invMap).some(q => q > 0) && (
        <div className="mt-6 pt-4 border-t border-ink-100/10">
          <h4 className="font-display text-lg mb-1">Use your stash</h4>
          <p className="text-[11px] text-ink-100/50 mb-3">Personal use — skip the markup, take the buzz. Each drug has its own cooldown.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.market.filter(d => (invMap[d.id] || 0) > 0 && data.useEffects[d.id]).map(d => {
              const def = data.useEffects[d.id];
              const onCd = !def.ready;
              return (
                <div key={`use-${d.id}`} className={`rounded-lg p-3 border bg-ink-950/40 ${onCd ? 'opacity-60' : 'border-ink-100/10'}`}>
                  <div className="flex justify-between items-baseline">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-[11px] text-ink-100/50">stash: {invMap[d.id]}</div>
                  </div>
                  <div className="flex flex-wrap gap-x-2 mt-1">
                    {Object.entries(def.effects).map(([k, v]) => (
                      <span key={k} className={`text-[10px] uppercase ${VITAL_COLORS[k] || ''}`}>{v>0?'+':''}{v} {k}</span>
                    ))}
                  </div>
                  <div className="text-[10px] text-ink-100/40 mt-1">cooldown {def.cooldownMin}m</div>
                  <button disabled={onCd || busy === `use-${d.id}`} className="btn btn-gold w-full text-xs mt-2"
                    onClick={() => useStash(d.id)}>
                    {busy === `use-${d.id}` ? '...' : onCd ? <>Ready in <Timer until={def.readyAt} onExpire={load} /></> : 'Use one'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
