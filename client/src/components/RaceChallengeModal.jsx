import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import { fmt } from './Money.jsx';

// App-shell modal for incoming street-race challenges. Listens to the
// race.challenged event, also picks up any pending race on mount so a
// reload mid-race recovers the prompt.

function timeLeft(deadline) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export default function RaceChallengeModal() {
  const { token, character, refresh } = useGame();
  const nav = useNavigate();
  const [race, setRace] = useState(null);
  const [busy, setBusy] = useState(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (!token || !character) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/races');
        if (cancelled) return;
        if (r.incoming?.length) setRace(r.incoming[0]);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [token, character?.id]);

  useEventStream('race.challenged', (p) => {
    if (p?.race) setRace(p.race);
  });
  useEventStream('race.cancelled', () => setRace(null));

  // Tick every second so the countdown updates.
  useEffect(() => {
    if (!race) return;
    const id = setInterval(() => force(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [race?.id]);

  // Auto-clear when expired.
  useEffect(() => {
    if (!race) return;
    if (timeLeft(race.expires_at) <= 0) setRace(null);
  });

  if (!race) return null;
  const remaining = timeLeft(race.expires_at);

  async function accept() {
    setBusy('accept');
    try {
      const r = await api.post(`/races/${race.id}/accept`);
      setRace(null);
      await refresh();
      // Send the player to the races page so they can read the result.
      nav('/races');
      return r;
    } catch (e) {
      alert(e.message);
      setRace(null);
    } finally { setBusy(null); }
  }
  async function decline() {
    setBusy('decline');
    try { await api.post(`/races/${race.id}/decline`); } catch {}
    setRace(null); setBusy(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ink-950 border border-yellow-500/40 rounded-xl shadow-2xl shadow-black/60 max-w-sm w-full p-5 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-yellow-300"> Street race</div>
          <div className="font-display text-xl mt-0.5">Tier {race.tier} for {fmt(race.stake)}</div>
        </div>
        <p className="text-xs text-ink-100/65">
          You both put up <span className="text-money-300 tabular-nums">{fmt(race.stake)}</span>. Winner takes
          the pot. Both cars lose 5–20% condition either way.
        </p>
        <div className="text-[11px] text-ink-100/55 tabular-nums">Auto-declines in {remaining}s</div>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy != null} onClick={decline} className="btn btn-ghost text-xs">
            {busy === 'decline' ? '…' : 'Decline'}
          </button>
          <button disabled={busy != null} onClick={accept} className="btn btn-money text-xs">
            {busy === 'accept' ? '…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
