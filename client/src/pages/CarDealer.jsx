import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';
import { storefront } from '../lib/storefronts.js';
import showroomImg from '../assets/cardealer-showroom.webp';

const TIER_LABEL = {
  1: 'Beater',
  2: 'Compact',
  3: 'Hot Hatch / SUV',
  4: 'Premium',
  5: 'Luxury',
  6: 'Exotic',
  7: 'Hypercar',
};

const tierEmoji = t => (t >= 6 ? '' : t >= 4 ? '' : t === 3 ? '' : '');

export default function CarDealer() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);
  const [filter, setFilter] = useState('all');
  const [maker, setMaker] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');

  async function load() { setData(await api.get('/dealership')); }
  useEffect(() => { load(); }, [character?.city]);

  async function buy(v) {
    setBusy(v.id); setMsg(null);
    try {
      await api.post('/dealership/buy', { vehicle_id: v.id });
      setMsg(`Bought ${v.maker} ${v.name} for ${fmt(v.price)}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function tradeIn() {
    setBusy('trade-in'); setMsg(null);
    try {
      const r = await api.post('/dealership/sell');
      setMsg(`Sold your ${data.active.maker} ${data.active.name} for ${fmt(r.payout)}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  const makers = useMemo(() => Array.from(new Set((data?.inventory || []).map(v => v.maker))).sort(), [data]);

  if (!data) return null;
  const list = data.inventory.filter(v =>
    (filter === 'all' || v.tier === parseInt(filter, 10)) &&
    (maker === 'all' || v.maker === maker) &&
    (!maxPrice || v.price <= parseInt(maxPrice, 10))
  );
  const grouped = list.reduce((m, v) => ((m[v.tier] = m[v.tier] || []).push(v), m), {});
  const shop = storefront('cars', character.city);

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4">
          <img
            src={showroomImg}
            alt="Showroom floor"
            loading="lazy"
            className="w-full sm:w-56 h-40 sm:h-auto sm:max-h-56 object-cover rounded-md border border-ink-100/10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl text-ink-50">{shop.name}</h3>
            <p className="text-xs text-ink-100/60 mt-1">Showroom in {data.cityName}. Cars are titled to you, no questions asked.</p>
            {data.garage && (
              <p className={`text-[11px] mt-2 ${data.garage.free === 0 ? 'text-blood-400' : 'text-ink-100/55'}`}>
                Local garage: <span className="tabular-nums">{data.garage.used}/{data.garage.capacity}</span>
                {data.garage.free === 0
                  ? ' — full. Sell or ship a car before buying another here.'
                  : data.garage.capacity === 0
                    ? ' — no property in this city. Buy one to park cars here.'
                    : ` — ${data.garage.free} free.`}
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center text-xs mt-3">
              <select value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">All tiers</option>
                {[1,2,3,4,5,6,7].map(t => <option key={t} value={t}>Tier {t} — {TIER_LABEL[t]}</option>)}
              </select>
              <select value={maker} onChange={e => setMaker(e.target.value)}>
                <option value="all">All makers</option>
                {makers.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" placeholder="Max price" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-32" />
              <span className="text-ink-100/50 ml-auto">{list.length} cars</span>
            </div>
          </div>
        </div>
      </Card>

      {data.active && (
        <Card title="Trade-in">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{data.active.maker} {data.active.name}</div>
              <div className="text-[11px] text-ink-100/55">
                Tier {data.active.tier} · {data.active.acquired_via === 'stolen' ? 'stolen' : 'bought'}
              </div>
              {data.active.acquired_via !== 'bought' && (
                <p className="text-[11px] text-ink-100/55 mt-1">
                  We only deal in clean paperwork — try a chop shop or the black-market dealer for that one.
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              {data.active.tradeIn ? (
                <>
                  <div className="text-money-400 tabular-nums font-semibold">{fmt(data.active.tradeIn)}</div>
                  <button onClick={tradeIn} disabled={busy === 'trade-in'}
                    className="btn btn-money text-xs mt-1">
                    {busy === 'trade-in' ? '…' : 'Sell to dealer'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </Card>
      )}

      {Object.keys(grouped).sort().map(tier => (
        <Card key={tier} title={`${tierEmoji(parseInt(tier, 10))} Tier ${tier} — ${TIER_LABEL[tier]}`}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[tier].map(v => (
              <div key={v.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="font-medium">{v.maker} {v.name}</div>
                <div className="text-[11px] text-ink-100/60">Book: {fmt(v.bookPrice)}</div>
                <div className="text-money-400 font-semibold tabular-nums mt-1">{fmt(v.price)}</div>
                <button disabled={character.cash < v.price || busy === v.id || (data.garage && data.garage.free === 0)} className="btn btn-money w-full text-xs mt-2"
                  onClick={() => buy(v)}>
                  {busy === v.id
                    ? '...'
                    : (data.garage && data.garage.free === 0)
                      ? 'Garage full'
                      : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
