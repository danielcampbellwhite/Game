import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
import SendMoneyForm from '../components/SendMoneyForm.jsx';
import { fmt } from '../components/Money.jsx';

// In-game internet portal. The whole page requires online status —
// character.internet.online comes from the server on every refresh.
// Online services charge a small markup over in-store prices and
// debit from the player's bank balance (not pocket cash).
//
// Accepts ?tab=flights|vehicles|weapons|bank so the phone overlay's
// app tiles can deep-link straight to the right section.

const VALID_TABS = new Set(['flights', 'vehicles', 'weapons', 'bank']);

export default function Online() {
  const { character } = useGame();
  const [search] = useSearchParams();
  const wantTab = search.get('tab');
  const [tab, setTab] = useState(VALID_TABS.has(wantTab) ? wantTab : 'flights');
  useEffect(() => {
    if (VALID_TABS.has(wantTab)) setTab(wantTab);
  }, [wantTab]);

  if (!character) return null;
  const i = character.internet;
  if (!i?.online) {
    return (
      <div className="space-y-3">
        <Card title="Offline">
          <p className="text-xs text-ink-100/65">
            You can't get online from here. Carry a smartphone in your pocket
            and you're connected anywhere.
          </p>
          <Link to="/general-store" className="btn btn-primary text-xs mt-2 inline-block">
            Buy a smartphone →
          </Link>
        </Card>
      </div>
    );
  }

  const TABS = [
    { id: 'flights',  label: 'Flights'  },
    { id: 'vehicles', label: 'Vehicles' },
    { id: 'weapons',  label: 'Weapons'  },
    { id: 'bank',     label: 'Bank'     },
  ];

  const viaLabel = i.reason === 'phone' ? 'connected on your phone' : 'connected';

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h3 className="font-display text-xl text-ink-50">Online</h3>
            <p className="text-[12px] text-ink-100/55 mt-0.5">
              You're {viaLabel}. Online prices include a small markup and are paid from your bank.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Bank</div>
            <div className="font-display text-lg text-money-300 tabular-nums">{fmt(character.bank)}</div>
          </div>
        </div>
      </Card>

      <div className="flex gap-1 text-xs">
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md ${tab === t.id ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flights'  && <FlightsTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'weapons'  && <WeaponsTab />}
      {tab === 'bank'     && <BankAppTab />}
    </div>
  );
}

export function BankAppTab() {
  const [data, setData] = useState(null);
  const [msg, setMsg]   = useState(null);
  const [busy, setBusy] = useState(null);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  async function reload() {
    try { setData(await api.get('/online/bank-app')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function changePin() {
    if (!/^\d{4}$/.test(newPin)) { setMsg('New PIN must be 4 digits.'); return; }
    if (newPin !== confirmPin)   { setMsg('PINs don\'t match.'); return; }
    setBusy('change'); setMsg(null);
    try {
      await api.post('/online/bank-app/change-pin', { old_pin: oldPin, new_pin: newPin });
      setMsg('PIN updated.');
      setOldPin(''); setNewPin(''); setConfirmPin('');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function forgot() {
    setBusy('forgot'); setMsg(null);
    try {
      await api.post('/online/bank-app/forgot-pin', {});
      setMsg('Bank sent you a DM with your PIN.');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">{msg || 'Loading…'}</p></Card>;
  if (!data.account_opened) {
    return (
      <Card title="No account yet"
        subtitle="Visit the bank to open an account and get a PIN. Once opened, you can manage it from here.">
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card title="Bank balance" collapsible defaultOpen
        subtitle={data.note}>
        <div className="rounded-md bg-ink-900/50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-ink-100/55">Balance</div>
          <div className="font-display text-3xl text-money-300 tabular-nums">{fmt(data.bank)}</div>
        </div>
        {data.interest && (
          <div className="mt-2 rounded-md bg-ink-900/40 px-3 py-2 text-[12px]">
            <div className="flex items-baseline justify-between">
              <span className="uppercase tracking-wide text-ink-100/55 text-[11px]">Interest</span>
              <span className="text-money-300 tabular-nums">
                {(data.interest.hourlyRate * 100).toFixed(4)}% / hr ·{' '}
                {(data.interest.apr * 100).toFixed(1)}% APR
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-ink-100/65">Next payout</span>
              <span className="tabular-nums">
                +{fmt(data.interest.nextHourlyInterest)}
                {data.interest.bankLastInterest != null && (
                  <NextInterest at={data.interest.bankLastInterest} />
                )}
              </span>
            </div>
          </div>
        )}
        {data.loans.length > 0 && (
          <div className="mt-2 text-[12px] text-ink-100/65">
            Outstanding loans: <span className="text-blood-300 tabular-nums">{fmt(data.totalOwed)}</span>
          </div>
        )}
      </Card>

      <Card title="Recent transactions" collapsible
        subtitle="Last 20 bank-related events on this account.">
        {data.transactions.length === 0 ? (
          <p className="text-[12px] text-ink-100/45">No activity yet.</p>
        ) : (
          <ul className="text-[12px] divide-y divide-ink-100/5">
            {data.transactions.map(t => (
              <li key={t.id} className="py-1.5 flex items-start justify-between gap-2">
                <span className="text-ink-100/85">{t.message}</span>
                <span className="text-ink-100/40 text-[11px] whitespace-nowrap shrink-0">
                  {new Date(t.created_at).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SendMoneyForm endpoint="/online/bank-app/send" onDone={reload} compact collapsible />

      <Card title="PIN management" collapsible
        subtitle="Change your PIN, or ask the bank to DM you a reminder if you've forgotten it.">
        {msg && <p className="text-xs text-money-400 mb-2">{msg}</p>}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <input type="text" inputMode="numeric" maxLength="4" value={oldPin}
            onChange={e => setOldPin(e.target.value.replace(/\D/g,'').slice(0,4))}
            placeholder="Old PIN" className="text-xs" />
          <input type="text" inputMode="numeric" maxLength="4" value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
            placeholder="New" className="text-xs" />
          <input type="text" inputMode="numeric" maxLength="4" value={confirmPin}
            onChange={e => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
            placeholder="Confirm" className="text-xs" />
        </div>
        <div className="flex gap-1.5">
          <button onClick={changePin} disabled={busy === 'change' || !oldPin || !newPin}
            className="btn btn-primary text-xs flex-1">
            {busy === 'change' ? '…' : 'Change PIN'}
          </button>
          <button onClick={forgot} disabled={busy === 'forgot'}
            className="btn btn-ghost text-xs flex-1">
            {busy === 'forgot' ? '…' : 'Forgot?'}
          </button>
        </div>
      </Card>
    </div>
  );
}

export function ShopAppTab() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  const [destProp, setDestProp] = useState(null);
  const [qty, setQty] = useState({});
  useScrollOnMessage(msg);

  async function load() {
    try {
      const d = await api.get('/online/shop');
      setData(d);
      if (!destProp && d.properties[0]) setDestProp(d.properties[0].id);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function buy(item) {
    if (!destProp) { setMsg('Pick a destination property first.'); return; }
    const n = Math.max(1, parseInt(qty[item.id] || 1, 10));
    setBusy(`buy-${item.id}`); setMsg(null);
    try {
      await api.post('/online/shop/buy', { item_id: item.id, qty: n, destination_property: destProp });
      setMsg(`Ordered ${n}× ${item.name}. ETA ~${data.leadMinutes} min.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading shop…</p></Card>;

  if (data.properties.length === 0) {
    return (
      <Card title="No property to deliver to"
        subtitle="Online orders are shipped to your house stash. Buy a property first.">
        <Link to="/property" className="btn btn-primary text-xs inline-block">Browse properties →</Link>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title="Deliver to"
        subtitle={`Online markup ${data.markup_pct}%. Same sundries Murphy's stocks, dropped at the door in ~${data.leadMinutes} min.`}>
        <div className="flex flex-wrap gap-1.5">
          {data.properties.map(p => (
            <button key={p.id}
              onClick={() => setDestProp(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs ${destProp === p.id ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
              {p.name} <span className="text-[11px] opacity-70">· {p.cityName}</span>
            </button>
          ))}
        </div>
      </Card>

      {data.pending.length > 0 && (
        <Card title="Incoming">
          <ul className="text-xs space-y-1">
            {data.pending.map(p => (
              <li key={p.id} className="flex justify-between border-b border-ink-100/5 py-1 last:border-0">
                <span className="text-ink-100/85">{p.qty}× {p.label} → {p.destination}</span>
                <Countdown until={p.arrives_at} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Catalogue"
        subtitle="Mission props, consumables, scratchers — anything from the General Store.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.items.map(it => {
            const broke = (character?.bank ?? 0) < it.cost;
            return (
              <div key={it.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40 flex flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium truncate">{it.emoji} {it.name}</div>
                </div>
                <div className="text-[12px] text-ink-100/55 mt-0.5 min-h-[28px]">{it.desc}</div>
                <div className="text-money-400 font-semibold mt-1 tabular-nums">{fmt(it.cost)}</div>
                <div className="text-[11px] text-ink-100/45 line-through tabular-nums">{fmt(it.base)}</div>
                <div className="flex gap-1 mt-2">
                  <input type="number" min="1" max="99" placeholder="1"
                    value={qty[it.id] || ''}
                    onChange={e => setQty({ ...qty, [it.id]: e.target.value })}
                    className="w-14 text-xs" />
                  <button
                    disabled={broke || busy === `buy-${it.id}`}
                    onClick={() => buy(it)}
                    className="btn btn-primary text-xs flex-1">
                    {busy === `buy-${it.id}` ? '…' : broke ? 'Bank too low' : 'Order'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function WeaponsTab() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  const [section, setSection] = useState('weapons');   // weapons | armours | ammo
  const [destProp, setDestProp] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try {
      const d = await api.get('/online/weapons');
      setData(d);
      if (!destProp && d.properties[0]) setDestProp(d.properties[0].id);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function buy(kind, item, qty = 1) {
    if (!destProp) { setMsg('Pick a destination property first.'); return; }
    setBusy(`${kind}-${item.id}`); setMsg(null);
    try {
      await api.post('/online/weapons/buy', {
        kind, item_id: item.id, qty, destination_property: destProp,
      });
      setMsg(`Ordered. ETA ~${data.leadMinutes?.[kind] ?? 30} min.`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading catalogue…</p></Card>;

  if (data.properties.length === 0) {
    return (
      <Card title="No property to deliver to"
        subtitle="Online gear orders ship to your house stash. Buy a property first.">
        <Link to="/property" className="btn btn-primary text-xs inline-block">Browse properties →</Link>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title="Deliver to"
        subtitle={`Online markup ${data.markup_pct}%. Weapons ~${data.leadMinutes?.weapon ?? 60} min, armour & ammo ~${data.leadMinutes?.ammo ?? 30} min. Goods land in the property's house stash.`}>
        <div className="flex flex-wrap gap-1.5">
          {data.properties.map(p => (
            <button key={p.id}
              onClick={() => setDestProp(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs ${destProp === p.id ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
              {p.name} <span className="text-[11px] opacity-70">· {p.cityName}</span>
            </button>
          ))}
        </div>
      </Card>

      {data.pending.length > 0 && (
        <Card title="Incoming">
          <ul className="text-xs space-y-1">
            {data.pending.map(p => (
              <li key={p.id} className="flex justify-between border-b border-ink-100/5 py-1 last:border-0">
                <span className="text-ink-100/85">{p.qty}× {p.label} → {p.destination}</span>
                <Countdown until={p.arrives_at} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-1 text-xs">
        {[
          { id: 'weapons', label: 'Weapons' },
          { id: 'armours', label: 'Armour'  },
          { id: 'ammo',    label: 'Ammo'    },
        ].map(s => (
          <button key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-1 rounded-md ${section === s.id ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'weapons' && (
        <GearGrid
          items={data.weapons}
          kind="weapon"
          extra={w => `DMG ${w.dmg} · ${w.maker || ''}`}
          cash={character.bank}
          busy={busy}
          onBuy={(item) => buy('weapon', item, 1)}
        />
      )}
      {section === 'armours' && (
        <GearGrid
          items={data.armours}
          kind="armour"
          extra={() => null}
          cash={character.bank}
          busy={busy}
          onBuy={(item) => buy('armour', item, 1)}
        />
      )}
      {section === 'ammo' && (
        <GearGrid
          items={data.ammo}
          kind="ammo"
          extra={a => `pack of ${a.packSize}`}
          cash={character.bank}
          busy={busy}
          onBuy={(item) => buy('ammo', item, 1)}
        />
      )}
    </div>
  );
}

function GearGrid({ items, kind, extra, cash, busy, onBuy }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map(it => {
        const broke = (cash ?? 0) < it.cost;
        const locked = it.locked;
        const disabled = broke || locked || busy === `${kind}-${it.id}`;
        return (
          <div key={it.id} className={`rounded-lg p-3 border bg-ink-950/40 ${locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-medium truncate">{it.name}</div>
              {it.level && <span className="text-[11px] uppercase tracking-wide text-ink-100/55">L{it.level}</span>}
            </div>
            <div className="text-[12px] text-ink-100/55 mt-0.5 min-h-[16px]">{extra(it)}</div>
            <div className="text-money-400 font-semibold mt-1 tabular-nums">{fmt(it.cost)}</div>
            <div className="text-[11px] text-ink-100/45 line-through tabular-nums">{fmt(it.base)}</div>
            <button
              disabled={disabled}
              onClick={() => onBuy(it)}
              className="btn btn-primary text-xs w-full mt-2">
              {busy === `${kind}-${it.id}` ? '…'
                : locked ? `Lvl ${it.level}`
                : broke ? 'Bank too low'
                : 'Order'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function VehiclesTab() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  const [destCity, setDestCity] = useState(null);
  const [tier, setTier] = useState('all');
  useScrollOnMessage(msg);

  async function load() {
    try {
      const d = await api.get('/online/vehicles');
      setData(d);
      // Default to the first deliverable city if the player hasn't picked.
      if (!destCity && d.destinations[0]) setDestCity(d.destinations[0].id);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function buy(v) {
    if (!destCity) { setMsg('Pick a destination city first.'); return; }
    setBusy(v.id); setMsg(null);
    try {
      await api.post('/online/vehicles/buy', { vehicle_id: v.id, destination_city: destCity });
      const dCity = data.destinations.find(d => d.id === destCity);
      setMsg(`${v.maker} ${v.name} on the way to ${dCity?.name || destCity}. ETA ${data.leadHours}h.`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading vehicle catalogue…</p></Card>;

  if (data.destinations.length === 0) {
    return (
      <Card title="No garage to deliver to"
        subtitle="Online orders are shipped to a garage you own. Buy a property in any city to unlock deliveries.">
        <Link to="/property" className="btn btn-primary text-xs inline-block">Browse properties →</Link>
      </Card>
    );
  }

  const tiers = ['all', ...Array.from(new Set(data.inventory.map(v => v.tier))).sort((a, b) => a - b)];
  const list = data.inventory.filter(v => tier === 'all' || v.tier === tier);

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title="Deliver to"
        subtitle={`Online markup ${data.markup_pct}%. Cars take ~${data.leadHours}h to arrive and ship into the garage you choose.`}>
        <div className="flex flex-wrap gap-1.5">
          {data.destinations.map(d => (
            <button key={d.id}
              onClick={() => setDestCity(d.id)}
              className={`px-3 py-1.5 rounded-md text-xs ${destCity === d.id ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
              {d.name} <span className="text-[11px] opacity-70">{d.free}/{d.capacity}{d.pending ? ` · ${d.pending} en route` : ''}</span>
            </button>
          ))}
        </div>
      </Card>

      {data.pending.length > 0 && (
        <Card title="Incoming deliveries"
          subtitle="Orders currently in transit.">
          <ul className="text-xs space-y-1">
            {data.pending.map(p => (
              <li key={p.id} className="flex justify-between border-b border-ink-100/5 py-1 last:border-0">
                <span className="text-ink-100/85">{p.vehicle} → {p.destination}</span>
                <Countdown until={p.arrives_at} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Catalogue"
        subtitle="Same models as the dealership, plus the online markup. Tier gates the same way.">
        <div className="flex flex-wrap gap-1 mb-2">
          {tiers.map(t => (
            <button key={t}
              onClick={() => setTier(t)}
              className={`px-2 py-1 rounded text-[11px] ${tier === t ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
              {t === 'all' ? 'All tiers' : `Tier ${t}`}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {list.map(v => {
            const dCity = data.destinations.find(d => d.id === destCity);
            const noSlot = !dCity || dCity.free <= 0;
            const broke = (character?.bank ?? 0) < v.cost;
            const disabled = v.locked || noSlot || broke || busy === v.id;
            return (
              <div key={v.id} className={`rounded-lg p-3 border bg-ink-950/40 ${v.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium truncate">{v.maker} {v.name}</div>
                  <span className="text-[11px] uppercase tracking-wide text-ink-100/55">T{v.tier}</span>
                </div>
                <div className="text-money-400 font-semibold mt-1 tabular-nums">{fmt(v.cost)}</div>
                <div className="text-[11px] text-ink-100/45 line-through tabular-nums">{fmt(v.base)}</div>
                <button
                  disabled={disabled}
                  onClick={() => buy(v)}
                  className="btn btn-primary text-xs w-full mt-2">
                  {busy === v.id ? '…'
                    : v.locked ? `Lvl ${v.levelGate}`
                    : noSlot ? 'Garage full'
                    : broke ? 'Bank too low'
                    : 'Order'}
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// Live "next interest in MM:SS" indicator. Anchors to bank_last_interest;
// each hour after that timestamp another payout falls due.
function NextInterest({ at }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const HOUR = 60 * 60 * 1000;
  const elapsed = now - at;
  const nextAt = at + (Math.floor(elapsed / HOUR) + 1) * HOUR;
  const ms = Math.max(0, nextAt - now);
  const m = String(Math.floor(ms / 60_000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  return <span className="text-ink-100/70 ml-1">in {m}:{s}</span>;
}

function Countdown({ until }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const remaining = Math.max(0, until - now);
  if (remaining <= 0) return <span className="text-money-300 tabular-nums">Arriving…</span>;
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return <span className="tabular-nums text-ink-100/70">{h}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s</span>;
}

export function FlightsTab() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  // Per-card outcome message AND per-card chosen slot. Both keyed by
  // city id so each destination remembers what the player picked.
  const [outcome,   setOutcome]   = useState({});
  const [pickedSlot, setPickedSlot] = useState({});
  const [pickedClass, setPickedClass] = useState({});
  const [busy, setBusy] = useState(null);

  async function load() {
    try { setData(await api.get('/online/flights')); }
    catch {}
  }
  useEffect(() => { load(); }, []);

  // 1Hz tick so the countdowns move smoothly.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  // Refetch the schedule when the next slot rolls over so it stays accurate.
  useEffect(() => {
    const next = data?.schedule?.slots?.[0];
    if (!next) return;
    const ms = next - Date.now();
    if (ms <= 0) { load(); return; }
    const t = setTimeout(load, ms + 200);
    return () => clearTimeout(t);
  }, [data?.schedule?.slots?.[0]]);

  async function book(city) {
    const klass = pickedClass[city] || 'economy';
    const slot  = pickedSlot[city];
    setBusy(`${city}`);
    setOutcome(o => ({ ...o, [city]: null }));
    try {
      const r = await api.post('/online/flights/ticket', {
        city, klass,
        ...(slot ? { departs_at: slot } : {}),
      });
      setOutcome(o => ({ ...o,
        [city]: { ok: true, text: `Ticket booked (${klass}) — departs ${fmtClock(r.departsAt)}. Head to the airport to board.` }
      }));
      setPickedSlot(s => ({ ...s, [city]: null }));
      await refresh();
      await load();
    } catch (e) {
      setOutcome(o => ({ ...o, [city]: { ok: false, text: e.message } }));
    }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading flights…</p></Card>;

  const now = Date.now();

  return (
    <div className="space-y-3">
      {/* Held tickets — one row each, with a live countdown to
          boarding open (head to the airport when that hits 0). */}
      {data.tickets && data.tickets.length > 0 && (
        <Card title={`Your tickets (${data.tickets.length})`}
          subtitle="Boarding opens 5 min before takeoff. Head to the airport to board.">
          <ul className="text-xs divide-y divide-ink-100/5">
            {data.tickets.map(t => (
              <li key={t.id} className="py-1.5 flex items-baseline justify-between gap-2">
                <div>
                  <div className="capitalize text-ink-100">{t.class} → {prettyCity(t.to_city)}</div>
                  <div className="text-[11px] text-ink-100/70">Departs {fmtClock(t.departs_at)}</div>
                </div>
                <BoardCountdown departsAt={t.departs_at} boardingMs={data.schedule.boardingWindowMs} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Book a flight"
        subtitle={`Online markup ${data.markup_pct}% over the desk fare. ${data.boarding_note}`}>
        <div className="grid md:grid-cols-2 gap-3">
          {data.flights.map(f => {
            const out = outcome[f.city];
            const klass = pickedClass[f.city] || 'economy';
            const slot  = pickedSlot[f.city];
            return (
              <div key={f.city}
                className={`rounded-lg p-3 border bg-ink-950/40 ${f.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{f.emoji} {f.name}</div>
                  {f.locked && <LockBadge level={f.unlockLevel} />}
                </div>

                {/* Class picker — the price + flight time come from f.classes */}
                <div className="flex gap-1 mt-2 text-[11px]">
                  {Object.entries(f.classes).map(([k, v]) => (
                    <button key={k}
                      onClick={() => setPickedClass(s => ({ ...s, [f.city]: k }))}
                      disabled={f.locked}
                      className={`flex-1 px-1.5 py-1 rounded-md ${klass === k ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/85 hover:bg-ink-800/60'}`}>
                      <div className="capitalize">{k}</div>
                      <div className="text-[11px]">{fmt(v.cost)}</div>
                      <div className="text-[10px] opacity-80">
                        {v.durationMs === 0 ? 'instant' : `${Math.round(v.durationMs / 60_000)} min`}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Slot picker — the 4-hour timetable. Already-booked
                    slots are greyed out, slots in the past are too. */}
                <div className="mt-2">
                  <div className="text-[11px] uppercase tracking-wide text-ink-100/70 mb-1">Departure</div>
                  <div className="flex flex-wrap gap-1">
                    {f.slots.map(s => {
                      const past   = s.departs_at <= now;
                      const taken  = s.taken;
                      const chosen = slot === s.departs_at;
                      const disabled = f.locked || past || taken;
                      return (
                        <button key={s.departs_at}
                          onClick={() => setPickedSlot(o => ({ ...o, [f.city]: s.departs_at }))}
                          disabled={disabled}
                          title={taken ? 'Already booked' : past ? 'Already departed' : ''}
                          className={`px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
                            chosen ? 'bg-money-600 text-white' :
                            taken  ? 'bg-money-700/30 text-money-300 line-through' :
                            past   ? 'bg-ink-900/40 text-ink-100/40 line-through' :
                                     'bg-ink-900/60 text-ink-100/85 hover:bg-ink-800/60'
                          }`}>
                          {fmtClock(s.departs_at)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const dur = f.classes[klass]?.durationMs ?? 0;
                  const durTxt = dur === 0 ? 'instant arrival' : `${Math.round(dur / 60_000)}-min flight`;
                  return (
                    <div className="text-[11px] text-ink-100/85 mt-2 tabular-nums">
                      {fmtClock(slot || (data.schedule?.slots?.[0] ?? 0))} departure · {durTxt}
                      {dur > 0 && slot ? (
                        <> · lands {fmtClock(slot + dur)}</>
                      ) : null}
                    </div>
                  );
                })()}

                <button
                  disabled={f.locked || busy === `${f.city}` || (character?.bank ?? 0) < (f.classes[klass]?.cost || 0)}
                  onClick={() => book(f.city)}
                  className="btn btn-primary w-full text-xs mt-2">
                  {busy === `${f.city}` ? '…'
                    : (character?.bank ?? 0) < (f.classes[klass]?.cost || 0) ? 'Bank too low'
                    : slot ? `Book ${klass} — ${fmtClock(slot)}`
                    : `Book ${klass} — next departure`}
                </button>

                {out && (
                  <div className={`mt-2 px-2 py-1.5 rounded-md text-[12px] ${out.ok
                      ? 'bg-money-700/15 border border-money-500/40 text-money-200'
                      : 'bg-blood-700/15 border border-blood-500/40 text-blood-200'}`}>
                    {out.text}
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

// Formats an absolute ms timestamp as a wall-clock HH:MM.
function fmtClock(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function prettyCity(id) {
  return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function BoardCountdown({ departsAt, boardingMs }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const opensAt = departsAt - (boardingMs || 0);
  if (now >= departsAt) return <span className="text-blood-300 text-[11px] uppercase">Missed</span>;
  if (now >= opensAt)   return <span className="text-blood-300 tabular-nums">Boarding {fmtMmSs(departsAt - now)}</span>;
  return <span className="text-ink-100/85 tabular-nums">Opens {fmtMmSs(opensAt - now)}</span>;
}
function fmtMmSs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
