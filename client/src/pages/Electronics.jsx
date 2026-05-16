import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Electronics Store — sells the devices that give in-game internet
// access (smartphone, laptop) plus burner phones for one-off DMs.
// Server-side gating in routes/electronics.js handles location +
// stock filtering.

export default function Electronics() {
  const { character, refresh, updateFromResponse } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/electronics')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function buy(item) {
    setBusy(`buy-${item.id}`); setMsg(null);
    try {
      const r = await api.post('/electronics/buy', { item_id: item.id, qty: 1 });
      updateFromResponse(r);
      setMsg(`Bought ${item.name} for ${fmt(item.cityCost)}.`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data || !character) return null;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-display text-xl text-ink-50">Electronics — {data.cityName}</h3>
        <p className="text-xs text-ink-100/60 mt-1">
          A smartphone gives you internet anywhere you go.
          A laptop lives where you put it — stash it at a property or in an active car,
          and you'll have internet whenever you're with it.
        </p>
        {msg && <p className="text-xs text-money-400 mt-2">{msg}</p>}
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.items.map(i => {
          const cantAfford = character.cash < i.cityCost;
          return (
            <Card key={i.id}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-medium truncate">{i.name}</div>
                {i.device && (
                  <span className="text-[11px] uppercase tracking-wide text-cyan-300">
                    {i.portable ? 'portable' : 'not portable'}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-ink-100/55 mt-1 min-h-[36px]">{i.desc}</p>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-money-400 font-semibold tabular-nums">{fmt(i.cityCost)}</span>
                <span className="text-[11px] text-ink-100/50">owned: {i.owned}</span>
              </div>
              <button
                disabled={cantAfford || busy === `buy-${i.id}`}
                onClick={() => buy(i)}
                className="btn btn-primary text-xs w-full mt-2">
                {busy === `buy-${i.id}` ? '…' : cantAfford ? 'Insufficient cash' : 'Buy'}
              </button>
            </Card>
          );
        })}
      </div>

      <Card title="Your connection right now"
        subtitle="The badge in the nav shows live internet status from anywhere.">
        <InternetStatus character={character} />
      </Card>
    </div>
  );
}

function InternetStatus({ character }) {
  const i = character.internet;
  if (!i) return <p className="text-xs text-ink-100/55">No status info.</p>;
  if (!i.online) {
    return (
      <p className="text-xs text-blood-300">
        Offline — no phone on you and no laptop where you are.
      </p>
    );
  }
  const labels = {
    phone:        'Online via the smartphone in your pocket.',
    laptop_home:  'Online via the laptop stashed at this property.',
    laptop_car:   'Online via the laptop in your active vehicle.',
  };
  return <p className="text-xs text-cyan-300">{labels[i.reason] || 'Online.'}</p>;
}
