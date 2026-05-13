import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const SLOT_LABEL = {
  barrel:   'Barrel',
  scope:    'Scope',
  magazine: 'Magazine',
  grip:     'Grip',
  paint:    'Paint',
};

function refOf(item) {
  return item.kind === 'instance' ? `instance:${item.instance_id}` : `stock:${item.base_item_id}`;
}

function WeaponRow({ item, equipped, onPick }) {
  const isEq = (equipped?.kind === 'instance' && item.kind === 'instance' && equipped.id === item.instance_id)
            || (equipped?.kind === 'stock'    && item.kind === 'stock'    && equipped.base_item_id === item.base_item_id);
  return (
    <button onClick={() => onPick(item)}
      className={`text-left rounded-lg p-3 border bg-ink-950/40 hover:border-blood-500/40 transition ${isEq ? 'border-money-500/60' : 'border-ink-100/10'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium">{item.base?.name || item.base_item_id}</div>
        <span className="text-[12px] text-ink-100/55">
          {item.kind === 'instance' ? ' modded' : `×${item.qty}`}
        </span>
      </div>
      {item.base?.maker && <div className="text-[12px] text-ink-100/50">{item.base.maker}</div>}
      <div className="text-[13px] text-ink-100/60">
        DMG <b>{item.stats.dmg}</b>
        {item.stats.accuracy > 0 && <span className="text-money-400"> · +{item.stats.accuracy} acc</span>}
        {item.base?.ammoType ? ` · ${item.base.ammoType}` : ' · melee'}
      </div>
      {item.stats.mods.length > 0 && (
        <div className="text-[12px] text-ink-100/55 mt-1 truncate">
          {item.stats.mods.map(m => `${m.emoji}${m.name}`).join(' · ')}
        </div>
      )}
      {isEq && <div className="text-[12px] text-money-400 mt-1"> equipped</div>}
    </button>
  );
}

function ModPicker({ slot, currentModId, compatible, busy, onInstall, character }) {
  const slotMods = compatible.filter(m => m.slot === slot);
  return (
    <div className="space-y-2">
      <div className="text-[12px] uppercase text-ink-100/55">{SLOT_LABEL[slot]} slot</div>
      {slotMods.length === 0 ? (
        <p className="text-[13px] text-ink-100/45">No {slot} mods compatible with this weapon.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {slotMods.map(m => {
            const isCurrent = m.id === currentModId;
            const cantAfford = (character?.cash || 0) < m.cost;
            return (
              <div key={m.id} className={`rounded-md p-2 border ${isCurrent ? 'border-money-500 bg-money-700/10' : 'border-ink-100/10 bg-ink-950/30'}`}>
                <div className="flex items-baseline justify-between gap-1">
                  <div className="text-sm font-medium">{m.emoji} {m.name}</div>
                  <div className="text-[13px] text-money-400 tabular-nums shrink-0">{fmt(m.cost)}</div>
                </div>
                <div className="text-[12px] text-ink-100/55 mt-0.5">
                  {m.stats?.dmg ? `${m.stats.dmg > 0 ? '+' : ''}${m.stats.dmg} dmg` : ''}
                  {m.stats?.dmg && m.stats?.accuracy ? ' · ' : ''}
                  {m.stats?.accuracy ? `${m.stats.accuracy > 0 ? '+' : ''}${m.stats.accuracy} acc` : ''}
                  {!m.stats?.dmg && !m.stats?.accuracy && 'cosmetic'}
                </div>
                {isCurrent ? (
                  <div className="text-[12px] uppercase text-money-400 mt-1">installed</div>
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

function DetailPane({ pickRef, character, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get(`/customize/weapons/${pickRef}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [pickRef]);

  async function install(slot, modId) {
    setBusy('install'); setMsg(null);
    try {
      const r = await api.post('/customize/weapons/install', { ref: pickRef, slot, mod_id: modId });
      // After installing on a stock, ref switches to the new instance.
      if (r.instance) onChanged(`instance:${r.instance.instance_id}`);
      else onChanged(pickRef);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function uninstall(slot) {
    setBusy('uninstall-' + slot); setMsg(null);
    try {
      const id = data?.instance_id;
      if (!id) return;
      const r = await api.delete(`/customize/weapons/instance/${id}/slot/${slot}`);
      if (r.demoted) onChanged(`stock:${data.base_item_id}`);
      else await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function equip() {
    setBusy('equip'); setMsg(null);
    try {
      await api.post('/customize/weapons/equip', { ref: pickRef });
      onChanged(pickRef);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading weapon…</p></Card>;

  const installedMap = {};
  for (const m of (data.stats?.mods || [])) installedMap[m.slot] = m.id;

  return (
    <div className="space-y-4">
      <Card title={data.base?.name || data.base_item_id}
        subtitle={`${data.base?.maker ? data.base.maker + ' · ' : ''}${data.base?.category || ''}${data.base?.ammoType ? ` · ${data.base.ammoType}` : ''}`}
        right={<button onClick={equip} disabled={busy === 'equip'} className="btn btn-money text-xs">{busy === 'equip' ? '…' : 'Equip'}</button>}>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Damage</div>
            <div className="font-display text-2xl tabular-nums">{data.stats?.dmg ?? data.base?.dmg_base ?? 4}</div>
            <div className="text-[12px] text-ink-100/55">base {data.base?.dmg_base ?? 0}</div>
          </div>
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Accuracy</div>
            <div className="font-display text-2xl tabular-nums">+{data.stats?.accuracy || 0}</div>
            <div className="text-[12px] text-ink-100/55">from mods</div>
          </div>
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Status</div>
            <div className="text-sm">{data.stats?.is_modified ? ' Modified' : 'Stock'}</div>
            {data.kind === 'stock' && <div className="text-[12px] text-ink-100/55">×{data.qty} in stack</div>}
          </div>
        </div>
        {msg && <p className="text-xs text-blood-400 mt-2">{msg}</p>}
      </Card>

      {(data.slots || []).map(slot => (
        <Card key={slot} collapsible title={`${SLOT_LABEL[slot]} slot`}>
          {installedMap[slot] && data.kind === 'instance' && (
            <div className="mb-3 rounded-md border border-money-500/40 bg-money-700/10 p-2 flex items-center justify-between">
              <span className="text-sm">{data.compatible_mods.find(m => m.id === installedMap[slot])?.name}</span>
              <button onClick={() => uninstall(slot)} disabled={busy === 'uninstall-' + slot}
                className="btn btn-ghost text-xs">{busy === 'uninstall-' + slot ? '…' : 'Uninstall'}</button>
            </div>
          )}
          <ModPicker slot={slot} currentModId={installedMap[slot]} compatible={data.compatible_mods} busy={busy === 'install'} onInstall={install} character={character} />
        </Card>
      ))}
    </div>
  );
}

export default function CustomizeWeapons() {
  const { character, refresh } = useGame();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [pickRef, setPickRef] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try {
      const r = await api.get('/customize/weapons');
      setData(r);
      if (!pickRef) {
        const first = r.instances[0] ? `instance:${r.instances[0].instance_id}`
                    : r.stocks[0] ? `stock:${r.stocks[0].base_item_id}`
                    : null;
        if (first) setPickRef(first);
      }
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const allItems = [...data.instances, ...data.stocks];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card title=" Weapon Customization"
        subtitle="Modify weapons with category-compatible mods. Stock weapons promote to a unique instance the moment you install your first mod. Removing all mods returns the weapon to your stack."
        right={<Link to="/inventory" className="btn btn-ghost text-xs">← Inventory</Link>}>
        {msg && <p className="text-xs text-blood-400">{msg}</p>}
      </Card>

      {allItems.length === 0 ? (
        <Card><p className="text-xs text-ink-100/55 text-center py-6">
          No weapons to modify. Buy one from the Gun Store first.
        </p></Card>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4">
          <Card title="Your weapons">
            <div className="space-y-2">
              {allItems.map(item => (
                <WeaponRow key={refOf(item)} item={item}
                  equipped={data.equipped}
                  onPick={(it) => setPickRef(refOf(it))} />
              ))}
            </div>
          </Card>
          {pickRef && (
            <DetailPane pickRef={pickRef} character={character}
              onChanged={async (newRef) => {
                if (newRef) setPickRef(newRef);
                await refresh();
                await load();
              }} />
          )}
        </div>
      )}
    </div>
  );
}
