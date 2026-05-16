import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Aircraft Broker — private aviation sales floor. Split out from the
// airport so buying / selling has its own physical address. Storage,
// refuelling, and take-offs still happen at the airport hangar; this
// page is purchase + trade-in only.

export default function AircraftDealer() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  const [sellTarget, setSellTarget] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/aircraft-dealer')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [character?.city]);

  async function buy(a) {
    setBusy(`buy-${a.id}`); setMsg(null);
    try {
      await api.post('/aircraft-dealer/buy', { aircraft_id: a.id });
      setMsg(`Bought ${a.maker} ${a.name} for ${fmt(a.bookPrice)}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function sell(row) {
    setBusy(`sell-${row.id}`); setMsg(null);
    try {
      await api.post('/aircraft-dealer/sell', { aircraft_row_id: row.id });
      setMsg(`Sold ${row.maker} ${row.name} for ${fmt(row.payout)}.`);
      setSellTarget(null);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;

  const planes = (data.aircraft_catalog || []).filter(a => a.class === 'plane');
  const helis  = (data.aircraft_catalog || []).filter(a => a.class === 'helicopter');
  const hangar = data.hangar;

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl text-ink-50">Aircraft Broker — {data.cityName}</h3>
          <p className="text-xs text-ink-100/60 mt-1">
            Private aviation sales. New aircraft are flown straight into your{' '}
            <span className="text-ink-100/85">{data.cityName} hangar</span> and parked.
            Trade-ins are paid out at 60% of book value, scaled by condition.
          </p>
          {!hangar && (
            <p className="text-xs text-yellow-300 mt-2">
              You don't own a hangar in {data.cityName} yet — buy one at the airport before you order an aircraft.
            </p>
          )}
        </div>
      </Card>

      {/* Trade-ins — only show if there's at least one aircraft parked here */}
      {data.my_aircraft_here.length > 0 && (
        <Card title="Trade in"
          subtitle="Aircraft currently parked in your local hangar. Selling pays out and frees the slot.">
          <div className="grid sm:grid-cols-2 gap-2">
            {data.my_aircraft_here.map(row => (
              <div key={row.id} className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium truncate">{row.maker} {row.name}</div>
                  <span className="text-[11px] uppercase tracking-wide text-ink-100/55">{row.class}</span>
                </div>
                <div className="text-[12px] text-ink-100/55 mt-0.5">
                  Tier {row.tier} · {Math.round(row.condition)}% condition · book {fmt(row.book)}
                </div>
                <div className="text-money-400 font-semibold mt-1 tabular-nums">Offer: {fmt(row.payout)}</div>
                {sellTarget === row.id ? (
                  <div className="mt-2 border border-blood-500/40 bg-blood-700/10 rounded-md p-2 text-[11px]">
                    <div className="mb-1">Confirm sale of <b>{row.maker} {row.name}</b> for <b>{fmt(row.payout)}</b>?</div>
                    <div className="flex gap-1.5">
                      <button onClick={() => sell(row)} disabled={busy === `sell-${row.id}`} className="btn btn-primary text-[11px] flex-1">
                        {busy === `sell-${row.id}` ? '…' : 'Confirm sell'}
                      </button>
                      <button onClick={() => setSellTarget(null)} disabled={busy === `sell-${row.id}`} className="btn btn-ghost text-[11px]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setSellTarget(row.id)}
                    className="btn btn-ghost text-xs w-full mt-2">
                    Sell — {fmt(row.payout)}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sales catalog — planes then helicopters */}
      <Card title="Planes for sale"
        subtitle="Single- and twin-engine private planes through to long-haul jets. Drops into your local hangar.">
        <AircraftGrid list={planes} hangar={hangar} cash={character.cash} busy={busy} onBuy={buy} />
      </Card>

      <Card title="Helicopters for sale"
        subtitle="Light pistons up to corporate twins. Same hangar storage rules apply.">
        <AircraftGrid list={helis} hangar={hangar} cash={character.cash} busy={busy} onBuy={buy} />
      </Card>
    </div>
  );
}

function AircraftGrid({ list, hangar, cash, busy, onBuy }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {list.map(a => {
        const slot = hangar?.slots?.[a.class];
        const noHangar = !hangar;
        const noSlot = hangar && (!slot || slot.free <= 0);
        const broke = cash < a.bookPrice;
        const disabled = noHangar || noSlot || broke || busy === `buy-${a.id}`;
        return (
          <div key={a.id} className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-medium truncate">{a.maker} {a.name}</div>
              <span className="text-[11px] uppercase tracking-wide text-ink-100/55">{a.class}</span>
            </div>
            <div className="text-[12px] text-ink-100/55">Tier {a.tier}</div>
            <div className="text-money-400 font-semibold mt-1 tabular-nums">{fmt(a.bookPrice)}</div>
            <button
              disabled={disabled}
              onClick={() => onBuy(a)}
              className="btn btn-primary text-xs w-full mt-2">
              {busy === `buy-${a.id}` ? '…'
                : noHangar ? 'Need hangar'
                : noSlot ? `No ${a.class} slot`
                : broke ? 'Insufficient cash'
                : 'Buy'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
