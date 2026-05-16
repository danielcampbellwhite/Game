import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import ClothingSvg from '../components/ClothingSvg.jsx';
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
  const inTransit = !!v.shipping_until;

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
    <div className={`min-w-0 rounded-lg p-3 border bg-ink-950/40 overflow-hidden ${
      v.is_active ? 'border-money-500/60 bg-money-600/10'
        : v.is_modified ? 'border-yellow-500/40' : 'border-ink-100/10'
    }`}>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <div className="font-medium truncate min-w-0">{v.maker} {v.name}</div>
        {v.is_active && <span className="text-[12px] uppercase tracking-wide text-money-300 shrink-0">driving</span>}
        {!v.is_active && v.is_modified && <span className="text-[12px] uppercase text-yellow-300 shrink-0">modded</span>}
      </div>
      <div className="text-[13px] text-ink-100/60 truncate">
        Tier {v.tier} · book {fmt(v.bookPrice)}
        {v.value_delta > 0 && <span className="text-money-400/70"> (+{fmt(v.value_delta)})</span>}
      </div>
      <div className="text-[12px] text-ink-100/40 mt-0.5 truncate">
        {v.acquired_via === 'stolen' ? 'stolen' : 'bought'} · {
          v.is_active
            ? 'with you'
            : inTransit
              ? <>in transit to {v.cityName} · <Timer until={v.shipping_until} prefix="arrives in " onExpire={onChange} /></>
              : `garaged in ${v.cityName}`
        }
      </div>
      {typeof v.condition === 'number' && (
        <div className="mt-1 flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0 h-1.5 rounded-full bg-ink-800 overflow-hidden">
            <div
              className={v.condition >= 75 ? 'bg-money-500' : v.condition >= 40 ? 'bg-yellow-400' : 'bg-blood-500'}
              style={{ width: `${Math.max(0, Math.min(100, v.condition))}%`, height: '100%' }}
            />
          </div>
          <span className="text-[12px] text-ink-100/55 tabular-nums w-10 text-right shrink-0">{Math.round(v.condition)}%</span>
        </div>
      )}
      {v.mods?.length > 0 && (
        <div className="text-[12px] text-ink-100/55 mt-1 truncate">
          {v.mods.map(m => `${m.emoji}${m.name}`).join(' · ')}
        </div>
      )}
      <div className="mt-2 flex flex-col sm:flex-row sm:justify-end sm:flex-wrap gap-2">
        {inTransit ? null : v.is_active ? (
          <>
            <button onClick={() => call('store-vehicle')} disabled={busy}
              className="btn btn-ghost text-[13px] w-full sm:w-auto">{busy ? '…' : 'Store'}</button>
            <button
              onClick={() => setShipping(s => !s)}
              className="btn btn-ghost text-[13px] w-full sm:w-auto"
              disabled={destinations.length === 0 || busy}
              title={destinations.length === 0 ? 'No other city has free garage space' : 'Park and ship to another city'}>
              {shipping ? 'Cancel' : 'Ship'}
            </button>
          </>
        ) : (
          <>
            {inCurrentCity && !hasActive && (
              <button onClick={() => call('equip-vehicle')} disabled={busy}
                className="btn btn-ghost text-[13px] w-full sm:w-auto">{busy ? '…' : 'Drive'}</button>
            )}
            <button
              onClick={() => setShipping(s => !s)}
              className="btn btn-ghost text-[13px] w-full sm:w-auto"
              disabled={destinations.length === 0 || busy}
              title={destinations.length === 0 ? 'No other city has free garage space' : 'Ship to another city'}>
              {shipping ? 'Cancel' : 'Ship'}
            </button>
          </>
        )}
      </div>
      {err && <p className="text-[13px] text-blood-400 mt-1">{err}</p>}
      {shipping && (
        <div className="mt-2 pt-2 border-t border-ink-100/10 text-xs space-y-2">
          {v.is_active && (
            <p className="text-[12px] text-yellow-300/85">
              Shipping your active car parks it first — you’ll be on foot until it arrives.
            </p>
          )}
          <select className="w-full" value={to} onChange={e => setTo(e.target.value)}>
            <option value="">— Destination —</option>
            {destinations.map(g => (
              <option key={g.city} value={g.city}>{g.cityName} ({g.free} free)</option>
            ))}
          </select>
          {quote && (
            <div className="text-[13px] text-ink-100/60">
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
  { id: 'loadout',  label: 'Loadout'  },
  { id: 'weapons',  label: 'Weapons'  },
  { id: 'armour',   label: 'Armour'   },
  { id: 'ammo',     label: 'Ammo'     },
  { id: 'drugs',    label: 'Drugs'    },
  { id: 'items',    label: 'Items'    },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'wardrobe', label: 'Wardrobe' },
];

const SLOT_ORDER = ['hat', 'top', 'bottom', 'shoes', 'accessory'];
const SLOT_LABELS = { hat: 'Hat', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', accessory: 'Accessory' };

// Wardrobe tab — cosmetic clothing closet. Browse what you own,
// equip/unequip per slot. Buy at the matching store (Streetwear
// Outlet / Atelier) on the City map.
function WardrobeTab() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get('/clothing/wardrobe')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function equip(slot, itemId) {
    setBusy(`${slot}:${itemId ?? 'unequip'}`); setMsg(null);
    try {
      await api.post('/clothing/equip', { slot, item_id: itemId });
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const ownedBySlot = {};
  for (const it of data.owned) {
    (ownedBySlot[it.slot] = ownedBySlot[it.slot] || []).push(it);
  }

  return (
    <div className="space-y-4">
      <Card title="Currently wearing"
        subtitle="Five cosmetic slots. None of it changes stats — just style. Buy more at the Streetwear Outlet or the Atelier.">
        <div className="grid grid-cols-2 gap-2 mb-3 sm:max-w-sm">
          <Link to="/clothing/low"  className="btn btn-ghost text-xs">→ Streetwear</Link>
          <Link to="/clothing/high" className="btn btn-ghost text-xs">→ Atelier</Link>
        </div>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-5">
          {SLOT_ORDER.map(slot => {
            const eq = data.equipped[slot];
            return (
              <div key={slot}
                className="rounded-lg p-2 border border-ink-100/10 bg-ink-950/40
                           flex flex-row items-center gap-3 text-left
                           sm:flex-col sm:items-center sm:text-center sm:gap-0">
                <div className="w-14 h-14 rounded bg-ink-900/60 flex items-center justify-center shrink-0 sm:order-2 sm:mt-1">
                  {eq ? <ClothingSvg id={eq.id} size={56} /> : <span className="text-ink-100/30 text-2xl">·</span>}
                </div>
                <div className="min-w-0 flex-1 sm:order-1 sm:flex-none sm:w-full">
                  <div className="text-[11px] uppercase tracking-wide text-ink-100/55">{SLOT_LABELS[slot]}</div>
                  <div className="text-[12px] text-ink-100/80 truncate sm:line-clamp-2 sm:min-h-[28px] sm:mt-1">
                    {eq?.name || 'Empty'}
                  </div>
                </div>
                {eq && (
                  <button
                    onClick={() => equip(slot, null)}
                    disabled={busy === `${slot}:unequip`}
                    className="text-[11px] text-ink-100/55 hover:text-blood-300 disabled:opacity-50 shrink-0
                               sm:order-3 sm:text-[10px] sm:mt-1">
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {msg && <p className="text-xs text-blood-300 mt-3">{msg}</p>}
      </Card>

      <Card title="Your closet" subtitle={`${data.owned.length} item${data.owned.length === 1 ? '' : 's'} owned across both stores.`}>
        {data.owned.length === 0 ? (
          <p className="text-xs text-ink-100/45">Nothing in the closet yet — visit a clothing store to pick something up.</p>
        ) : (
          <div className="space-y-4">
            {SLOT_ORDER.map(slot => {
              const items = ownedBySlot[slot] || [];
              if (items.length === 0) return null;
              const equippedId = data.equipped[slot]?.id;
              return (
                <div key={slot}>
                  <div className="text-[11px] uppercase tracking-wide text-ink-100/55 mb-1.5">{SLOT_LABELS[slot]}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map(it => {
                      const isEquipped = equippedId === it.id;
                      return (
                        <div key={it.id}
                          className={`rounded-lg p-3 border bg-ink-950/40 flex gap-3 items-center ${isEquipped ? 'border-money-500/50 bg-money-700/10' : 'border-ink-100/10'}`}>
                          <div className="shrink-0 rounded bg-ink-900/60 border border-ink-100/10 p-1">
                            <ClothingSvg id={it.id} size={48} />
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <div className="text-[13px] font-medium truncate">{it.name}</div>
                            <div className="text-[11px] text-ink-100/55">{it.store === 'high' ? 'Atelier' : 'Streetwear'}</div>
                            {isEquipped ? (
                              <span className="text-[11px] uppercase tracking-wide text-money-300">Equipped</span>
                            ) : (
                              <button
                                onClick={() => equip(slot, it.id)}
                                disabled={busy === `${slot}:${it.id}`}
                                className="btn btn-ghost text-[11px] py-1 self-start disabled:opacity-50">
                                {busy === `${slot}:${it.id}` ? '…' : 'Wear'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// Loadout view — a read-only round-up of the character's current
// state: equipped weapon, equipped armour, active vehicle, and a
// snapshot of personal inventory. Single panel, no save/apply — this
// IS the loadout, always reflecting the live state.
function LoadoutTab({ inv }) {
  if (!inv) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const eq = inv.equipped;
  const activeVeh = inv.vehicles.find(v => v.is_active) || null;
  const ammoForEq = eq.weapon_detail?.ammoType
    ? (inv.ammo.find(a => a.id === eq.weapon_detail.ammoType)?.qty || 0)
    : null;
  // Group the personal inventory for a tidy at-a-glance summary.
  const groups = [
    { key: 'weapons', title: 'Weapons', items: inv.weapons.filter(w => w.id !== 'fists') },
    { key: 'armour',  title: 'Armour',  items: inv.armours },
    { key: 'ammo',    title: 'Ammo',    items: inv.ammo },
    { key: 'drugs',   title: 'Drugs',   items: inv.drugs },
    { key: 'items',   title: 'Items',   items: inv.misc },
  ];

  return (
    <div className="space-y-4">
      <Card title="Loadout" subtitle="Everything you're currently carrying / driving — at a glance.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Weapon */}
          <div className="rounded-lg p-3 border border-blood-500/40 bg-blood-700/10">
            <div className="text-[12px] uppercase tracking-wide text-ink-100/55">Weapon</div>
            <div className="font-medium mt-0.5">{eq.weapon_detail?.name || 'Fists'}</div>
            <div className="text-[13px] text-ink-100/65">
              DMG {eq.weapon_detail?.dmg ?? 4}
              {eq.weapon_detail?.ammoType
                ? ` · ${eq.weapon_detail.ammoType} (${ammoForEq} rounds)`
                : ' · melee'}
            </div>
          </div>

          {/* Armour */}
          <div className="rounded-lg p-3 border border-ink-100/15 bg-ink-950/40">
            <div className="text-[12px] uppercase tracking-wide text-ink-100/55">Armour</div>
            <div className="font-medium mt-0.5">{eq.armour_detail?.name || 'No Armour'}</div>
            <div className="text-[13px] text-ink-100/65">DEF {eq.armour_detail?.def ?? 0}</div>
          </div>

          {/* Active vehicle */}
          <div className="rounded-lg p-3 border border-money-500/40 bg-money-700/10">
            <div className="text-[12px] uppercase tracking-wide text-ink-100/55">Vehicle</div>
            {activeVeh ? (
              <>
                <div className="font-medium mt-0.5 truncate">{activeVeh.maker} {activeVeh.name}</div>
                <div className="text-[13px] text-ink-100/65">
                  Tier {activeVeh.tier}
                  {typeof activeVeh.condition === 'number' && ` · ${Math.round(activeVeh.condition)}% cond.`}
                </div>
              </>
            ) : (
              <div className="text-[13px] text-ink-100/55 italic mt-0.5">On foot</div>
            )}
          </div>
        </div>
      </Card>

      <WeightCard weight={inv.weight} />

      <Card title="What's on you"
        subtitle="A live snapshot of your personal inventory. Use the per-category tabs above to manage individual items.">
        {groups.every(g => g.items.length === 0) ? (
          <p className="text-xs text-ink-100/45">Pockets are empty.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map(g => g.items.length === 0 ? null : (
              <div key={g.key} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="text-[12px] uppercase tracking-wide text-ink-100/55 mb-1">{g.title}</div>
                <ul className="text-[13px] space-y-0.5">
                  {g.items.map(it => (
                    <li key={it.id} className="flex items-baseline justify-between gap-2">
                      <span className="truncate">{it.name}</span>
                      <span className="text-ink-100/55 tabular-nums shrink-0">×{it.qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// Carry-weight bar — Personal (always shown) and House stash (when the
// character owns a property in the current city). Hard cap on Personal
// is enforced on the server at buy time; House is effectively infinite
// at the current 5,000 kg cap.
function WeightCard({ weight }) {
  if (!weight) return null;
  const pct = Math.max(0, Math.min(100, (weight.personal_kg / weight.personal_cap_kg) * 100));
  const tone = pct >= 95 ? 'bg-blood-500' : pct >= 75 ? 'bg-yellow-400' : 'bg-money-500';
  const vehPct = weight.vehicle_active
    ? Math.max(0, Math.min(100, (weight.vehicle_kg / Math.max(1, weight.vehicle_cap_kg)) * 100))
    : 0;
  return (
    <Card title="Carry weight"
      subtitle={`Personal cap is ${weight.personal_cap_kg}kg. Stash overflow at your house or in your active car's boot.`}>
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between text-[12px] mb-1">
            <span className="uppercase tracking-wide text-ink-100/55">On your person</span>
            <span className="tabular-nums text-ink-100/85">
              {weight.personal_kg.toFixed(2)} / {weight.personal_cap_kg.toFixed(0)} kg
            </span>
          </div>
          <div className="h-2 rounded-full bg-ink-100/10 overflow-hidden">
            <div className={tone} style={{ width: pct + '%', height: '100%' }} />
          </div>
        </div>
        {weight.house_owned && (
          <div>
            <div className="flex items-baseline justify-between text-[12px] mb-1">
              <span className="uppercase tracking-wide text-ink-100/55">House stash — {(weight.house_city || '').replace(/_/g, ' ')}</span>
              <span className="tabular-nums text-ink-100/85">
                {weight.house_kg.toFixed(1)} / {weight.house_cap_kg.toLocaleString()} kg
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink-100/10 overflow-hidden">
              <div className="bg-cyan-500" style={{ width: Math.min(100, (weight.house_kg / weight.house_cap_kg) * 100) + '%', height: '100%' }} />
            </div>
          </div>
        )}
        {weight.vehicle_active && (
          <div>
            <div className="flex items-baseline justify-between text-[12px] mb-1">
              <span className="uppercase tracking-wide text-ink-100/55">Boot of your {weight.vehicle_name}</span>
              <span className="tabular-nums text-ink-100/85">
                {weight.vehicle_kg.toFixed(1)} / {weight.vehicle_cap_kg.toFixed(0)} kg
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink-100/10 overflow-hidden">
              <div className="bg-yellow-500" style={{ width: vehPct + '%', height: '100%' }} />
            </div>
          </div>
        )}
        {!weight.house_owned && !weight.vehicle_active && (
          <p className="text-[12px] text-ink-100/45">No property here, no active vehicle. Buy a place or jump in a car to unlock overflow storage.</p>
        )}
      </div>
    </Card>
  );
}

function VehicleStashCard({ items, weight, onTransfer, busy }) {
  if (!weight?.vehicle_active) return null;
  return (
    <Card title={`Vehicle Cargo — ${weight.vehicle_name}`}
      subtitle={`${items.length} item types · ${weight.vehicle_kg.toFixed(1)}kg of ${weight.vehicle_cap_kg.toFixed(0)}kg.`}>
      {items.length === 0 ? (
        <p className="text-xs text-ink-100/45">Empty boot. Drop ammo or a backup piece in here to free up your pockets.</p>
      ) : (
        <div className="divide-y divide-ink-100/5">
          {items.map(it => (
            <div key={`${it.kind}:${it.item_id}`} className="py-2 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{it.name}</div>
                <div className="text-[12px] text-ink-100/45">
                  {it.kind} · {it.qty} × {it.unit_kg.toFixed(3)}kg = {(it.qty * it.unit_kg).toFixed(2)}kg
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() => onTransfer(it.kind, it.item_id, it.qty, 'vehicle', 'personal')}
                className="btn btn-primary text-[11px] py-1 shrink-0">
                Take {it.qty}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// House stash panel: shows items currently parked at home in this
// city, with a Take button per row. Personal items get a Stash button
// in their respective sections.
function HouseStashCard({ items, weight, onTransfer, busy }) {
  if (!weight?.house_owned) return null;
  return (
    <Card title={`House Stash — ${(weight.house_city || '').replace(/_/g, ' ')}`}
      subtitle={`${items.length} item types · ${weight.house_kg.toFixed(1)}kg of ${weight.house_cap_kg.toLocaleString()}kg.`}>
      {items.length === 0 ? (
        <p className="text-xs text-ink-100/45">Nothing stored here yet. Move heavy gear off your person to free up carry weight.</p>
      ) : (
        <div className="divide-y divide-ink-100/5">
          {items.map(it => (
            <div key={`${it.kind}:${it.item_id}`} className="py-2 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{it.name}</div>
                <div className="text-[12px] text-ink-100/45">
                  {it.kind} · {it.qty} × {it.unit_kg.toFixed(3)}kg = {(it.qty * it.unit_kg).toFixed(2)}kg
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() => onTransfer(it.kind, it.item_id, it.qty, 'house', 'personal')}
                className="btn btn-primary text-[11px] py-1 shrink-0">
                Take {it.qty}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StashButton({ kind, item_id, qty, onTransfer, busy, weight }) {
  const houseOK = weight?.house_owned;
  const vehOK   = weight?.vehicle_active;
  if (!houseOK && !vehOK) return null;
  return (
    <div className="flex gap-1">
      {houseOK && (
        <button
          disabled={busy}
          onClick={() => onTransfer(kind, item_id, qty, 'personal', 'house')}
          title="Move to your house stash in this city"
          className="text-[11px] px-2 py-0.5 rounded border border-ink-100/15 hover:border-cyan-400/40 hover:text-cyan-300 disabled:opacity-40">
          → House
        </button>
      )}
      {vehOK && (
        <button
          disabled={busy}
          onClick={() => onTransfer(kind, item_id, qty, 'personal', 'vehicle')}
          title="Move to the boot of your active vehicle"
          className="text-[11px] px-2 py-0.5 rounded border border-ink-100/15 hover:border-yellow-400/40 hover:text-yellow-300 disabled:opacity-40">
          → Car
        </button>
      )}
    </div>
  );
}

function CountBadge({ n, tone = 'ink' }) {
  const cls = tone === 'blood'
    ? 'bg-blood-700/30 text-blood-200'
    : 'bg-ink-800/60 text-ink-100/70';
  return <span className={`ml-2 text-[12px] tabular-nums px-1.5 py-0.5 rounded ${cls}`}>{n}</span>;
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
          <div className="text-[12px] uppercase text-ink-100/50">Weapon</div>
          <div className="font-medium">
            {eq.weapon === 'fists' ? 'Fists' : (wDetail?.name || eq.weapon)}
          </div>
          <div className="text-[13px] text-ink-100/60">
            {wDetail?.maker ? `${wDetail.maker} · ` : ''}
            DMG {wDetail?.dmg ?? 4}
            {wDetail?.ammoType ? ` · ${wDetail.ammoType}` : ' · melee'}
          </div>
          {wDetail?.ammoType && (
            <div className="text-[13px] mt-1 tabular-nums">
              <span className="text-ink-100/50">Rounds in pocket:</span>{' '}
              <span className={eq.weapon_ammo > 0 ? 'text-money-400' : 'text-blood-400'}>
                {eq.weapon_ammo}
              </span>
            </div>
          )}
        </div>
        <div>
          <div className="text-[12px] uppercase text-ink-100/50">Armour</div>
          <div className="font-medium">
            {eq.armour === 'none' ? 'No armour' : (aDetail?.name || eq.armour)}
          </div>
          <div className="text-[13px] text-ink-100/60">DEF {aDetail?.def ?? 0}</div>
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
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return TABS.some(x => x.id === t) ? t : 'overview';
  });
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
  async function moveItem(kind, item_id, qty, from, to) {
    const askQty = window.prompt(`How many to move?  (max ${qty})`, String(qty));
    const n = parseInt(askQty || '', 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const clamped = Math.min(qty, n);
    setBusy(`mv-${kind}-${item_id}`); setMsg(null);
    try {
      await api.post('/inventory/transfer', { kind, item_id, qty: clamped, from, to });
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

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
          <WeightCard weight={inv.weight} />
          <HouseStashCard
            items={inv.house_stash || []}
            weight={inv.weight}
            onTransfer={moveItem}
            busy={!!busy}
          />
          <VehicleStashCard
            items={inv.vehicle_stash || []}
            weight={inv.weight}
            onTransfer={moveItem}
            busy={!!busy}
          />
          <EquippedSummary inv={inv} />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card title=" Weapons" right={<button onClick={() => setTab('weapons')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.weapons}</div>
              <div className="text-[13px] text-ink-100/55">in your stash</div>
            </Card>
            <Card title=" Armour" right={<button onClick={() => setTab('armour')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.armour}</div>
              <div className="text-[13px] text-ink-100/55">vests / jackets</div>
            </Card>
            <Card title=" Ammo" right={<button onClick={() => setTab('ammo')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.ammo}</div>
              <div className="text-[13px] text-ink-100/55">rounds total</div>
            </Card>
            <Card title=" Drugs" right={<button onClick={() => setTab('drugs')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.drugs}</div>
              <div className="text-[13px] text-ink-100/55">units on you</div>
            </Card>
            <Card title=" Items" right={<button onClick={() => setTab('items')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.items}</div>
              <div className="text-[13px] text-ink-100/55">misc / shop-bought</div>
            </Card>
            <Card title=" Vehicles" right={<button onClick={() => setTab('vehicles')} className="btn btn-ghost text-xs">View all</button>}>
              <div className="text-2xl font-display tabular-nums">{counts.vehicles}</div>
              <div className="text-[13px] text-ink-100/55">in garages worldwide</div>
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
              <div className="text-[13px] text-ink-100/60">DMG 4 · melee</div>
              {eq.weapon === 'fists'
                ? <div className="text-[12px] uppercase mt-2 text-blood-300">equipped</div>
                : <button className="btn text-xs w-full mt-2" onClick={() => equip('weapon', 'fists')}>Equip</button>}
            </div>
            {inv.weapons.filter(w => w.id !== 'fists').map(w => (
              <div key={w.id} className={`rounded-lg p-3 border ${eq.weapon === w.id ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{w.name}</div>
                  {w.qty > 1 && <span className="text-[12px] text-ink-100/50">×{w.qty}</span>}
                </div>
                {w.maker && <div className="text-[12px] text-ink-100/50">{w.maker}</div>}
                <div className="text-[13px] text-ink-100/60">DMG {w.dmg}{w.ammoType ? ` · ${w.ammoType}` : ' · melee'}{w.unit_kg ? ` · ${w.unit_kg.toFixed(1)}kg` : ''}</div>
                {eq.weapon === w.id
                  ? <div className="text-[12px] uppercase mt-2 text-blood-300">equipped</div>
                  : <button disabled={busy === `eq-weapon-${w.id}`} className="btn btn-primary text-xs w-full mt-2" onClick={() => equip('weapon', w.id)}>Equip</button>}
                {inv.weight?.house_owned && (
                  <div className="mt-2 flex justify-end">
                    <StashButton kind="weapon" item_id={w.id} qty={w.qty} onTransfer={moveItem} busy={busy === `mv-weapon-${w.id}`} weight={inv.weight} />
                  </div>
                )}
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
              <div className="text-[13px] text-ink-100/60">DEF 0</div>
              {eq.armour === 'none'
                ? <div className="text-[12px] uppercase mt-2 text-blood-300">equipped</div>
                : <button className="btn text-xs w-full mt-2" onClick={() => equip('armour', 'none')}>Unequip</button>}
            </div>
            {inv.armours.map(a => (
              <div key={a.id} className={`rounded-lg p-3 border ${eq.armour === a.id ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{a.name}</div>
                  {a.qty > 1 && <span className="text-[12px] text-ink-100/50">×{a.qty}</span>}
                </div>
                <div className="text-[13px] text-ink-100/60">DEF {a.def}{a.unit_kg ? ` · ${a.unit_kg.toFixed(0)}kg` : ''}</div>
                {eq.armour === a.id
                  ? <div className="text-[12px] uppercase mt-2 text-blood-300">equipped</div>
                  : <button disabled={busy === `eq-armour-${a.id}`} className="btn btn-primary text-xs w-full mt-2" onClick={() => equip('armour', a.id)}>Equip</button>}
                {inv.weight?.house_owned && (
                  <div className="mt-2 flex justify-end">
                    <StashButton kind="armour" item_id={a.id} qty={a.qty} onTransfer={moveItem} busy={busy === `mv-armour-${a.id}`} weight={inv.weight} />
                  </div>
                )}
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
                    <div className="text-[13px] text-ink-100/60 tabular-nums">{a.qty} rounds{a.unit_kg ? ` · ${(a.qty * a.unit_kg).toFixed(2)}kg` : ''}</div>
                    {isEquippedType && (
                      <div className="text-[12px] uppercase mt-1 text-yellow-300">for equipped weapon</div>
                    )}
                    {inv.weight?.house_owned && (
                      <div className="mt-2 flex justify-end">
                        <StashButton kind="ammo" item_id={a.id} qty={a.qty} onTransfer={moveItem} busy={busy === `mv-ammo-${a.id}`} weight={inv.weight} />
                      </div>
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
                  <div className="text-[13px] text-ink-100/60 tabular-nums">{d.qty} units{d.unit_kg ? ` · ${(d.qty * d.unit_kg).toFixed(3)}kg` : ''}</div>
                  {inv.weight?.house_owned && (
                    <div className="mt-2 flex justify-end">
                      <StashButton kind="drug" item_id={d.id} qty={d.qty} onTransfer={moveItem} busy={busy === `mv-drug-${d.id}`} weight={inv.weight} />
                    </div>
                  )}
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
                    <span className="text-[13px] text-ink-100/60 tabular-nums">×{m.qty}</span>
                  </div>
                  {m.desc && <div className="text-[13px] text-ink-100/55 mt-1 flex-1">{m.desc}</div>}
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
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-xl text-ink-50">Vehicles</h3>
              <p className="text-xs text-ink-100/50 mt-0.5">
                {inv.vehicles.length} cars across your garages — sell stolen ones at the Chop Shop, trade in legit ones the same place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs shrink-0">
              <Link className="btn btn-ghost" to="/customize/vehicles">Customize</Link>
              <Link className="btn btn-ghost" to="/dealership">→ Car Dealer</Link>
              <Link className="btn btn-ghost" to="/chop-shop">→ Chop Shop</Link>
            </div>
          </div>
          {inv.garages?.length > 0 && (
            <div className="mb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[13px]">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
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

      {/*  Loadout — single, read-only summary  */}
      {tab === 'loadout' && (
        <LoadoutTab inv={inv} />
      )}

      {/*  Wardrobe — cosmetic clothing  */}
      {tab === 'wardrobe' && (
        <WardrobeTab />
      )}
    </div>
  );
}
