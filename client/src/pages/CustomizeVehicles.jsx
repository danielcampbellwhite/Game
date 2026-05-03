import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const SLOT_LABEL = {
  engine:   'Engine',
  tires:    'Tires',
  paint:    'Paint',
  body:     'Body',
  exhaust:  'Exhaust',
  interior: 'Interior',
};

function VehicleRow({ v, picked, onPick }) {
  const isPicked = picked === v.id;
  return (
    <button onClick={() => onPick(v.id)}
      className={`text-left rounded-lg p-3 border bg-ink-950/40 hover:border-blood-500/40 transition w-full ${isPicked ? 'border-money-500/60' : 'border-ink-100/10'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium truncate">{v.maker} {v.name}</div>
        {v.is_modified && <span className="text-[10px] uppercase text-yellow-300">🔧 modded</span>}
      </div>
      <div className="text-[11px] text-ink-100/55">Tier {v.tier} · {v.acquired_via === 'stolen' ? '🥷 stolen' : '💼 bought'}</div>
      <div className="text-[11px] text-ink-100/55">
        Book: <b className="text-money-400">{fmt(v.book_price)}</b>
        {v.value_delta > 0 && <span className="text-money-400/70"> (+{fmt(v.value_delta)} from mods)</span>}
      </div>
      {v.power > 0 || v.handling > 0 ? (
        <div className="text-[10px] text-ink-100/55 mt-0.5">
          {v.power > 0 && <span>+{v.power} pwr </span>}
          {v.handling > 0 && <span>+{v.handling} hndl</span>}
        </div>
      ) : null}
    </button>
  );
}

function ModPicker({ slot, currentModId, compatible, busy, onInstall, character }) {
  const slotMods = compatible.filter(m => m.slot === slot);
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-ink-100/55">{SLOT_LABEL[slot]} slot</div>
      {slotMods.length === 0 ? (
        <p className="text-[11px] text-ink-100/45">No {slot} mods compatible with this vehicle's tier.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {slotMods.map(m => {
            const isCurrent = m.id === currentModId;
            const cantAfford = (character?.cash || 0) < m.cost;
            return (
              <div key={m.id} className={`rounded-md p-2 border ${isCurrent ? 'border-money-500 bg-money-700/10' : 'border-ink-100/10 bg-ink-950/30'}`}>
                <div className="flex items-baseline justify-between gap-1">
                  <div className="text-sm font-medium">{m.emoji} {m.name}</div>
                  <div className="text-[11px] text-money-400 tabular-nums shrink-0">{fmt(m.cost)}</div>
                </div>
                <div className="text-[10px] text-ink-100/55 mt-0.5">
                  {m.stats?.power ? `+${m.stats.power} pwr · ` : ''}
                  {m.stats?.handling ? `+${m.stats.handling} hndl · ` : ''}
                  {m.stats?.value ? `+${fmt(m.stats.value)} value` : ''}
                  {m.min_tier > 1 && <span className="ml-1 text-ink-100/40">(tier {m.min_tier}+)</span>}
                </div>
                {isCurrent ? (
                  <div className="text-[10px] uppercase text-money-400 mt-1">installed</div>
                ) : (
                  <button onClick={() => onInstall(slot, m.id)} disabled={busy || cantAfford}
                    className="btn btn-primary text-xs w-full mt-2">
                    {busy ? '…' : cantAfford ? `Need ${fmt(m.cost)}` : `Install · ${fmt(m.cost)}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VehicleDetail({ id, character, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get(`/customize/vehicles/${id}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function install(slot, modId) {
    setBusy('install'); setMsg(null);
    try {
      await api.post('/customize/vehicles/install', { id, slot, mod_id: modId });
      await onChanged();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function uninstall(slot) {
    setBusy('un-' + slot); setMsg(null);
    try {
      await api.delete(`/customize/vehicles/${id}/slot/${slot}`);
      await onChanged();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading vehicle…</p></Card>;
  const v = data.vehicle;
  const installedMap = {};
  for (const m of (v.mods || [])) installedMap[m.slot] = m.id;

  return (
    <div className="space-y-4">
      <Card title={`${v.maker} ${v.name}`}
        subtitle={`Tier ${v.tier} · ${v.cityName} · ${v.acquired_via === 'stolen' ? '🥷 stolen' : '💼 bought'}`}>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase text-ink-100/55">Book value</div>
            <div className="font-display text-2xl text-money-400 tabular-nums">{fmt(v.book_price)}</div>
            <div className="text-[10px] text-ink-100/55">base {fmt(v.base_book_price)}{v.value_delta > 0 && ` · +${fmt(v.value_delta)} from mods`}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/55">Power</div>
            <div className="font-display text-2xl tabular-nums">+{v.power}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/55">Handling</div>
            <div className="font-display text-2xl tabular-nums">+{v.handling}</div>
          </div>
        </div>
        {v.is_modified && (
          <p className="text-[11px] text-yellow-300 mt-3">
            🔧 Modified — chop shop and dealer won't take this. Sell to other players via your shop.
          </p>
        )}
        {msg && <p className="text-xs text-blood-400 mt-2">{msg}</p>}
      </Card>

      {(data.slots || []).map(slot => (
        <Card key={slot} title={`${SLOT_LABEL[slot]} slot`}>
          {installedMap[slot] && (
            <div className="mb-3 rounded-md border border-money-500/40 bg-money-700/10 p-2 flex items-center justify-between">
              <span className="text-sm">{data.compatible_mods.find(m => m.id === installedMap[slot])?.name || installedMap[slot]}</span>
              <button onClick={() => uninstall(slot)} disabled={busy === 'un-' + slot}
                className="btn btn-ghost text-xs">{busy === 'un-' + slot ? '…' : 'Uninstall'}</button>
            </div>
          )}
          <ModPicker slot={slot} currentModId={installedMap[slot]} compatible={data.compatible_mods} busy={busy === 'install'} onInstall={install} character={character} />
        </Card>
      ))}
    </div>
  );
}

export default function CustomizeVehicles() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try {
      const r = await api.get('/customize/vehicles');
      setData(r);
      if (!pickedId && r.vehicles[0]) setPickedId(r.vehicles[0].id);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card title="🔧 Vehicle Customization"
        subtitle="Install engine / tires / paint / body / exhaust / interior mods. Customised cars can only be sold to other players — chop shop & dealer won't touch them."
        right={<Link to="/inventory" className="btn btn-ghost text-xs">← Inventory</Link>}>
        {msg && <p className="text-xs text-blood-400">{msg}</p>}
      </Card>

      {data.vehicles.length === 0 ? (
        <Card><p className="text-xs text-ink-100/55 text-center py-6">
          No vehicles to modify. Steal one from a GTA crime, or buy from the dealership.
        </p></Card>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          <Card title="Your garage">
            <div className="space-y-2">
              {data.vehicles.map(v => (
                <VehicleRow key={v.id} v={v} picked={pickedId} onPick={setPickedId} />
              ))}
            </div>
          </Card>
          {pickedId && (
            <VehicleDetail id={pickedId} character={character}
              onChanged={async () => { await refresh(); await load(); }} />
          )}
        </div>
      )}
    </div>
  );
}
