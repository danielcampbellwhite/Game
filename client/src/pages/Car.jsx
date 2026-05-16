import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Active-car hub. Quick-access tabbed page for whatever the player is
// driving: status overview, cargo transfer, mod management, and travel
// (intra-city + intercity). Shows a friendly redirect when the player
// isn't currently driving anything.

const TABS = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'inventory', label: 'Inventory' },
  { id: 'mods',      label: 'Mods'      },
  { id: 'drive',     label: 'Drive'     },
];

export default function Car() {
  const { character } = useGame();
  const [tab, setTab] = useState('overview');

  if (!character) return null;
  if (!character.active_vehicle_id) {
    return (
      <Card title="No active car"
        subtitle="You're not driving anything right now. Equip a car from your inventory or buy one at the dealership.">
        <div className="flex gap-2 flex-wrap">
          <Link to="/inventory" className="btn btn-primary text-xs">Inventory</Link>
          <Link to="/dealership" className="btn btn-ghost text-xs">Dealership</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-xs overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t.id ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview'  && <OverviewTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'mods'      && <ModsTab />}
      {tab === 'drive'     && <DriveTab />}
    </div>
  );
}

function OverviewTab() {
  const { character, refresh } = useGame();
  const [inv, setInv] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setInv(await api.get('/inventory')); }
  useEffect(() => { load(); }, []);

  async function refuel() {
    setBusy('refuel'); setMsg(null);
    try {
      const r = await api.post('/vehicles/refill', {});
      setMsg(`Refuelled — paid ${fmt(r.cost)}.`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!inv) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const car = inv.vehicles.find(v => v.id === character.active_vehicle_id);
  if (!car) return <Card><p className="text-xs">Active car not found.</p></Card>;

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h3 className="font-display text-xl text-ink-50">{car.maker} {car.name}</h3>
          <span className="text-[11px] uppercase tracking-wide text-ink-100/55">Tier {car.tier}</span>
        </div>
        <p className="text-[12px] text-ink-100/55">In {car.cityName}.</p>

        <div className="grid sm:grid-cols-3 gap-2 mt-3">
          <Bar label="Condition" pct={car.condition} good="bg-money-400" warn="bg-yellow-400" bad="bg-blood-500" />
          <Bar label="Fuel"      pct={car.fuel}      good="bg-cyan-400"  warn="bg-yellow-400" bad="bg-blood-500" />
          <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-2 py-1.5">
            <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Book value</div>
            <div className="text-sm tabular-nums text-money-400 font-medium">{fmt(car.bookPrice)}</div>
            {car.value_delta ? (
              <div className="text-[11px] text-ink-100/50">
                base {fmt(car.base_book_price)} {car.value_delta > 0 ? '+' : ''}{fmt(car.value_delta)} mods
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            disabled={busy === 'refuel' || car.fuel >= 100}
            onClick={refuel}
            className="btn btn-primary text-xs">
            {busy === 'refuel' ? '…' : car.fuel >= 100 ? 'Tank full' : 'Refuel'}
          </button>
          <Link to="/repair" className="btn btn-ghost text-xs">Repair shop</Link>
        </div>
      </Card>

      {car.is_modified && (
        <Card title="Installed mods" subtitle={`${car.mods.length} mod${car.mods.length === 1 ? '' : 's'} fitted.`}>
          <ul className="text-xs space-y-1">
            {car.mods.map(m => (
              <li key={m.slot} className="flex justify-between border-b border-ink-100/5 py-1 last:border-0">
                <span className="text-ink-100/85"><span className="uppercase tracking-wide text-ink-100/55 mr-1">{m.slot}</span> {m.name}</span>
                <span className="text-ink-100/55 tabular-nums">+{fmt(m.value_delta)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function InventoryTab() {
  const { character, refresh } = useGame();
  const [inv, setInv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setInv(await api.get('/inventory')); }
  useEffect(() => { load(); }, []);

  async function transfer(kind, item_id, qty, from, to) {
    setBusy(true); setMsg(null);
    try {
      await api.post('/inventory/transfer', { kind, item_id, qty, from, to });
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!inv) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const w = inv.weight;
  if (!w?.vehicle_active) return <Card><p className="text-xs">No active vehicle cargo to manage.</p></Card>;

  // Personal items that are stash-able into the vehicle.
  const personalGroups = [
    { label: 'Weapons', kind: 'weapon', items: inv.weapons.filter(i => i.id !== 'fists') },
    { label: 'Armour',  kind: 'armour', items: inv.armours },
    { label: 'Ammo',    kind: 'ammo',   items: inv.ammo },
    { label: 'Drugs',   kind: 'drug',   items: inv.drugs },
    { label: 'Items',   kind: 'misc',   items: inv.misc },
  ];

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title={`Cargo — ${w.vehicle_name}`}
        subtitle={`${(inv.vehicle_stash || []).length} item types · ${w.vehicle_kg.toFixed(1)} / ${w.vehicle_cap_kg.toFixed(0)} kg.`}>
        {(inv.vehicle_stash || []).length === 0 ? (
          <p className="text-xs text-ink-100/45">Empty boot. Drop heavy gear from your pockets to lighten the load.</p>
        ) : (
          <div className="divide-y divide-ink-100/5">
            {inv.vehicle_stash.map(it => (
              <div key={`${it.kind}:${it.item_id}`} className="py-2 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{it.name}</div>
                  <div className="text-[12px] text-ink-100/45">{it.kind} · ×{it.qty}</div>
                </div>
                <button
                  disabled={busy}
                  onClick={() => transfer(it.kind, it.item_id, it.qty, 'vehicle', 'personal')}
                  className="btn btn-primary text-[11px] py-1 shrink-0">
                  Take {it.qty}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Stash from pockets"
        subtitle={`On your person: ${w.personal_kg.toFixed(1)} / ${w.personal_cap_kg.toFixed(0)} kg.`}>
        {personalGroups.every(g => g.items.length === 0) ? (
          <p className="text-xs text-ink-100/45">Nothing to stash — you aren't carrying anything.</p>
        ) : (
          <div className="space-y-3">
            {personalGroups.filter(g => g.items.length > 0).map(g => (
              <div key={g.kind}>
                <div className="text-[11px] uppercase tracking-wide text-ink-100/55 mb-1">{g.label}</div>
                <div className="divide-y divide-ink-100/5">
                  {g.items.map(it => (
                    <div key={it.id} className="py-1.5 flex items-baseline justify-between gap-3">
                      <div className="min-w-0 text-sm truncate">{it.name} <span className="text-ink-100/45 text-[11px]">×{it.qty}</span></div>
                      <button
                        disabled={busy}
                        onClick={() => transfer(g.kind, it.id, it.qty, 'personal', 'vehicle')}
                        className="btn btn-ghost text-[11px] py-1 shrink-0">
                        Stash {it.qty}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ModsTab() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get(`/customize/vehicles/${character.active_vehicle_id}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [character?.active_vehicle_id]);

  async function install(slot, mod_id) {
    setBusy(`${slot}-${mod_id}`); setMsg(null);
    try {
      await api.post('/customize/vehicles/install', { id: character.active_vehicle_id, slot, mod_id });
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">{msg || 'Loading…'}</p></Card>;

  const v = data.vehicle;
  const modsByCompat = (data.compatible_mods || []).reduce((m, mod) => ((m[mod.slot] = m[mod.slot] || []).push(mod), m), {});
  const installed = Object.fromEntries((v.mods || []).map(m => [m.slot, m]));

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title={`${v.maker} ${v.name} — mods`}
        subtitle="Each slot takes one mod at a time. Installing a mod replaces whatever was in that slot.">
        <div className="space-y-3">
          {(data.slots || []).map(slot => {
            const compat = modsByCompat[slot] || [];
            const fitted = installed[slot];
            return (
              <div key={slot} className="rounded-md border border-ink-100/10 bg-ink-950/40 p-2">
                <div className="text-[11px] uppercase tracking-wide text-ink-100/55 mb-1">{slot}</div>
                {fitted ? (
                  <div className="text-xs text-money-300 mb-2">
                    Fitted: <b>{fitted.name}</b> · +{fmt(fitted.value_delta)} value
                  </div>
                ) : (
                  <div className="text-xs text-ink-100/55 mb-2">No mod installed.</div>
                )}
                {compat.length === 0 ? (
                  <p className="text-[11px] text-ink-100/40">No compatible mods for this slot.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {compat.map(mod => {
                      const broke = character.cash < mod.cost;
                      const same = fitted?.id === mod.id;
                      return (
                        <button key={mod.id}
                          disabled={busy === `${slot}-${mod.id}` || same || broke}
                          onClick={() => install(slot, mod.id)}
                          className={`btn text-[11px] ${same ? 'btn-ghost opacity-60' : 'btn-primary'}`}>
                          {mod.name} · {fmt(mod.cost)}
                          {same && ' (fitted)'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-[11px] text-ink-100/45 text-center">
        Need to mod a different car? <Link to="/customize/vehicles" className="underline">Open the full garage</Link>.
      </p>
    </div>
  );
}

function DriveTab() {
  const { character, refresh } = useGame();
  const [locs, setLocs]       = useState(null);
  const [travel, setTravel]   = useState(null);
  const [busy, setBusy]       = useState(null);
  const [msg, setMsg]         = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try {
      const [l, t] = await Promise.all([api.get('/locations'), api.get('/travel')]);
      setLocs(l); setTravel(t);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function go(loc) {
    setBusy(`loc-${loc.slug}`); setMsg(null);
    try {
      await api.post('/locations/travel', { to: loc.slug, mode: 'drive' });
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function drive(city) {
    setBusy(`city-${city}`); setMsg(null);
    try {
      await api.post('/travel/drive', { city });
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!locs || !travel) return <Card><p className="text-xs text-ink-100/55">{msg || 'Loading…'}</p></Card>;

  const drives = travel.drives || [];

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title="Drive in town"
        subtitle={`Faster than walking — ${Math.round(locs.drive_ms / 1000)}s to anywhere in ${(character.city || '').replace(/_/g, ' ')}.`}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {locs.locations.filter(l => l.slug !== 'streets' && !l.here).map(loc => (
            <button key={loc.slug}
              disabled={busy === `loc-${loc.slug}` || locs.travelling}
              onClick={() => go(loc)}
              className="text-left rounded-lg p-2 border border-ink-100/10 bg-ink-950/40 hover:bg-ink-900/40">
              <div className="text-sm font-medium truncate">{loc.name}</div>
              <div className="text-[11px] text-ink-100/55 truncate">{loc.desc || '—'}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Drive between cities"
        subtitle="Bring your active car along. Uses fuel, chews condition.">
        {drives.length === 0 ? (
          <p className="text-xs text-ink-100/55">No roads out of here — that's a flight only.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {drives.map(d => (
              <div key={d.city}
                className={`rounded-lg p-3 border bg-ink-950/40 ${d.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
                <div className="flex items-baseline justify-between">
                  <div className="font-medium">{d.name}</div>
                  {!d.locked && <div className="text-[11px] text-ink-100/45 tabular-nums">{d.km.toLocaleString()} km</div>}
                </div>
                <div className="text-[12px] text-ink-100/55 mt-0.5">
                  {fmt(d.cost)} petrol · {Math.round(d.durationMs / 60000)} min · -{d.conditionCost.toFixed(1)}% condition
                </div>
                <button
                  disabled={d.locked || busy === `city-${d.city}` || character.cash < d.cost}
                  onClick={() => drive(d.city)}
                  className="btn btn-money w-full text-xs mt-2">
                  {d.locked ? 'Locked' : busy === `city-${d.city}` ? '…' : `Drive · ${fmt(d.cost)}`}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Bar({ label, pct, good = 'bg-money-400', warn = 'bg-yellow-400', bad = 'bg-blood-500' }) {
  const colour = pct >= 50 ? good : pct >= 20 ? warn : bad;
  return (
    <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-ink-100/55">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="flex-1 h-1.5 rounded-full bg-ink-800 overflow-hidden">
          <div className={colour} style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%' }} />
        </div>
        <span className="text-xs tabular-nums text-ink-100/65">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}
