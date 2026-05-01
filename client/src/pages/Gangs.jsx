import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { useEventStream } from '../hooks/useEventStream.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

function FoundForm({ onCreated }) {
  const { refresh } = useGame();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/gangs', { name, tag, description: desc });
      await refresh();
      onCreated(r);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[10px] uppercase text-ink-100/55">Name (3–32 chars)</label>
        <input value={name} onChange={e=>setName(e.target.value)} maxLength={32}
          className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-[10px] uppercase text-ink-100/55">Tag (2–5 chars)</label>
        <input value={tag} onChange={e=>setTag(e.target.value.toUpperCase())} maxLength={5}
          className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm font-mono uppercase" />
      </div>
      <div>
        <label className="text-[10px] uppercase text-ink-100/55">Description (optional, 280 chars)</label>
        <textarea value={desc} onChange={e=>setDesc(e.target.value)} maxLength={280} rows={3}
          className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm" />
      </div>
      {err && <p className="text-xs text-blood-400">{err}</p>}
      <button disabled={busy} type="submit" className="btn btn-primary w-full text-xs">
        {busy ? '…' : 'Found gang'}
      </button>
    </form>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function Gangs() {
  const { character } = useGame();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [invites, setInvites] = useState([]);
  const [showFound, setShowFound] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    const [g, inv] = await Promise.all([
      api.get('/gangs'),
      api.get('/gangs/invites'),
    ]);
    setData(g);
    setInvites(inv.invites || []);
  }
  useEffect(() => { load(); }, []);

  useEventStream('gang.invite', () => load());
  useEventStream('gang.disbanded', () => load());

  async function accept(inviteId) {
    setBusy('accept-' + inviteId); setMsg(null);
    try {
      const r = await api.post(`/gangs/invites/${inviteId}/accept`);
      setMsg(`Joined "${r.gang.name}".`);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }
  async function decline(inviteId) {
    setBusy('decline-' + inviteId); setMsg(null);
    try {
      await api.post(`/gangs/invites/${inviteId}/decline`);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const inGang = !!data.you?.gang;

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      {inGang && (
        <Card>
          <p className="text-sm">
            You're in <Link to={`/gang`} className="text-blood-400 hover:underline font-medium">
              {data.you.gang.name} [{data.you.gang.tag}]
            </Link> as a <span className="uppercase text-[10px] tracking-wide">{data.you.role}</span>.
          </p>
        </Card>
      )}

      {invites.length > 0 && (
        <Card title="Pending invites">
          <ul className="space-y-2">
            {invites.map(i => (
              <li key={i.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{i.gang_name}</span>
                    <span className="text-[10px] text-ink-100/40 ml-2">[{i.gang_tag}]</span>
                  </div>
                  <div className="text-[10px] text-ink-100/45">from {i.inviter_avatar} {i.inviter_name}</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button disabled={busy === 'decline-' + i.id} onClick={() => decline(i.id)} className="btn btn-ghost text-xs">
                    {busy === 'decline-' + i.id ? '…' : 'Decline'}
                  </button>
                  <button disabled={busy === 'accept-' + i.id} onClick={() => accept(i.id)} className="btn btn-primary text-xs">
                    {busy === 'accept-' + i.id ? '…' : 'Accept'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!inGang && !showFound && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-100/70">
              No gang yet. Reach level 10 to found your own, or wait for an invite.
            </p>
            <button
              disabled={(character?.level ?? 0) < 10}
              onClick={() => setShowFound(true)}
              className="btn btn-primary text-xs">
              Found a gang
            </button>
          </div>
          {(character?.level ?? 0) < 10 && (
            <p className="text-[11px] text-ink-100/45 mt-2">You're level {character?.level} — need level 10.</p>
          )}
        </Card>
      )}

      {!inGang && showFound && (
        <Card title="Found a gang" right={
          <button onClick={() => setShowFound(false)} className="btn btn-ghost text-xs">Cancel</button>
        }>
          <FoundForm onCreated={() => { setShowFound(false); load(); nav('/gang'); }} />
        </Card>
      )}

      <Card title="🏴 Gang directory" subtitle={`${data.gangs.length} gang${data.gangs.length === 1 ? '' : 's'} active`}>
        {!data.gangs.length ? (
          <p className="text-sm text-ink-100/55">No gangs founded yet. Be the first.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.gangs.map(g => (
              <Link key={g.id} to={`/gangs/${g.id}`}
                className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-[10px] font-mono text-ink-100/55">[{g.tag}]</span>
                </div>
                <div className="text-[11px] text-ink-100/55 mt-1 line-clamp-2">{g.description || <span className="italic text-ink-100/40">No description.</span>}</div>
                <div className="text-[10px] text-ink-100/45 mt-2 flex justify-between">
                  <span>{g.member_count} member{g.member_count === 1 ? '' : 's'}</span>
                  <span>founded {timeAgo(g.founded_at)} ago</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
