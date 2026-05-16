import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
import { fmt } from '../components/Money.jsx';

// In-game internet portal. The whole page requires online status —
// character.internet.online comes from the server on every refresh.
// Online services charge a small markup over in-store prices and
// debit from the player's bank balance (not pocket cash).

export default function Online() {
  const { character } = useGame();
  const [tab, setTab] = useState('flights');

  if (!character) return null;
  const i = character.internet;
  if (!i?.online) {
    return (
      <div className="space-y-3">
        <Card title="Offline">
          <p className="text-xs text-ink-100/65">
            You can't get online from here. Carry a smartphone, or be at a property /
            in your active vehicle with a laptop stashed there.
          </p>
          <Link to="/electronics" className="btn btn-primary text-xs mt-2 inline-block">
            Buy a device →
          </Link>
        </Card>
      </div>
    );
  }

  const TABS = [
    { id: 'flights',  label: 'Flights'  },
    { id: 'vehicles', label: 'Vehicles' },
    { id: 'weapons',  label: 'Weapons'  },
  ];

  const viaLabel = {
    phone:       'connected on your phone',
    laptop_home: 'connected on the laptop at this property',
    laptop_car:  'connected on the laptop in your active vehicle',
  }[i.reason] || 'connected';

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
    </div>
  );
}

function WeaponsTab() {
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
      setMsg(`Ordered. ETA ~${data.leadHours}h.`);
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
        subtitle={`Online markup ${data.markup_pct}%. Lead time ~${data.leadHours}h. Goods land in the property's house stash.`}>
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

function VehiclesTab() {
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

function FlightsTab() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/online/flights')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function book(city, klass) {
    setBusy(`${city}-${klass}`); setMsg(null);
    try {
      await api.post('/online/flights/ticket', { city, klass });
      setMsg('Ticket booked. Head to the airport to board.');
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading flights…</p></Card>;

  return (
    <Card title="Book a flight"
      subtitle={`Online markup ${data.markup_pct}% over the desk fare. ${data.boarding_note}`}>
      {msg && <p className="text-xs text-money-400 mb-2">{msg}</p>}
      <div className="grid md:grid-cols-2 gap-3">
        {data.flights.map(f => (
          <div key={f.city}
            className={`rounded-lg p-3 border bg-ink-950/40 ${f.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-medium">{f.emoji} {f.name}</div>
              {f.locked && <LockBadge level={f.unlockLevel} />}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              {Object.entries(f.classes).map(([k, v]) => {
                const tooPoor = (character?.bank ?? 0) < v.cost;
                return (
                  <button key={k}
                    disabled={f.locked || busy === `${f.city}-${k}` || tooPoor}
                    className="btn"
                    onClick={() => book(f.city, k)}>
                    <div>
                      <div className="capitalize">{k}</div>
                      <div className="text-[12px] text-ink-100/70">{fmt(v.cost)}</div>
                      <div className="text-[11px] text-ink-100/45 line-through">{fmt(v.base)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
