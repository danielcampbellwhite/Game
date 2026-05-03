import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const CATEGORY_ORDER = ['melee', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper'];

const AMMO_LABEL = {
  '9mm':    '9mm',
  '45acp':  '.45 ACP',
  '357':    '.357 Magnum',
  shells:   '12 gauge',
  '556':    '5.56mm',
  '762':    '7.62mm',
  '308':    '.308',
  '50cal':  '.50 cal',
};

function AmmoCard({ a, character, buy, sell, busy }) {
  const [sellQty, setSellQty] = useState(0);
  const owned = a.owned || 0;
  const ratePerRound = a.sellBackPerRound;
  const sellPayout = sellQty * ratePerRound;

  // Default the sell input to "all" the first time the player has stock.
  useEffect(() => {
    setSellQty(prev => (prev === 0 || prev > owned) ? owned : prev);
  }, [owned]);

  return (
    <div className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
      <div className="flex items-baseline justify-between">
        <div className="font-medium">{a.name}</div>
        {owned > 0 && <span className="text-[10px] text-ink-100/55 tabular-nums">{owned} on hand</span>}
      </div>
      <div className="text-[11px] text-ink-100/60">{a.packSize} rounds / pack · £{a.cost}/round</div>
      <div className="text-money-400 tabular-nums mt-1">{fmt(a.packCost)}/pack</div>
      <button disabled={character.cash < a.packCost || busy === `ammo-${a.id}`} className="btn btn-money w-full text-xs mt-2"
        onClick={() => buy('ammo', a, 1)}>
        {busy === `ammo-${a.id}` ? '…' : 'Buy pack'}
      </button>
      {owned > 0 && (
        <div className="mt-3 pt-3 border-t border-ink-100/10">
          <div className="text-[10px] uppercase text-ink-100/55 mb-1">Sell back · {fmt(ratePerRound)}/round</div>
          <div className="flex gap-2">
            <input type="number" min="1" max={owned} value={sellQty}
              onChange={e => setSellQty(Math.max(1, Math.min(owned, parseInt(e.target.value, 10) || 1)))}
              className="flex-1 text-xs" />
            <button disabled={busy === `sell-${a.id}` || sellQty < 1 || sellQty > owned}
              onClick={() => sell(a, sellQty)}
              className="btn btn-ghost text-xs">
              {busy === `sell-${a.id}` ? '…' : `Sell · ${fmt(sellPayout)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GunStore() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);
  const [makerFilter, setMakerFilter] = useState('all');

  async function load() { setData(await api.get('/gunstore')); }
  useEffect(() => { load(); }, [character?.city, character?.level]);

  async function buy(kind, item, qty = 1) {
    setBusy(`${kind}-${item.id}`); setMsg(null);
    try {
      await api.post('/inventory/buy', { kind, item_id: item.id, qty });
      const label = kind === 'ammo' ? `${item.packSize * qty} ${item.name}` : `${item.maker ? item.maker + ' ' : ''}${item.name}`;
      setMsg(`Bought ${label}.`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function sellAmmo(item, qty) {
    setBusy(`sell-${item.id}`); setMsg(null);
    try {
      const r = await api.post('/gunstore/sell', { item_id: item.id, qty });
      setMsg(`Sold ${qty}× ${item.name} back for ${fmt(r.payout)}.`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  const makers = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.weapons.filter(w => w.maker).map(w => w.maker))).sort();
  }, [data]);

  if (!data) return null;

  const grouped = data.weapons.reduce((m, w) => ((m[w.category] = m[w.category] || []).push(w), m), {});

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title={`🔫 Smokey's Gun Emporium — ${data.cityName}`} subtitle="Walk in armed, walk out armoured. Equip what you own from your profile.">
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <select value={makerFilter} onChange={e => setMakerFilter(e.target.value)}>
            <option value="all">All manufacturers</option>
            {makers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-ink-100/40 ml-auto">{data.weapons.length} weapons available</span>
        </div>
      </Card>

      {CATEGORY_ORDER.filter(c => grouped[c]).map(cat => {
        const cinfo = data.weaponCategories[cat] || { name: cat, emoji: '' };
        const items = grouped[cat].filter(w => makerFilter === 'all' || w.maker === makerFilter);
        if (!items.length) return null;
        return (
          <Card key={cat} title={`${cinfo.emoji} ${cinfo.name}`}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(w => (
                <div key={w.id} className={`rounded-lg p-3 border bg-ink-950/40 ${w.locked ? 'opacity-60 border-ink-100/5' : 'border-ink-100/10'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{w.name}</div>
                      {w.maker && <div className="text-[10px] text-ink-100/50 truncate">{w.maker}</div>}
                    </div>
                    <div className="text-[10px] text-ink-100/50 whitespace-nowrap">Lvl {w.level}+</div>
                  </div>
                  <div className="text-[11px] text-ink-100/60 mt-1.5">
                    DMG <span className="text-ink-50 font-medium">{w.dmg}</span>
                    {w.ammoType ? <> · ammo: <span className="text-yellow-300">{AMMO_LABEL[w.ammoType] || w.ammoType}</span></> : ' · melee'}
                  </div>
                  <div className="text-money-400 tabular-nums mt-1.5 font-semibold">{fmt(w.cost)}</div>
                  <button disabled={w.locked || character.cash < w.cost || busy === `weapon-${w.id}`} className="btn btn-primary w-full text-xs mt-2"
                    onClick={() => buy('weapon', w)}>
                    {w.locked ? `Lvl ${w.level}+ required` : 'Buy'}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      <Card title="🦺 Armour">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.armours.map(a => (
            <div key={a.id} className={`rounded-lg p-3 border bg-ink-950/40 ${a.locked ? 'opacity-60 border-ink-100/5' : 'border-ink-100/10'}`}>
              <div className="font-medium">{a.name}</div>
              <div className="text-[11px] text-ink-100/60">DEF {a.def} · Lvl {a.level}+</div>
              <div className="text-money-400 tabular-nums mt-1">{fmt(a.cost)}</div>
              <button disabled={a.locked || character.cash < a.cost || busy === `armour-${a.id}`} className="btn btn-primary w-full text-xs mt-2"
                onClick={() => buy('armour', a)}>
                {a.locked ? `Lvl ${a.level}+ required` : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="🔋 Ammo"
        subtitle={`Surplus rounds buy back at ${Math.round((data.ammoSellBackPct || 0.5) * 100)}% of base — useful for clearing stock you no longer need.`}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.ammo.map(a => <AmmoCard key={a.id} a={a} character={character} buy={buy} sell={sellAmmo} busy={busy} />)}
        </div>
      </Card>
    </div>
  );
}
