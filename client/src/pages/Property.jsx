import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
import { fmt } from '../components/Money.jsx';

const TIER_EMOJI = { 1: '', 2: '', 3: '', 4: '' };

export default function Property() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/properties')); }
  useEffect(() => { load(); }, [character?.city]);

  async function buy(p) {
    setBusy(p.id); setMsg(null);
    try {
      await api.post('/properties/buy', { property_id: p.id });
      setMsg(`Bought ${p.name}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title=" Estate Agent" subtitle={`Listings in ${data.currentCityName}. Properties are city-locked — to buy a place in another city, fly there first.`} />

      <Card title="Your portfolio" subtitle={data.owned.length ? `${data.owned.length} propert${data.owned.length === 1 ? 'y' : 'ies'} across the world. Bonuses only apply in the city you're currently in.` : null}>
        {!data.owned.length ? <p className="text-sm text-ink-100/60">None yet — buy your first below.</p> : (
          <div className="grid sm:grid-cols-2 gap-2">
            {data.owned.map(p => {
              const here = p.city === data.currentCity;
              return (
                <div key={p.id} className={`rounded-md border p-3 ${here ? 'border-money-500/40 bg-money-600/10' : 'border-ink-100/10 bg-ink-950/40 opacity-70'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{TIER_EMOJI[p.tier] || ''} {p.name}</div>
                      {p.address && <div className="text-[12px] text-ink-100/45">{p.address}</div>}
                      <div className="text-[12px] mt-0.5">
                        <span className="text-ink-100/55">{p.cityName}</span>
                        <span className={`ml-2 text-[11px] uppercase tracking-wide ${here ? 'text-money-400' : 'text-ink-100/40'}`}>
                          {here ? ' Active here' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className={`text-[12px] text-right whitespace-nowrap ${here ? 'text-money-400' : 'text-ink-100/40'}`}>
                      +{p.bonuses?.max_energy} en<br/>
                      +{p.bonuses?.max_nerve} nv<br/>
                      +{p.bonuses?.happiness} hp
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={`For sale in ${data.currentCityName}`}>
        {!data.forSale.length ? <p className="text-sm text-ink-100/60">All bought up — or you've got a place at every tier here. Travel to see other markets.</p> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.forSale.sort((a, b) => a.cost - b.cost).map(p => (
              <div key={p.id} className={`rounded-lg p-3 border bg-ink-950/40 ${p.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{TIER_EMOJI[p.tier] || ''} {p.name}</div>
                    <div className="text-[12px] text-ink-100/45">{p.address}</div>
                    <div className="text-[12px] text-ink-100/50">{p.tierLabel} · Tier {p.tier}</div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-money-400 tabular-nums">{fmt(p.cost)}</div>
                    {p.locked && <div className="mt-1"><LockBadge level={p.levelGate} /></div>}
                  </div>
                </div>
                <div className="text-[13px] text-ink-100/60 mt-2">
                  +{p.bonuses.max_energy} energy · +{p.bonuses.max_nerve} nerve · +{p.bonuses.happiness} happiness
                </div>
                {p.garage > 0 && (
                  <div className="text-[12px] text-ink-100/50 mt-0.5"> {p.garage} garage spaces</div>
                )}
                <button disabled={p.locked || character.cash < p.cost || busy === p.id} className="btn btn-primary w-full text-xs mt-3" onClick={() => buy(p)}>
                  {busy === p.id
                    ? '...'
                    : p.locked
                      ? 'Locked'
                      : character.cash < p.cost ? `Need ${fmt(p.cost - character.cash)} more` : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
