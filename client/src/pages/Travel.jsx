import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
import TravelMap from '../components/TravelMap.jsx';
import { fmt } from '../components/Money.jsx';

// Format a positive ms duration as MM:SS for the live countdowns.
function mmss(ms) {
  if (ms <= 0) return '00:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function Travel() {
  const { refresh, character } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('commercial'); // 'commercial' | 'hangar'
  // tickFlag drives a 1Hz re-render so the countdowns update; stored
  // value isn't read directly.
  const [, setTickFlag] = useState(0);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/travel')); }
  useEffect(() => { load(); }, [character?.city]);

  // 1Hz timer + auto-reload right after each scheduled departure so
  // missed/boarded ticket statuses settle visually without a manual
  // refresh. The reload also catches the boarding window opening.
  const lastDepRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTickFlag(v => v + 1);
      const now = Date.now();
      const dep = data?.schedule?.nextDepartureAt;
      if (dep && now >= dep && lastDepRef.current !== dep) {
        lastDepRef.current = dep;
        load();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [data]);

  async function buyTicket(city, klass) {
    setBusy(`buy-${city}-${klass}`); setMsg(null);
    try {
      await api.post('/travel/ticket', { city, klass });
      setMsg('Ticket booked. Wait for boarding to open.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function board(ticketId) {
    setBusy(`board-${ticketId}`); setMsg(null);
    try {
      const r = await api.post(`/travel/board/${ticketId}`);
      setMsg(r.busted ? `Customs caught you — ${r.seized}, ${r.jailMin}m inside.` : 'On board. Have a smooth flight.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function drive(city) {
    setBusy(`drive-${city}`); setMsg(null);
    try {
      await api.post('/travel/drive', { city });
      setMsg('On the road.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const grounded = !!character?.active_vehicle_id;
  const now = Date.now();
  const sched = data.schedule;
  const departsAt = sched?.nextDepartureAt;
  const boardingOpensAt = departsAt - sched.boardingWindowMs;
  const inBoardingWindow = now >= boardingOpensAt && now < departsAt;
  // Map of "destination city → ticket I hold for it" so each flight
  // card knows whether to show a ticketed state instead of the
  // class-picker buttons.
  const ticketByCity = Object.fromEntries((data.tickets || []).map(t => [t.to_city, t]));

  // Travel progress map — shown when the player is mid-flight or
  // mid-drive between cities. Reads timestamps off the character
  // object so it survives a refresh. mode hint comes from the
  // character's last travel kick-off (boarded flight / drove
  // road trip / flew private aircraft) — see TravelProgress below.
  const travelling = character?.travel_until && character.travel_until > Date.now();

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      {travelling && (
        <TravelProgress character={character} onArrive={async () => { await refresh(); await load(); }} />
      )}

      {/* Tabs — split the airport into commercial (book a seat) and
          private/hangar (your own aircraft + storage). */}
      <div className="flex gap-1 text-xs">
        {[
          { id: 'commercial', label: 'Commercial Flights' },
          { id: 'hangar',     label: 'Private / Hangar'   },
        ].map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md ${tab === t.id ? 'bg-blood-700 text-white' : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/60'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'hangar' && <HangarPanel onChange={async () => { await refresh(); await load(); }} />}

      {tab === 'commercial' && <>
      <Card title=" Drive" subtitle="Cheaper, slower, no customs check at the border. You bring your active car with you.">
        {!grounded ? (
          <p className="text-xs text-ink-100/55">You need an active car to drive between cities. Buy or steal one first.</p>
        ) : !data.drives?.length ? (
          <p className="text-xs text-ink-100/55">No road from {data.currentCity} — that one's only reachable by air.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {data.drives.map(d => (
              <div key={d.city} className={`rounded-lg p-3 border bg-ink-950/40 ${d.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{d.name}</div>
                  {d.locked
                    ? <LockBadge level={d.unlockLevel} />
                    : <div className="text-[12px] text-ink-100/45 tabular-nums">{d.km.toLocaleString()} km</div>}
                </div>
                <div className="text-[13px] text-ink-100/60 mt-0.5">
                  {fmt(d.cost)} petrol · {Math.round(d.durationMs / 60000)} min · -{d.conditionCost.toFixed(1)}% condition
                </div>
                <button disabled={d.locked || !!busy || character.cash < d.cost} className="btn btn-money w-full text-xs mt-2"
                  onClick={() => drive(d.city)}>
                  {d.locked ? 'Locked' : busy === `drive-${d.city}` ? '…' : `Drive · ${fmt(d.cost)}`}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title=" Departures" subtitle={
          `Next flight in ${mmss(boardingOpensAt - now)}` +
          (inBoardingWindow ? ` · BOARDING NOW (${mmss(departsAt - now)} left)` : ` · 5 min cycle, 30 s boarding window`)
        }>
        {grounded && (
          <p className="text-xs text-yellow-300 mb-3">
            You're driving a car. Stash it in a garage before booking a flight.
          </p>
        )}
        <div className="rounded-md bg-ink-900/50 border border-ink-100/10 px-3 py-2 mb-3 flex items-baseline justify-between text-xs">
          <span className="text-ink-100/55 uppercase tracking-wide text-[11px]">Next flight</span>
          <span className={`tabular-nums font-medium ${inBoardingWindow ? 'text-blood-300' : 'text-ink-100'}`}>
            {inBoardingWindow ? `Take off in ${mmss(departsAt - now)}` : `Boarding opens in ${mmss(boardingOpensAt - now)}`}
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {data.flights.map(f => {
            const ticket = ticketByCity[f.city];
            const ticketBoarding = ticket && now >= (ticket.departs_at - sched.boardingWindowMs) && now < ticket.departs_at;
            return (
              <div key={f.city} className={`rounded-lg p-3 border bg-ink-950/40 ${f.locked ? 'border-ink-100/5 opacity-50 grayscale' : ticketBoarding ? 'border-blood-500/60 bg-blood-700/10' : 'border-ink-100/10'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{f.emoji} {f.name}</div>
                  {f.locked && <LockBadge level={f.unlockLevel} />}
                </div>

                {/* Ticketed state — show class, cost paid, board countdown. */}
                {ticket ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-[13px] text-ink-100/70">
                      Ticket: <b className="capitalize">{ticket.class}</b> · {fmt(ticket.cost)} paid
                    </div>
                    <div className={`text-xs tabular-nums ${ticketBoarding ? 'text-blood-300 font-semibold' : 'text-ink-100/55'}`}>
                      {ticketBoarding
                        ? `BOARDING — ${mmss(ticket.departs_at - now)} until takeoff`
                        : `Boards in ${mmss((ticket.departs_at - sched.boardingWindowMs) - now)}`}
                    </div>
                    <button
                      disabled={!ticketBoarding || !!busy || grounded}
                      onClick={() => board(ticket.id)}
                      className={`btn w-full text-xs ${ticketBoarding ? 'btn-primary animate-pulse' : ''}`}>
                      {busy === `board-${ticket.id}` ? '…'
                        : ticketBoarding ? `Board now — ${mmss(ticket.departs_at - now)}`
                        : 'Wait for boarding'}
                    </button>
                  </div>
                ) : (
                  // No ticket yet — show class picker buttons that
                  // BUY a ticket for the next departure.
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    {Object.entries(f.classes).map(([k, v]) => (
                      <button key={k}
                        disabled={f.locked || !!busy || grounded || character.cash < v.cost}
                        className="btn"
                        onClick={() => buyTicket(f.city, k)}>
                        <div>
                          <div className="capitalize">{k}</div>
                          <div className="text-[12px] text-ink-100/60">{fmt(v.cost)}</div>
                          <div className="text-[12px] text-ink-100/40">{v.durationMs === 0 ? 'instant' : `${Math.round(v.durationMs/60000)}m flight`}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      </>}
    </div>
  );
}

// Wrapper around TravelMap that infers the mode and auto-refreshes
// when arrival is due. The "mode" hint is best-effort — we don't
// currently log it on the character. Default to plane (commercial
// is the most common path); future enhancement: persist
// travel_mode = 'plane' | 'helicopter' | 'car' on travel start.
function TravelProgress({ character, onArrive }) {
  const fromCity = character.city; // pre-arrival, character.city is still origin
  // Actually `character.city` updates on arrival via applyTick;
  // the origin we need is captured from where they were when travel
  // started, which we don't persist. As a fallback, infer from the
  // route: travel_to is destination. We can't recover origin cleanly
  // for older sessions — for new sessions the origin equals
  // current city until applyTick flips it on arrival. Good enough
  // for V1: character.city always holds origin while in transit.
  const toCity   = character.travel_to;
  const started  = character.travel_started_at;
  const until    = character.travel_until;
  const mode     = character.travel_mode || 'plane';

  // Watch for arrival — refresh once when the timer hits zero so
  // the post-arrival state lands without a manual refresh.
  useEffect(() => {
    if (!until) return;
    const remaining = until - Date.now();
    if (remaining <= 0) {
      onArrive?.();
      return;
    }
    const t = setTimeout(() => onArrive?.(), remaining + 250);
    return () => clearTimeout(t);
  }, [until, onArrive]);

  if (!fromCity || !toCity || !until) return null;

  return (
    <TravelMap
      fromCity={fromCity}
      toCity={toCity}
      startedAt={started}
      until={until}
      mode={mode}
      label={mode === 'car' ? 'Driving cross-country' : mode === 'helicopter' ? 'Helicopter in flight' : 'Flight in progress'}
    />
  );
}

// ─── Private / Hangar tab ────────────────────────────────────
// Shows the local hangar in this city: status, slot upgrades,
// aircraft for sale, your aircraft parked here + a "Fly to..."
// action per aircraft. Hits /api/hangar/* — all gated to the
// airport location server-side. Reloads on every action.
function HangarPanel({ onChange }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg]   = useState(null);
  const [flyOpen, setFlyOpen] = useState(null); // aircraft row id

  async function load() {
    try { setData(await api.get('/hangar')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function call(action, body) {
    setBusy(action); setMsg(null);
    try {
      await api.post(`/hangar/${action}`, body || {});
      await onChange?.();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading hangar…</p></Card>;

  const h = data.hangar;

  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-xs text-blood-300">{msg}</p></Card>}

      {/* Hangar status */}
      <Card title={`Your Hangar — ${data.cityName}`}
        subtitle={h
          ? 'Storage for planes, helicopters, and one car-park area for the ride you came in on.'
          : `No hangar in this city yet. Hangars are commercial real estate — title is held at the Estate Agent.`}>
        {!h ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-ink-100/65">
              Buy a hangar at the Estate Agent. Once you own it, manage upgrades / refuel / take-off from this page.
            </p>
            <Link to="/property" className="btn btn-primary text-xs">
              Visit Estate Agent →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {['plane', 'helicopter', 'car'].map(slot => {
                const s = h.slots[slot];
                const max = data.maxSlots[slot === 'helicopter' ? 'heli' : slot];
                const nextCost = data.upgradeCosts[slot === 'helicopter' ? 'heli' : slot][s.capacity - 1];
                const atMax = s.capacity >= max;
                return (
                  <div key={slot} className="rounded-md border border-ink-100/10 bg-ink-950/40 p-2">
                    <div className="text-[11px] uppercase tracking-wide text-ink-100/55">{slot}s</div>
                    <div className="font-display text-xl text-ink-50 tabular-nums">{s.used}/{s.capacity}</div>
                    <div className="text-[11px] text-ink-100/45">cap {max}</div>
                    {atMax
                      ? <div className="text-[11px] uppercase text-money-300 mt-1">maxed</div>
                      : <button
                          disabled={busy === `upgrade-${slot}`}
                          onClick={() => call('upgrade', { slot })}
                          className="btn btn-ghost text-[11px] w-full mt-1">
                          + £{nextCost.toLocaleString()}
                        </button>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Aircraft parked here */}
      {h && (
        <Card title="Your aircraft here"
          subtitle={data.my_aircraft_here.length === 0
            ? 'Nothing parked in this hangar yet. Buy a plane or helicopter below.'
            : `${data.my_aircraft_here.length} aircraft parked in this hangar.`}>
          {data.my_aircraft_here.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2">
              {data.my_aircraft_here.map(a => (
                <div key={a.id} className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-medium truncate">{a.maker} {a.name}</div>
                    <span className="text-[11px] uppercase tracking-wide text-ink-100/55">{a.class}</span>
                  </div>
                  <div className="text-[12px] text-ink-100/55 mt-0.5">Tier {a.tier}</div>
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <span className="text-ink-100/45 w-10">Fuel</span>
                    <div className="flex-1 h-1.5 rounded-full bg-ink-800 overflow-hidden">
                      <div className={a.fuel >= 50 ? 'bg-cyan-400' : a.fuel >= 20 ? 'bg-yellow-400' : 'bg-blood-500'}
                        style={{ width: `${Math.max(0, Math.min(100, a.fuel))}%`, height: '100%' }} />
                    </div>
                    <span className="tabular-nums text-ink-100/55 w-10 text-right">{Math.round(a.fuel)}%</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      disabled={busy === `refuel-${a.id}` || a.fuel >= 100}
                      onClick={() => call('refuel', { aircraft_row_id: a.id })}
                      className="btn btn-ghost text-[11px]">
                      Refuel
                    </button>
                    <button
                      disabled={busy === `fly-${a.id}`}
                      onClick={() => setFlyOpen(a.id)}
                      className="btn btn-primary text-[11px]">
                      Fly to…
                    </button>
                  </div>
                  {flyOpen === a.id && (
                    <FlyPicker
                      hangars={data.my_hangars}
                      currentCity={data.city}
                      onCancel={() => setFlyOpen(null)}
                      onPick={async (toCity) => {
                        setFlyOpen(null);
                        await call('fly', { aircraft_row_id: a.id, to_city: toCity });
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Aircraft sales moved to the Aircraft Broker — see /aircraft-dealer. */}
      {h && (
        <Card title="Buy & sell aircraft"
          subtitle="Sales happen at the Aircraft Broker — a short walk from the airport. Your aircraft are flown in from there to land in this hangar.">
          <Link
            to="/city"
            className="btn btn-ghost text-xs">
            Open city map →
          </Link>
        </Card>
      )}

      {/* Other hangars I own */}
      {h && data.my_hangars.length > 1 && (
        <Card title="Your other hangars" subtitle="Cities where you can land your aircraft.">
          <ul className="text-sm space-y-1">
            {data.my_hangars.filter(o => o.city !== data.city).map(o => (
              <li key={o.id} className="flex justify-between border-b border-ink-100/5 py-1 last:border-0">
                <span className="text-ink-100/85">{o.cityName}</span>
                <span className="text-[12px] text-ink-100/55 tabular-nums">
                  {o.plane_slots}p · {o.heli_slots}h · {o.car_slots}c
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// Lightweight destination picker — lists cities where the player
// owns a hangar (excluding the current city). Picking one fires the
// fly action; server validates everything else.
function FlyPicker({ hangars, currentCity, onCancel, onPick }) {
  const destinations = (hangars || []).filter(h => h.city !== currentCity);
  return (
    <div className="mt-2 rounded-md border border-cyan-500/40 bg-cyan-900/15 p-2">
      <div className="text-[11px] uppercase tracking-wide text-cyan-300 mb-1">Pick a destination hangar</div>
      {destinations.length === 0 ? (
        <p className="text-[12px] text-ink-100/65">No other hangars to land at — buy one in another city first.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {destinations.map(d => (
            <button key={d.id}
              onClick={() => onPick(d.city)}
              className="btn btn-ghost text-[11px]">
              {d.cityName} →
            </button>
          ))}
        </div>
      )}
      <button onClick={onCancel} className="text-[11px] text-ink-100/55 mt-2 hover:text-ink-100/80">
        Cancel
      </button>
    </div>
  );
}
