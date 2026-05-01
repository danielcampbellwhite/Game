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

function effectChips(effects) {
  return Object.entries(effects).map(([k, v]) => (
    <span key={k} className={`text-[10px] uppercase tracking-wide ${VITAL_COLORS[k] || 'text-ink-50'}`}>
      {v > 0 ? '+' : ''}{v} {k}
    </span>
  ));
}

export default function Items() {
  const { character, refresh, updateFromResponse } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/items')); }
  useEffect(() => { load(); }, []);

  async function use(item) {
    setBusy(item.id); setMsg(null);
    try {
      const r = await api.post('/items/use', { item_id: item.id });
      updateFromResponse(r);
      const parts = Object.entries(r.applied || {}).filter(([,v]) => v).map(([k,v]) => `${v>0?'+':''}${v} ${k}`).join(', ');
      setMsg(`${item.emoji} ${item.name}: ${parts || 'no effect (already maxed)'}`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const cats = data.categories;
  const grouped = data.items.reduce((m, i) => ((m[i.cat] = m[i.cat] || []).push(i), m), {});

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title="🛍️ Streetwise" subtitle="On-demand boosts. Each item has its own cooldown.">
        <p className="text-[11px] text-ink-100/50">Tip: keep coffee + cigars on the dashboard rotation while you grind crimes — they have short cooldowns and small but stackable effects.</p>
      </Card>
      {Object.entries(cats).map(([catKey, cat]) => {
        const items = grouped[catKey] || [];
        if (!items.length) return null;
        return (
          <Card key={catKey} title={`${cat.emoji} ${cat.name}`}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(i => {
                const cantAfford = character.cash < i.cost;
                const onCooldown = !i.ready;
                return (
                  <div key={i.id} className={`rounded-lg p-3 border bg-ink-950/40 ${onCooldown ? 'opacity-60' : 'border-ink-100/10'}`}>
                    <div className="flex justify-between items-start">
                      <div className="font-medium">{i.emoji} {i.name}</div>
                      <div className="text-[11px] text-ink-100/60">{fmt(i.cost)}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2">{effectChips(i.effects)}</div>
                    <div className="text-[10px] text-ink-100/40 mt-1">cooldown {i.cooldownMin}m</div>
                    <button disabled={cantAfford || onCooldown || busy === i.id} className="btn btn-money w-full text-xs mt-2"
                      onClick={() => use(i)}>
                      {busy === i.id ? '...' : onCooldown ? <>Ready in <Timer until={i.readyAt} onExpire={load} /></> : 'Use'}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
