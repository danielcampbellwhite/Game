import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';

// Self-contained chat panel. All of the chat logic that used to live
// inside ChatWidget — channels, SSE wiring, unread tracking, sending —
// without any of the floating-button / drag chrome. Designed to slot
// inside the PhoneOverlay screen so it fills its parent's box.
//
// Props:
//   onPickDms — optional callback fired when the user taps the DMs
//   tab from the channel row, so the parent can switch the phone to
//   the messages route or navigate away.

const CHANNELS = [
  { id: 'world',   label: 'World'   },
  { id: 'faction', label: 'Faction' },
  { id: 'gang',    label: 'Gang'    },
];

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageList({ messages, myCharId }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);
  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-ink-100/45 px-4 text-center">
        No messages yet. Say something.
      </div>
    );
  }
  return (
    <div ref={ref} className="flex-1 overflow-y-auto scrollbar px-3 py-2 space-y-1.5">
      {messages.map(m => {
        const mine = m.char_id === myCharId;
        return (
          <div key={m.id} className="text-[13px] leading-snug">
            <div className="flex items-baseline gap-2">
              <Link to={`/players/${m.char_id}`}
                className={`font-medium truncate ${mine ? 'text-money-300' : 'text-blood-300'}`}>
                {m.name}
              </Link>
              <span className="text-[10px] text-ink-100/40 tabular-nums">{fmtTime(m.created_at)}</span>
            </div>
            <div className="text-ink-100/90 whitespace-pre-wrap break-words">{m.body}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ChatPanel({ onPickDms }) {
  const { character, token } = useGame();
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('mafia_chat_tab') || 'world'; } catch { return 'world'; }
  });
  const [byChannel, setByChannel] = useState({ world: [], faction: [], gang: [] });
  const [unavail, setUnavail]   = useState({ world: null, faction: null, gang: null });
  const [unread, setUnread]     = useState({ world: 0, faction: 0, gang: 0 });
  const [dmUnread, setDmUnread] = useState(0);
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const [err, setErr]           = useState(null);

  useEffect(() => { try { localStorage.setItem('mafia_chat_tab', tab); } catch {} }, [tab]);

  async function loadChannel(channel) {
    try {
      const r = await api.get(`/chat/${channel}`);
      setUnavail(u => ({ ...u, [channel]: r.unavailable || null }));
      setByChannel(s => ({ ...s, [channel]: r.messages || [] }));
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => {
    if (!token || !character) return;
    loadChannel('world'); loadChannel('faction'); loadChannel('gang');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  useEffect(() => {
    if (!token || !character) return;
    api.get('/messages/unread').then(r => setDmUnread(r.total_unread || 0)).catch(() => {});
  }, [character?.id]);
  useEventStream('dm.unread', (p) => { if (p?.total_unread != null) setDmUnread(p.total_unread); });

  useEventStream('chat.message', (m) => {
    if (!m?.channel) return;
    setByChannel(s => {
      const arr = (s[m.channel] || []).slice();
      arr.push(m);
      if (arr.length > 300) arr.splice(0, arr.length - 300);
      return { ...s, [m.channel]: arr };
    });
    if (tab !== m.channel) {
      setUnread(u => ({ ...u, [m.channel]: (u[m.channel] || 0) + 1 }));
    }
  });

  // Whenever the active tab changes, clear its unread.
  useEffect(() => { setUnread(u => ({ ...u, [tab]: 0 })); }, [tab]);

  async function send(e) {
    e?.preventDefault?.();
    const txt = body.trim();
    if (!txt || sending) return;
    setSending(true); setErr(null);
    try {
      await api.post(`/chat/${tab}`, { body: txt });
      setBody('');
    } catch (err) { setErr(err.message); }
    finally { setSending(false); }
  }

  if (!character) return null;
  const messages = byChannel[tab] || [];
  const currentUnavail = unavail[tab];

  return (
    <div className="flex flex-col h-full bg-ink-950/85">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ink-100/10 text-xs shrink-0">
        {CHANNELS.map(c => {
          const active = tab === c.id;
          const n = unread[c.id] || 0;
          return (
            <button key={c.id}
              onClick={() => setTab(c.id)}
              className={`relative px-2 py-1 rounded-md ${active ? 'bg-blood-700 text-white' : 'text-ink-100/70 hover:bg-ink-800/60'}`}>
              {c.label}
              {n > 0 && (
                <span className="absolute -top-1 -right-1 bg-blood-500 text-white text-[10px] font-bold rounded-full px-1 min-w-[14px] text-center leading-tight">
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => onPickDms?.()}
          className="relative px-2 py-1 rounded-md text-ink-100/70 hover:bg-ink-800/60 ml-auto">
          DMs
          {dmUnread > 0 && (
            <span className="absolute -top-1 -right-1 bg-blood-500 text-white text-[10px] font-bold rounded-full px-1 min-w-[14px] text-center leading-tight">
              {dmUnread > 99 ? '99+' : dmUnread}
            </span>
          )}
        </button>
      </div>

      {currentUnavail ? (
        <div className="flex-1 flex items-center justify-center text-xs text-ink-100/55 px-4 text-center">
          {currentUnavail}
        </div>
      ) : (
        <MessageList messages={messages} myCharId={character.id} />
      )}

      {err && <div className="px-3 py-1 text-[11px] text-blood-400 border-t border-blood-500/30">{err}</div>}

      <form onSubmit={send} className="flex gap-1 p-2 border-t border-ink-100/10 shrink-0">
        <input
          type="text"
          value={body}
          onChange={e => setBody(e.target.value.slice(0, 500))}
          placeholder={currentUnavail ? '—' : `Message in ${tab}…`}
          disabled={!!currentUnavail || sending}
          className="flex-1 text-xs px-2 py-1.5 rounded-md bg-ink-900/60 border border-ink-100/10 outline-none focus:border-blood-500/40" />
        <button
          disabled={!!currentUnavail || sending || !body.trim()}
          className="btn btn-primary text-xs px-3 disabled:opacity-50">
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
