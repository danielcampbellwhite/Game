import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// House hub. Tabbed view of the property the player is currently
// standing inside (current_location matches /^home_\d+$/). Falls back
// to a "you're not at home" guard otherwise.

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'stash',    label: 'Stash'    },
  { id: 'upgrades', label: 'Upgrades' },
];

export default function House() {
  const { character } = useGame();
  const [tab, setTab] = useState('overview');

  if (!character) return null;
  const atHome = /^home_\d+$/.test(character.current_location || '');
  if (!atHome) {
    return (
      <Card title="You're not at home"
        subtitle="Open one of your homes from the City tile list or the inventory to manage stash and upgrades.">
        <div className="flex gap-2 flex-wrap">
          <Link to="/city" className="btn btn-primary text-xs">City map</Link>
          <Link to="/property" className="btn btn-ghost text-xs">Estate Agent</Link>
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
      {tab === 'overview' && <OverviewTab />}
      {tab === 'stash'    && <StashTab />}
      {tab === 'upgrades' && <UpgradesTab />}
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState(null);
  const [msg, setMsg]   = useState(null);
  useEffect(() => {
    api.get('/house').then(setData).catch(e => setMsg(e.message));
  }, []);
  if (!data) return <Card><p className="text-xs text-ink-100/55">{msg || 'Loading…'}</p></Card>;
  const p = data.property;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display text-xl text-ink-50">{p.name}</h3>
        {p.tierLabel && <span className="text-[11px] uppercase tracking-wide text-ink-100/55">{p.tierLabel}</span>}
      </div>
      {p.address && <p className="text-[12px] text-ink-100/55">{p.address} · {p.cityName}</p>}

      <div className="grid sm:grid-cols-3 gap-2 mt-3">
        <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-2 py-1.5">
          <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Garage</div>
          <div className="text-sm tabular-nums text-ink-100">{p.garage} slot{p.garage === 1 ? '' : 's'}</div>
        </div>
        <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-2 py-1.5">
          <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Defence</div>
          <div className="text-sm tabular-nums text-ink-100">{p.defence}</div>
        </div>
        <div className="rounded-md bg-ink-900/40 border border-ink-100/10 px-2 py-1.5">
          <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Book value</div>
          <div className="text-sm tabular-nums text-money-400 font-medium">{fmt(p.bookCost + p.modsValue)}</div>
          {p.modsValue > 0 && (
            <div className="text-[11px] text-ink-100/50">
              base {fmt(p.bookCost)} +{fmt(p.modsValue)} mods
            </div>
          )}
        </div>
      </div>

      {p.bonuses && Object.keys(p.bonuses).length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-100/55 mb-1">Property bonuses (in this city)</div>
          <ul className="text-xs text-ink-100/85 space-y-0.5">
            {Object.entries(p.bonuses).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="tabular-nums text-money-300">+{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.fittedMods.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-100/55 mb-1">Fitted upgrades</div>
          <ul className="text-xs text-ink-100/85 space-y-0.5">
            {data.fittedMods.map(m => (
              <li key={m.slot} className="flex justify-between border-b border-ink-100/5 py-1 last:border-0">
                <span><span className="uppercase tracking-wide text-ink-100/55 mr-1">{m.slot}</span> {m.name}</span>
                <span className="text-ink-100/55 tabular-nums">{fmt(m.cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function StashTab() {
  const { character, refresh } = useGame();
  const [inv, setInv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState(null);
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
  if (!w?.house_owned) return <Card><p className="text-xs">No house stash in this city.</p></Card>;

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

      <Card title={`House stash`}
        subtitle={`${(inv.house_stash || []).length} item types · ${w.house_kg.toFixed(1)} / ${w.house_cap_kg.toLocaleString()} kg.`}>
        {(inv.house_stash || []).length === 0 ? (
          <p className="text-xs text-ink-100/45">Nothing here yet. Move heavy gear off your person to free up carry weight.</p>
        ) : (
          <div className="divide-y divide-ink-100/5">
            {inv.house_stash.map(it => (
              <div key={`${it.kind}:${it.item_id}`} className="py-2 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{it.name}</div>
                  <div className="text-[12px] text-ink-100/45">{it.kind} · ×{it.qty}</div>
                </div>
                <button
                  disabled={busy}
                  onClick={() => transfer(it.kind, it.item_id, it.qty, 'house', 'personal')}
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
                        onClick={() => transfer(g.kind, it.id, it.qty, 'personal', 'house')}
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

function UpgradesTab() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/house')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function install(mod_id) {
    setBusy(`install-${mod_id}`); setMsg(null);
    try {
      await api.post('/house/install-mod', { mod_id });
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function uninstall(slot) {
    if (!window.confirm(`Strip the ${slot} mod out? No refund.`)) return;
    setBusy(`uninstall-${slot}`); setMsg(null);
    try {
      await api.post('/house/uninstall-mod', { slot });
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">{msg || 'Loading…'}</p></Card>;

  const fittedBySlot = Object.fromEntries(data.fittedMods.map(m => [m.slot, m]));
  const modsBySlot = (data.modsCatalogue || []).reduce(
    (m, mod) => ((m[mod.slot] = m[mod.slot] || []).push(mod), m), {}
  );

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title="Property upgrades"
        subtitle="Each slot takes one upgrade. Installing replaces what was there. Higher tier = stronger defence + property value.">
        <div className="space-y-3">
          {(data.slots || []).map(slot => {
            const compat = modsBySlot[slot] || [];
            const fitted = fittedBySlot[slot];
            return (
              <div key={slot} className="rounded-md border border-ink-100/10 bg-ink-950/40 p-2">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-[11px] uppercase tracking-wide text-ink-100/55">{slot}</div>
                  {fitted && (
                    <button
                      disabled={busy === `uninstall-${slot}`}
                      onClick={() => uninstall(slot)}
                      className="text-[11px] text-blood-300 hover:text-blood-200 underline">
                      {busy === `uninstall-${slot}` ? '…' : 'Strip out'}
                    </button>
                  )}
                </div>
                {fitted ? (
                  <div className="text-xs text-money-300 mb-2">Fitted: <b>{fitted.name}</b></div>
                ) : (
                  <div className="text-xs text-ink-100/55 mb-2">No upgrade installed.</div>
                )}
                {compat.length === 0 ? (
                  <p className="text-[11px] text-ink-100/40">No upgrades for this slot.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {compat.map(mod => {
                      const broke = character.cash < mod.cost;
                      const same = fitted?.id === mod.id;
                      return (
                        <button key={mod.id}
                          disabled={busy === `install-${mod.id}` || same || broke}
                          onClick={() => install(mod.id)}
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
    </div>
  );
}
