import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useEventStream } from '../hooks/useEventStream.js';
import Card from '../components/Card.jsx';

// Friends page — accepted list + pending in/out, with accept/reject/
// remove buttons. Subscribes to friend.* SSE events so the page
// updates live when someone accepts you on the other side.

function FriendRow({ row, busy, actions }) {
  const o = row.other;
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-ink-100/10 bg-ink-950/40 px-3 py-2">
      <Link to={`/players/${o.id}`} className="min-w-0 flex items-center gap-2">
        <span className="text-2xl shrink-0" aria-hidden>{o.avatar || '👤'}</span>
        <span className="min-w-0">
          <span className="block text-sm text-ink-50 truncate">{o.name}</span>
          <span className="block text-[11px] text-ink-100/50">
            Lvl {o.level}{o.faction ? ` · ${o.faction}` : ''}
          </span>
        </span>
      </Link>
      <div className="shrink-0 flex gap-1">{actions}</div>
    </li>
  );
}

export default function Friends() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get('/friends')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  // Live refresh on accept / new request — keeps both sides in sync.
  useEventStream('friend.accepted', () => { load(); });
  useEventStream('friend.requested', () => { load(); });

  async function act(endpoint, charId, method = 'post') {
    setBusy(`${endpoint}-${charId}`); setMsg(null);
    try {
      if (method === 'delete') {
        await api.delete('/friends', { char_id: charId });
      } else {
        await api.post(`/friends/${endpoint}`, { char_id: charId });
      }
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      {data.incoming.length > 0 && (
        <Card title="Friend requests" subtitle={`${data.incoming.length} pending — waiting on you.`}>
          <ul className="space-y-2">
            {data.incoming.map(row => (
              <FriendRow key={row.id} row={row} busy={busy} actions={
                <>
                  <button
                    disabled={busy === `accept-${row.other.id}`}
                    onClick={() => act('accept', row.other.id)}
                    className="btn btn-primary text-xs">
                    {busy === `accept-${row.other.id}` ? '…' : 'Accept'}
                  </button>
                  <button
                    disabled={busy === `reject-${row.other.id}`}
                    onClick={() => act('reject', row.other.id)}
                    className="btn btn-ghost text-xs">
                    {busy === `reject-${row.other.id}` ? '…' : 'Reject'}
                  </button>
                </>
              } />
            ))}
          </ul>
        </Card>
      )}

      <Card title="Friends" subtitle={data.accepted.length
        ? `${data.accepted.length} friend${data.accepted.length === 1 ? '' : 's'}.`
        : 'No friends yet — add someone from their profile.'}>
        {data.accepted.length === 0 ? null : (
          <ul className="space-y-2">
            {data.accepted.map(row => (
              <FriendRow key={row.id} row={row} busy={busy} actions={
                <>
                  <Link to={`/messages/with/${row.other.id}`} className="btn btn-ghost text-xs">DM</Link>
                  <button
                    disabled={busy === `remove-${row.other.id}`}
                    onClick={() => act('', row.other.id, 'delete')}
                    className="btn btn-ghost text-xs">
                    {busy === `remove-${row.other.id}` ? '…' : 'Remove'}
                  </button>
                </>
              } />
            ))}
          </ul>
        )}
      </Card>

      {data.outgoing.length > 0 && (
        <Card collapsible title="Sent requests" subtitle={`${data.outgoing.length} waiting on a reply.`}>
          <ul className="space-y-2">
            {data.outgoing.map(row => (
              <FriendRow key={row.id} row={row} busy={busy} actions={
                <button
                  disabled={busy === `cancel-${row.other.id}`}
                  onClick={() => act('reject', row.other.id)}
                  className="btn btn-ghost text-xs">
                  {busy === `cancel-${row.other.id}` ? '…' : 'Cancel'}
                </button>
              } />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
