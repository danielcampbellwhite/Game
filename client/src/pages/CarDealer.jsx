import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

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

  const makers = useMemo(() => Array.from(new Set((data?.inventory || []).map(v => v.maker))).sort(), [data]);

  if (!data) return null;
  const list = data.inventory.filter(v =>
    (filter === 'all' || v.tier === parseInt(filter, 10)) &&
    (maker === 'all' || v.maker === maker) &&
    (!maxPrice || v.price <= parseInt(maxPrice, 10))
  );
  const grouped = list.reduce((m, v) => ((m[v.tier] = m[v.tier] || []).push(v), m), {});

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title=" Premier Auto" subtitle={`Showroom in ${data.cityName}. Cars are titled to you, no questions asked.`}>
        <div className="flex flex-wrap gap-2 items-center text-xs">
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
      </Card>

      {Object.keys(grouped).sort().map(tier => (
        <Card key={tier} title={`${tierEmoji(parseInt(tier, 10))} Tier ${tier} — ${TIER_LABEL[tier]}`}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[tier].map(v => (
              <div key={v.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="font-medium">{v.maker} {v.name}</div>
                <div className="text-[11px] text-ink-100/60">Book: {fmt(v.bookPrice)}</div>
                <div className="text-money-400 font-semibold tabular-nums mt-1">{fmt(v.price)}</div>
                <button disabled={character.cash < v.price || busy === v.id} className="btn btn-money w-full text-xs mt-2"
                  onClick={() => buy(v)}>
                  {busy === v.id ? '...' : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
