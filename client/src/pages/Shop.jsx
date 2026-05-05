import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Pretty up the effects object that comes back on each item — same
// shape the General Store uses (energy / nerve / health / happiness).
const EFFECT_TONE = {
  energy:    'text-yellow-400',
  nerve:     'text-blood-400',
  health:    'text-money-400',
  happiness: 'text-pink-400',
};

function effectChips(effects) {
  if (!effects) return null;
  return Object.entries(effects).map(([k, v]) => (
    <span key={k} className={`text-[10px] uppercase tracking-wide ${EFFECT_TONE[k] || 'text-ink-50'}`}>
      {v > 0 ? '+' : ''}{v} {k}
    </span>
  ));
}

export default function Shop() {
  const { slug } = useParams();
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get(`/shops/${slug}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [slug, character?.city]);

  async function buy(item, qty = 1) {
    setBusy(`buy-${item.id}`); setMsg(null);
    try {
      await api.post(`/shops/${slug}/buy`, { item_id: item.id, qty });
      setMsg(`Bought ${qty}× ${item.emoji ? item.emoji + ' ' : ''}${item.name}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title={` ${data.name} — ${data.cityName}`} subtitle={data.blurb}>
        <p className="text-[11px] text-ink-100/55">
          Items go straight into your inventory. Use them from there or the General Store's "use"
          flow when you need the boost.
        </p>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.items.map(i => {
          const cantAfford = (character?.cash || 0) < i.cityCost;
          return (
            <div key={i.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
              <div className="flex justify-between items-start gap-2">
                <div className="font-medium">{i.emoji} {i.name}</div>
                <div className="text-[11px] text-money-400 tabular-nums">{fmt(i.cityCost)}</div>
              </div>
              <p className="text-[11px] text-ink-100/60 mt-1">{i.desc}</p>
              {i.effects && (
                <div className="mt-2 flex flex-wrap gap-x-2">{effectChips(i.effects)}</div>
              )}
              <div className="mt-3 flex items-baseline justify-between gap-2 text-[10px] text-ink-100/50">
                <span>Owned: {i.owned}</span>
              </div>
              <button
                disabled={cantAfford || busy === `buy-${i.id}`}
                onClick={() => buy(i, 1)}
                className="btn btn-money w-full text-xs mt-2">
                {busy === `buy-${i.id}` ? '…' : cantAfford ? `Need ${fmt(i.cityCost - (character?.cash || 0))}` : 'Buy 1'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
