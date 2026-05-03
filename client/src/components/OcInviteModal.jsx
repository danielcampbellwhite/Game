import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import { fmt } from './Money.jsx';

// Mounted at the app shell. Pops up when an SSE oc.invite event lands and
// stays until the player accepts/declines or it's manually dismissed.
export default function OcInviteModal() {
  const { token, character } = useGame();
  const nav = useNavigate();
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(null);

  useEventStream('oc.invite', (p) => {
    if (p) setInvite(p);
  });

  if (!invite || !token || !character) return null;
  const role = invite.crime?.roles?.find(r => r.id === invite.role_id);

  async function accept() {
    setBusy('accept');
    try {
      await api.post(`/oc/plans/${invite.plan_id}/accept`, { role_id: invite.role_id });
      setInvite(null);
      nav(`/oc/plans/${invite.plan_id}`);
    } catch (e) {
      alert(e.message);
      setInvite(null);
    } finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ink-950 border border-money-500/40 rounded-xl shadow-2xl shadow-black/60 max-w-sm w-full p-5 space-y-4">
        <div className="flex items-baseline gap-3">
          <div className="text-4xl">{invite.crime?.emoji}</div>
          <div className="min-w-0">
            <div className="font-display text-xl">{invite.crime?.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-money-400"> Heist invite</div>
          </div>
        </div>
        <p className="text-xs text-ink-100/65">
          <Link to={`/players/${invite.inviter?.id}`} className="hover:text-blood-400 font-medium" onClick={() => setInvite(null)}>
            {invite.inviter?.avatar} {invite.inviter?.name}
          </Link>{' '}
          wants you on the crew as <b>{role?.name || invite.role_id}</b>.
        </p>
        <div className="text-[11px] text-ink-100/55">
          Payout {fmt(invite.crime?.payoutMin)}–{fmt(invite.crime?.payoutMax)} · {invite.crime?.risk} risk · Lvl {invite.crime?.levelGate}+
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy != null} onClick={() => setInvite(null)} className="btn btn-ghost text-xs">Dismiss</button>
          <button disabled={busy != null} onClick={accept} className="btn btn-primary text-xs">
            {busy === 'accept' ? '…' : 'Accept role'}
          </button>
        </div>
      </div>
    </div>
  );
}
