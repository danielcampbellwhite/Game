import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
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

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

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
          (inBoardingWindow ? ` · BOARDING NOW (${mmss(departsAt - now)} left)` : ` · boarding 1 min before takeoff`)
        }>
        {grounded && (
          <p className="text-xs text-yellow-300 mb-3">
            You're driving a car. Stash it in a garage before booking a flight.
          </p>
        )}
        <div className="rounded-md bg-ink-900/50 border border-ink-100/10 px-3 py-2 mb-3 flex items-baseline justify-between text-xs">
          <span className="text-ink-100/55 uppercase tracking-wide text-[11px]">Schedule (UTC)</span>
          <span className="tabular-nums text-money-300">{new Date(departsAt).toUTCString().slice(17, 22)} departure</span>
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
    </div>
  );
}
