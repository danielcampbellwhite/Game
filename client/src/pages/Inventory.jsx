import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Per-card vehicle row. Surfaces the active-car state ("driving"
// vs "in garage"), and exposes the right action per state:
//   - active                 → Store (back into local garage)
//   - in player's city, idle → Equip (player must have no active car)
//   - elsewhere              → Ship (to another city w/ free space)
function VehicleCard({ v, garages, currentCity, hasActive, onChange }) {
  const [shipping, setShipping] = useState(false);
  const [to, setTo] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const destinations = garages.filter(g => g.city !== v.city && g.free > 0);
  const inCurrentCity = v.city === currentCity;

  useEffect(() => {
    if (!to) { setQuote(null); return; }
    let live = true;
    api.get(`/inventory/ship-quote?id=${v.id}&to=${to}`)
      .then(r => { if (live) setQuote(r); })
      .catch(e => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [v.id, to]);

  async function call(action, extra) {
    setBusy(true); setErr(null);
    try {
      await api.post(`/inventory/${action}`, { id: v.id, ...(extra || {}) });
      setShipping(false); setTo(''); setQuote(null);
      await onChange();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className={`rounded-lg p-3 border bg-ink-950/40 ${
      v.is_active ? 'border-money-500/60 bg-money-600/10'
        : v.is_modified ? 'border-yellow-500/40' : 'border-ink-100/10'
    }`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium">{v.maker} {v.name}</div>
        {v.is_active && <span className="text-[10px] uppercase tracking-wide text-money-300">driving</span>}
        {!v.is_active && v.is_modified && <span className="text-[10px] uppercase text-yellow-300">modded</span>}
      </div>
      <div className="text-[11px] text-ink-100/60">
        Tier {v.tier} · book {fmt(v.bookPrice)}
        {v.value_delta > 0 && <span className="text-money-400/70"> (+{fmt(v.value_delta)})</span>}
      </div>
      <div className="text-[10px] text-ink-100/40 mt-0.5">
        {v.acquired_via === 'stolen' ? 'stolen' : 'bought'} · {v.is_active ? 'with you' : `garaged in ${v.cityName}`}
      </div>
      {v.mods?.length > 0 && (
        <div className="text-[10px] text-ink-100/55 mt-1 truncate">
          {v.mods.map(m => `${m.emoji}${m.name}`).join(' · ')}
        </div>
      )}
      <div className="mt-2 flex justify-end gap-2">
        {v.is_active ? (
          <button onClick={() => call('store-vehicle')} disabled={busy}
            className="btn btn-ghost text-[11px]">{busy ? '…' : 'Store in garage'}</button>
        ) : (
          <>
            {inCurrentCity && !hasActive && (
              <button onClick={() => call('equip-vehicle')} disabled={busy}
                className="btn btn-ghost text-[11px]">{busy ? '…' : 'Drive'}</button>
            )}
            <button
              onClick={() => setShipping(s => !s)}
              className="btn btn-ghost text-[11px]"
              disabled={destinations.length === 0 || busy}
              title={destinations.length === 0 ? 'No other city has free garage space' : 'Ship to another city'}>
              {shipping ? 'Cancel' : 'Ship'}
            </button>
          </>
        )}
      </div>
      {err && <p className="text-[11px] text-blood-400 mt-1">{err}</p>}
      {shipping && !v.is_active && (
        <div className="mt-2 pt-2 border-t border-ink-100/10 text-xs space-y-2">
          <select className="w-full" value={to} onChange={e => setTo(e.target.value)}>
            <option value="">— Destination —</option>
            {destinations.map(g => (
              <option key={g.city} value={g.city}>{g.cityName} ({g.free} free)</option>
            ))}
          </select>
          {quote && (
            <div className="text-[11px] text-ink-100/60">
              Shipping cost: <span className="text-money-400 tabular-nums">{fmt(quote.cost)}</span>
            </div>
          )}
          <button onClick={() => call('ship-vehicle', { to })} disabled={!to || !quote || busy}
            className="btn btn-primary w-full text-xs">
            {busy ? '…' : quote ? `Ship for ${fmt(quote.cost)}` : 'Pick a city'}
          </button>
        </div>
      )}
    </div>
  );
}

//  Tabs
// Big inventory pages get noisy fast. Tabs keep the visible list short
// and make it easier to find a specific category.
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'weapons',  label: 'Weapons'  },
  { id: 'armour',   label: 'Armour'   },
  { id: 'ammo',     label: 'Ammo'     },
  { id: 'drugs',    label: 'Drugs'    },
  { id: 'items',    label: 'Items'    },
  { id: 'vehicles', label: 'Vehicles' },
];

function CountBadge({ n, tone = 'ink' }) {
  const cls = tone === 'blood'
    ? 'bg-blood-700/30 text-blood-200'
    : 'bg-ink-800/60 text-ink-100/70';
  return <span className={`ml-2 text-[10px] tabular-nums px-1.5 py-0.5 rounded ${cls}`}>{n}</span>;
}

function EquippedSummary({ inv }) {
  const eq = inv.equipped;
  const wDetail = eq.weapon_detail;
  const aDetail = eq.armour_detail;
  return (
    <Card title="Equipped" subtitle="What you're carrying right now."
      right={<Link to="/gun-store" className="btn btn-ghost text-xs">→ Gun Store</Link>}>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase text-ink-100/50">Weapon</div>
          <div className="font-medium">
            {eq.weapon === 'fists' ? 'Fists' : (wDetail?.name || eq.weapon)}
          </div>
          <div className="text-[11px] text-ink-100/60">
            {wDetail?.maker ? `${wDetail.maker} · ` : ''}
            DMG {wDetail?.dmg ?? 4}
            {wDetail?.ammoType ? ` · ${wDetail.ammoType}` : ' · melee'}
          </div>
          {wDetail?.ammoType && (
            <div className="text-[11px] mt-1 tabular-nums">
              <span className="text-ink-100/50">Rounds in pocket:</span>{' '}
              <span className={eq.weapon_ammo > 0 ? 'text-money-400' : 'text-blood-400'}>
                {eq.weapon_ammo}
              </span>
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase text-ink-100/50">Armour</div>
          <div className="font-medium">
            {eq.armour === 'none' ? 'No armour' : (aDetail?.name || eq.armour)}
          </div>
          <div className="text-[11px] text-ink-100/60">DEF {aDetail?.def ?? 0}</div>
        </div>
      </div>
    </Card>
  );
}

export default function Inventory() {
  const { character, refresh } = useGame();
  const [inv, setInv] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('overview');
  useScrollOnMessage(msg);

  async function load() {
    try { setInv(await api.get('/inventory')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function equip(kind, item_id) {
    setBusy(`eq-${kind}-${item_id}`); setMsg(null);
    try {
      await api.post('/inventory/equip', { kind, item_id });
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  // Use a misc / general-store item from the inventory directly. Reuses
  // the General Store's /use endpoint (it just decrements qty and applies
  // the item's effect — vitals, oneShotCash, or pure mission consumption).
  async function useMisc(item) {
    setBusy(`use-${item.id}`); setMsg(null);
    try {
      const r = await api.post('/general-store/use', { item_id: item.id });
      // Build the result message based on what the item *can* do, not on
      // raw response fields — mission items return cash:0 too, and we
      // don't want to mis-label them as "no win".
      const isCash = item.oneShotCash || item.prizes;
      let body = 'used';
      if (isCash) {
        if (r.jackpot) body = ` JACKPOT — +£${r.cash.toLocaleString()}!`;
        else if (r.cash > 0) body = `+£${r.cash.toLocaleString()}`;
        else body = 'no win';
      } else if (item.effects && r.applied) {
        const text = Object.entries(r.applied)
          .filter(([, v]) => v)
          .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`)
          .join(', ');
        body = text || 'no effect (already maxed)';
      }
      setMsg(`${item.emoji} ${item.name}: ${body}`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!inv) {
    return <div className="space-y-4 max-w-5xl mx-auto"><Card><p className="text-xs text-ink-100/55">Loading…</p></Card></div>;
  }
  const eq = inv.equipped;

  // Counts for the tab badges. Fists is always present so subtract one
  // so "Weapons: 0" shows when you've literally only got bare hands.
  const counts = {
    weapons:  Math.max(0, inv.weapons.filter(w => w.id !== 'fists').length),
    armour:   inv.armours.length,
    ammo:     inv.ammo.reduce((n, a) => n + (a.qty || 0), 0),
    drugs:    inv.drugs.reduce((n, d) => n + (d.qty || 0), 0),
    items:    inv.misc.reduce((n, m) => n + (m.qty || 0), 0),
    vehicles: inv.vehicles.length,
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      <Card title=" Inventory" subtitle="Every item, weapon, vehicle and stash you own.">
        <div className="flex flex-wrap gap-2">
          {TABS.map(t => {
            const n = counts[t.id];
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs flex items-center ${tab === t.id ? 'bg-blood-700 text-white' : 'bg-ink-800/40 text-ink-100/70 hover:bg-ink-800/70'}`}>
                {t.label}
                {n != null && <CountBadge n={n} tone={tab === t.id ? 'blood' : 'ink'} />}
              </button>
            );
          })}
        </div>
      </Card>

      {/*  Overview  */}
      {tab === 'overview' && (
        <>
          <EquippedSummary inv={inv} />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card title=" Weapons" right={<button onClick={() => setTab('weapons')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.weapons}</div>
              <div className="text-[11px] text-ink-100/55">in your stash</div>
            </Card>
            <Card title=" Armour" right={<button onClick={() => setTab('armour')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.armour}</div>
              <div className="text-[11px] text-ink-100/55">vests / jackets</div>
            </Card>
            <Card title=" Ammo" right={<button onClick={() => setTab('ammo')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.ammo}</div>
              <div className="text-[11px] text-ink-100/55">rounds total</div>
            </Card>
            <Card title=" Drugs" right={<button onClick={() => setTab('drugs')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.drugs}</div>
              <div className="text-[11px] text-ink-100/55">units on you</div>
            </Card>
            <Card title=" Items" right={<button onClick={() => setTab('items')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.items}</div>
              <div className="text-[11px] text-ink-100/55">misc / shop-bought</div>
            </Card>
            <Card title=" Vehicles" right={<button onClick={() => setTab('vehicles')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.vehicles}</div>
              <div className="text-[11px] text-ink-100/55">in garages worldwide</div>
            </Card>
          </div>
        </>
      )}

      {/*  Weapons  */}
      {tab === 'weapons' && (
        <Card title=" Weapons"
          subtitle="Equip one at a time. Ranged weapons need ammo of the matching type."
          right={<Link to="/customize/weapons" className="btn btn-ghost text-xs"> Customize</Link>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className={`rounded-lg p-3 border ${eq.weapon === 'fists' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
              <div className="font-medium">Fists</div>
              <div className="text-[11px] text-ink-100/60">DMG 4 · melee</div>
              {eq.weapon === 'fists'
                ? <div className="text-[10px] uppercase mt-2 text-blood-300">equipped</div>
                : <button className="btn text-xs w-full mt-2" onClick={() => equip('weapon', 'fists')}>Equip</button>}
            </div>
            {inv.weapons.filter(w => w.id !== 'fists').map(w => (
              <div key={w.id} className={`rounded-lg p-3 border ${eq.weapon === w.id ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{w.name}</div>
                  {w.qty > 1 && <span className="text-[10px] text-ink-100/50">×{w.qty}</span>}
                </div>
                {w.maker && <div className="text-[10px] text-ink-100/50">{w.maker}</div>}
                <div className="text-[11px] text-ink-100/60">DMG {w.dmg}{w.ammoType ? ` · ${w.ammoType}` : ' · melee'}</div>
                {eq.weapon === w.id
                  ? <div className="text-[10px] uppercase mt-2 text-blood-300">equipped</div>
                  : <button disabled={busy === `eq-weapon-${w.id}`} className="btn btn-primary text-xs w-full mt-2" onClick={() => equip('weapon', w.id)}>Equip</button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/*  Armour  */}
      {tab === 'armour' && (
        <Card title=" Armour" subtitle="Reduces damage taken from incoming attacks.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className={`rounded-lg p-3 border ${eq.armour === 'none' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
              <div className="font-medium">No Armour</div>
              <div className="text-[11px] text-ink-100/60">DEF 0</div>
              {eq.armour === 'none'
                ? <div className="text-[10px] uppercase mt-2 text-blood-300">equipped</div>
                : <button className="btn text-xs w-full mt-2" onClick={() => equip('armour', 'none')}>Unequip</button>}
            </div>
            {inv.armours.map(a => (
              <div key={a.id} className={`rounded-lg p-3 border ${eq.armour === a.id ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{a.name}</div>
                  {a.qty > 1 && <span className="text-[10px] text-ink-100/50">×{a.qty}</span>}
                </div>
                <div className="text-[11px] text-ink-100/60">DEF {a.def}</div>
                {eq.armour === a.id
                  ? <div className="text-[10px] uppercase mt-2 text-blood-300">equipped</div>
                  : <button disabled={busy === `eq-armour-${a.id}`} className="btn btn-primary text-xs w-full mt-2" onClick={() => equip('armour', a.id)}>Equip</button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/*  Ammo  */}
      {tab === 'ammo' && (
        <Card title=" Ammo on hand" subtitle="Restock at the Gun Store."
          right={<Link className="btn btn-ghost text-xs" to="/gun-store">→ Gun Store</Link>}>
          {!inv.ammo.length ? (
            <p className="text-sm text-ink-100/60">No ammo. Pick some up at the Gun Store.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {inv.ammo.map(a => {
                const isEquippedType = eq.weapon_detail?.ammoType === a.id;
                return (
                  <div key={a.id} className={`rounded-lg p-3 border ${isEquippedType ? 'border-yellow-600/60 bg-yellow-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[11px] text-ink-100/60 tabular-nums">{a.qty} rounds</div>
                    {isEquippedType && (
                      <div className="text-[10px] uppercase mt-1 text-yellow-300">for equipped weapon</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/*  Drugs  */}
      {tab === 'drugs' && (
        <Card title=" Drugs" subtitle="Buy low, fly somewhere, sell high. Listed by quantity on you."
          right={<Link className="btn btn-ghost text-xs" to="/drugs">→ Drug Market</Link>}>
          {!inv.drugs.length ? (
            <p className="text-sm text-ink-100/60">You're carrying nothing. Hit the drug market.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {inv.drugs.map(d => (
                <div key={d.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-[11px] text-ink-100/60 tabular-nums">{d.qty} units</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/*  Misc / general-store items  */}
      {tab === 'items' && (
        <Card title=" Items" subtitle="Shop-bought misc gear — most are mission props, a few have everyday uses."
          right={<Link className="btn btn-ghost text-xs" to="/general-store">→ General Store</Link>}>
          {!inv.misc.length ? (
            <p className="text-sm text-ink-100/60">Nothing in the kit bag.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inv.misc.map(m => (
                <div key={m.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40 flex flex-col">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-medium">{m.emoji} {m.name}</div>
                    <span className="text-[11px] text-ink-100/60 tabular-nums">×{m.qty}</span>
                  </div>
                  {m.desc && <div className="text-[11px] text-ink-100/55 mt-1 flex-1">{m.desc}</div>}
                  <button
                    disabled={busy === `use-${m.id}` || m.qty <= 0}
                    onClick={() => useMisc(m)}
                    className="btn btn-money text-xs w-full mt-3">
                    {busy === `use-${m.id}` ? '…' : 'Use'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/*  Vehicles  */}
      {tab === 'vehicles' && (
        <Card title=" Vehicles" subtitle={`${inv.vehicles.length} cars across your garages — sell stolen ones at the Chop Shop, trade in legit ones the same place.`}
          right={
            <div className="flex gap-2 text-xs">
              <Link className="btn btn-ghost" to="/customize/vehicles"> Customize</Link>
              <Link className="btn btn-ghost" to="/dealership">→ Car Dealer</Link>
              <Link className="btn btn-ghost" to="/chop-shop">→ Chop Shop</Link>
            </div>
          }>
          {inv.garages?.length > 0 && (
            <div className="mb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px]">
              {inv.garages.map(g => (
                <div key={g.city} className="rounded-md border border-ink-100/10 bg-ink-950/40 px-2 py-1.5">
                  <div className="text-ink-100/60">{g.cityName}</div>
                  <div className={`tabular-nums ${g.free === 0 ? 'text-blood-400' : 'text-ink-50'}`}>
                    {g.used}/{g.capacity} <span className="text-ink-100/40">cars</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!inv.vehicles.length ? (
            <p className="text-sm text-ink-100/60">No vehicles yet. Steal one or buy from the dealership.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inv.vehicles.map(v => (
                <VehicleCard key={v.id} v={v} garages={inv.garages || []}
                  currentCity={character?.city}
                  hasActive={!!character?.active_vehicle_id}
                  onChange={async () => { await load(); await refresh(); }} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
