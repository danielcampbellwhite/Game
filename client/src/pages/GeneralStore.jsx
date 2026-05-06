import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';
import { storefront } from '../lib/storefronts.js';

const VITAL_COLOURS = {
  energy: 'text-yellow-400',
  nerve: 'text-blood-400',
  health: 'text-money-400',
  happiness: 'text-pink-400',
};

function effectChips(effects) {
  return Object.entries(effects).map(([k, v]) => (
    <span key={k} className={`text-[12px] uppercase tracking-wide ${VITAL_COLOURS[k] || 'text-ink-50'}`}>
      {v > 0 ? '+' : ''}{v} {k}
    </span>
  ));
}

export default function GeneralStore() {
  const { character, refresh, updateFromResponse } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/general-store')); }
  useEffect(() => { load(); }, []);

  async function buy(itemId, qty = 1) {
    setBusy(`buy-${itemId}`); setMsg(null);
    try {
      const r = await api.post('/general-store/buy', { item_id: itemId, qty });
      updateFromResponse(r);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function use(itemId) {
    setBusy(`use-${itemId}`); setMsg(null);
    try {
      const r = await api.post('/general-store/use', { item_id: itemId });
      updateFromResponse(r);
      const parts = [];
      if (r.applied) {
        const text = Object.entries(r.applied).filter(([,v]) => v).map(([k,v]) => `${v>0?'+':''}${v} ${k}`).join(', ');
        if (text) parts.push(text);
      }
      if (r.cash) parts.push(`+£${r.cash.toLocaleString()}`);
      setMsg(parts.length ? parts.join(' · ') : 'used');
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data || !character) return null;
  const cityMul = data.items[0] ? data.items[0].cityCost / data.items[0].cost : 1;
  const shop = storefront('general', character.city);

  return (
    <div className="space-y-4">
      <Card title={`${shop.name} — ${data.cityName}`}
        subtitle="Odds, ends, and props. Most are mission props with no other use; a couple lift your spirits.">
        {cityMul !== 1 && (
          <p className="text-[13px] text-ink-100/50">Local prices are at ×{cityMul.toFixed(2)} of base.</p>
        )}
        {msg && <p className="text-xs text-money-400 mt-1">{msg}</p>}
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.items.map(i => {
          const cantAfford = character.cash < i.cityCost;
          const cantUse = i.owned <= 0;
          return (
            <Card key={i.id}>
              <div className="flex justify-between items-start">
                <div className="font-medium">{i.emoji} {i.name}</div>
                <div className="text-[13px] text-gold-400 tabular-nums">{fmt(i.cityCost)}</div>
              </div>
              <p className="text-[13px] text-ink-100/60 mt-1">{i.desc}</p>
              {i.effects && (
                <div className="mt-2 flex flex-wrap gap-x-2">{effectChips(i.effects)}</div>
              )}
              {i.oneShotCash && (
                <div className="mt-2 text-[12px] uppercase tracking-wide text-gold-400">
                  random £{i.oneShotCash.min}–£{i.oneShotCash.max}
                </div>
              )}
              {i.missionOnly && (
                <div className="mt-2 text-[12px] uppercase tracking-wide text-ink-100/40">mission item</div>
              )}

              <div className="mt-2 flex items-center justify-between text-[13px]">
                <span className="text-ink-100/50">owned</span>
                <span className="tabular-nums text-ink-100/80">{i.owned}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={cantAfford || busy === `buy-${i.id}`}
                  onClick={() => buy(i.id, 1)}
                  className="btn btn-primary text-xs">
                  {busy === `buy-${i.id}` ? '...' : 'Buy'}
                </button>
                <button
                  disabled={cantUse || busy === `use-${i.id}`}
                  onClick={() => use(i.id)}
                  className="btn btn-money text-xs">
                  {busy === `use-${i.id}` ? '...' : 'Use'}
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <p className="text-[13px] text-ink-100/60">
          Working through your <Link to="/missions" className="underline text-money-400">daily missions</Link>?
          Items used here count toward "Prep Kit", "Ghost Caller", "Cracksman", and similar objectives.
        </p>
      </Card>
    </div>
  );
}
