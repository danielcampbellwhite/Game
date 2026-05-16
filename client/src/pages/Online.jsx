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
    { id: 'flights', label: 'Flights' },
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

      {tab === 'flights' && <FlightsTab />}
    </div>
  );
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
