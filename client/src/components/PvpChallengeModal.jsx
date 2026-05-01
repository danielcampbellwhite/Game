import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';

// Mounted once at the app shell level. Listens for incoming pvp.challenged
// events and renders a blocking modal until the player decides. Also picks
// up any already-pending incoming challenge on mount (covers reload of an
// open game while a challenge is in-flight).

function timeLeft(deadline) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export default function PvpChallengeModal() {
  const { token, character, refresh } = useGame();
  const nav = useNavigate();
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(null);
  const [, force] = useState(0);

  // Initial sync — fetch any pending incoming challenge on mount.
  useEffect(() => {
    if (!token || !character) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get('/pvp/state');
        if (cancelled) return;
        // If we're already in a fight, push us to the fight page.
        if (s.fight) {
          nav('/pvp/fight');
          return;
        }
        if (s.incoming?.length) setChallenge(s.incoming[0]);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [token, character?.id]);

  useEventStream('pvp.challenged', (p) => {
    if (p?.challenge) setChallenge(p.challenge);
  });

  // Auto-clear when fight starts (we get pushed pvp.fight_started which
  // navigates to the fight page; the modal goes away).
  useEventStream('pvp.fight_started', () => {
    setChallenge(null);
    nav('/pvp/fight');
  });

  // Tick once a second so the countdown updates.
  useEffect(() => {
    if (!challenge) return;
    const id = setInterval(() => force(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [challenge?.id]);

  // Auto-clear when expired.
  useEffect(() => {
    if (!challenge) return;
    if (timeLeft(challenge.expires_at) <= 0) setChallenge(null);
  });

  if (!challenge) return null;

  const remaining = timeLeft(challenge.expires_at);

  async function accept() {
    setBusy('accept');
    try {
      await api.post(`/pvp/challenges/${challenge.id}/accept`);
      setChallenge(null);
      await refresh();
      nav('/pvp/fight');
    } catch (e) {
      alert(e.message);
      setChallenge(null);
    } finally { setBusy(null); }
  }
  async function decline() {
    setBusy('decline');
    try {
      await api.post(`/pvp/challenges/${challenge.id}/decline`);
    } catch {}
    setChallenge(null);
    setBusy(null);
  }

  const isMurder = challenge.mode === 'murder';
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`bg-ink-950 ${isMurder ? 'border-2 border-blood-500' : 'border border-blood-500/40'} rounded-xl shadow-2xl shadow-black/60 max-w-sm w-full p-5 space-y-4`}>
        <div className="flex items-baseline gap-3">
          <div className="text-4xl">{challenge.other?.avatar}</div>
          <div className="min-w-0">
            <div className="font-display text-xl">
              <Link to={`/players/${challenge.other?.id}`} className="hover:text-blood-400" onClick={() => setChallenge(null)}>
                {challenge.other?.name}
              </Link>
            </div>
            <div className={`text-[10px] uppercase tracking-wide ${isMurder ? 'text-blood-300' : 'text-blood-400'}`}>
              {isMurder ? '☠️ Wants to KILL you' : '⚔ Wants to fight you'}
            </div>
          </div>
        </div>
        {isMurder ? (
          <p className="text-xs text-blood-300">
            ☠️ This is a MURDER challenge — your character will be permanently deleted if you lose.
            All cash on hand will go to your killer. Bank, gear and progression all lost. Are you ready?
          </p>
        ) : (
          <p className="text-xs text-ink-100/65">
            A bare-knuckle fight, turn-based. Loser ends up in hospital and forfeits 5% of cash on hand.
          </p>
        )}
        <div className="text-[11px] text-ink-100/55 tabular-nums">Auto-declines in {remaining}s</div>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy != null} onClick={decline} className="btn btn-ghost text-xs">
            {busy === 'decline' ? '…' : 'Decline'}
          </button>
          <button disabled={busy != null} onClick={accept} className={`btn ${isMurder ? 'btn-primary' : 'btn-primary'} text-xs`}>
            {busy === 'accept' ? '…' : (isMurder ? 'Accept (final)' : 'Accept fight')}
          </button>
        </div>
      </div>
    </div>
  );
}
