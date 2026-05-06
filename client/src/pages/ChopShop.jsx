import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';
import { storefront } from '../lib/storefronts.js';

export default function ChopShop() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/chopshop')); }
  useEffect(() => { load(); }, []);

  async function sell(v, where) {
    setBusy(`${where}-${v.id}`); setMsg(null);
    try {
      const r = await api.post('/chopshop/sell', { id: v.id, where });
      if (r.busted) setMsg(` STING — lost the ${v.maker} ${v.name} and jailed ${r.jailMin}m!`);
      else setMsg(`Sold ${v.maker} ${v.name} for ${fmt(r.payout)}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const shop = storefront('chop', character?.city);
  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title={`${shop.name} & Black-Market Dealer`} subtitle={`Operating out of ${data.cityName}.`}>
        <p className="text-[13px] text-ink-100/60">
          Two ways to move metal. <span className="text-money-400">Chop shop</span> turns it into parts —
          fast, no fuss, but you get just <b>{(data.chopRate * 100).toFixed(0)}%</b> of book.
          The <span className="text-blood-400">black-market dealer</span> reworks the title and gets you
          <b> {(data.dealerRate * 100).toFixed(0)}%</b> — but there's a small chance it's an undercover sting.
        </p>
        <p className="text-[13px] text-ink-100/50 mt-2">Both options pay out in legal cash — the chop shop and dealer rework the chassis paperwork before settling up.</p>
      </Card>

      {!data.vehicles.length ? (
        <Card><p className="text-sm text-ink-100/60">No active car. Drive a car here (or pull a GTA crime) before trying to sell.</p></Card>
      ) : (
        <Card title="Your active car">
          <div className="grid sm:grid-cols-2 gap-3">
            {data.vehicles.map(v => (
              <div key={v.id} className={`rounded-lg p-3 border bg-ink-950/40 ${v.is_modified ? 'border-yellow-500/40' : 'border-ink-100/10'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{v.maker} {v.name}{v.is_modified && <span className="ml-2 text-[12px] uppercase text-yellow-300"> modded</span>}</div>
                    <div className="text-[13px] text-ink-100/60">Tier {v.tier} · book {fmt(v.book)} · {v.acquired_via === 'stolen' ? ' stolen' : ' bought'}</div>
                    <div className="text-[12px] text-ink-100/40">{v.cityName}</div>
                  </div>
                </div>
                {v.is_modified ? (
                  <p className="text-[13px] text-yellow-300 mt-3">
                    Customised — list it on a player shop, or strip the mods first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <button disabled={busy === `chop-${v.id}`} className="btn btn-money"
                      onClick={() => sell(v, 'chop')}>
                      Chop · {fmt(v.chopPrice)}
                    </button>
                    <button disabled={busy === `dealer-${v.id}`} className="btn btn-primary"
                      onClick={() => sell(v, 'dealer')}>
                      Dealer · {fmt(v.dealerPrice)}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
