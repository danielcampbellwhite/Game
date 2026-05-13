import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';

// Floating chat widget anchored to the bottom-right of every authed
// page. Collapsed = a round button with a chat glyph + unread count.
// Expanded = a tabbed panel with World / Faction / Gang + a DMs tab
// that just deep-links into the existing /messages page.
//
// Open/closed state persists across page navigations via localStorage
// so jumping pages doesn't keep snapping the chat shut. SSE event is
// 'chat.message' — broadcast by /api/chat POST. We track unread per
// channel so the bubble shows the total and the tabs show their own
// dot.

const CHANNELS = [
  { id: 'world',   label: 'World'   },
  { id: 'faction', label: 'Faction' },
  { id: 'gang',    label: 'Gang'    },
];

const LS_OPEN_KEY = 'mafia_chat_open';
const LS_TAB_KEY  = 'mafia_chat_tab';

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageList({ messages, myCharId }) {
  const ref = useRef();
  useEffect(() => {
    // Stick to the bottom on every render — chat scrolls newest-into-view.
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

export default function ChatWidget() {
  const { character, token } = useGame();
  const [open, setOpen] = useState(() => localStorage.getItem(LS_OPEN_KEY) === '1');
  const [tab, setTab] = useState(() => localStorage.getItem(LS_TAB_KEY) || 'world');
  const [byChannel, setByChannel] = useState({ world: [], faction: [], gang: [] });
  const [unavail, setUnavail] = useState({ world: null, faction: null, gang: null });
  const [unread, setUnread] = useState({ world: 0, faction: 0, gang: 0 });
  const [dmUnread, setDmUnread] = useState(0);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);

  // Persist open / active-tab so they survive page hops.
  useEffect(() => { localStorage.setItem(LS_OPEN_KEY, open ? '1' : '0'); }, [open]);
  useEffect(() => { localStorage.setItem(LS_TAB_KEY, tab); }, [tab]);

  // Load history for a channel on demand. We keep loaded channels in
  // memory across tab switches so revisits don't re-fetch.
  async function loadChannel(channel) {
    try {
      const r = await api.get(`/chat/${channel}`);
      setUnavail(u => ({ ...u, [channel]: r.unavailable || null }));
      setByChannel(s => ({ ...s, [channel]: r.messages || [] }));
    } catch (e) { setErr(e.message); }
  }

  // Initial fetch — all three channels on mount so unread badges work
  // even before the user expands the widget.
  useEffect(() => {
    if (!token || !character) return;
    loadChannel('world');
    loadChannel('faction');
    loadChannel('gang');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  // DM unread piggy-backs on the existing /messages/unread endpoint.
  useEffect(() => {
    if (!token || !character) return;
    api.get('/messages/unread').then(r => setDmUnread(r.total_unread || 0)).catch(() => {});
  }, [character?.id]);
  useEventStream('dm.unread', (p) => { if (p?.total_unread != null) setDmUnread(p.total_unread); });

  // Wire incoming chat messages into the right channel + bump unread
  // when the widget is closed OR the active tab isn't this channel.
  useEventStream('chat.message', (m) => {
    if (!m?.channel) return;
    setByChannel(s => {
      const arr = (s[m.channel] || []).slice();
      arr.push(m);
      // Keep the in-memory window from growing unbounded.
      if (arr.length > 300) arr.splice(0, arr.length - 300);
      return { ...s, [m.channel]: arr };
    });
    if (!open || tab !== m.channel) {
      setUnread(u => ({ ...u, [m.channel]: (u[m.channel] || 0) + 1 }));
    }
  });

  // Mark current tab as read whenever it becomes visible.
  useEffect(() => {
    if (open) setUnread(u => ({ ...u, [tab]: 0 }));
  }, [open, tab]);

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

  if (!token || !character) return null;

  const totalUnread = unread.world + unread.faction + unread.gang + dmUnread;
  const messages = byChannel[tab] || [];
  const currentUnavail = unavail[tab];

  return (
    <div className="fixed bottom-3 right-3 z-[1500] pointer-events-none">
      {open ? (
        <div className="pointer-events-auto w-[min(360px,calc(100vw-1.5rem))] h-[min(520px,70vh)] flex flex-col rounded-xl border border-blood-500/30 bg-ink-950/95 backdrop-blur shadow-2xl shadow-black/70 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-ink-100/10 bg-blood-700/15">
            <div className="text-xs uppercase tracking-wider text-blood-300 font-medium">Chat</div>
            <button onClick={() => setOpen(false)} className="text-ink-100/60 hover:text-ink-50 text-lg leading-none" aria-label="Close chat">×</button>
          </div>

          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ink-100/10 text-xs">
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
            <Link to="/messages"
              onClick={() => setOpen(false)}
              className="relative px-2 py-1 rounded-md text-ink-100/70 hover:bg-ink-800/60 ml-auto">
              DMs
              {dmUnread > 0 && (
                <span className="absolute -top-1 -right-1 bg-blood-500 text-white text-[10px] font-bold rounded-full px-1 min-w-[14px] text-center leading-tight">
                  {dmUnread > 99 ? '99+' : dmUnread}
                </span>
              )}
            </Link>
          </div>

          {currentUnavail ? (
            <div className="flex-1 flex items-center justify-center text-xs text-ink-100/55 px-4 text-center">
              {currentUnavail}
            </div>
          ) : (
            <MessageList messages={messages} myCharId={character.id} />
          )}

          {err && <div className="px-3 py-1 text-[11px] text-blood-400 border-t border-blood-500/30">{err}</div>}

          <form onSubmit={send} className="flex gap-1 p-2 border-t border-ink-100/10">
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
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="pointer-events-auto relative h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-blood-700 hover:bg-blood-600 text-white shadow-lg shadow-black/50 flex items-center justify-center transition"
          aria-label="Open chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 bg-yellow-400 text-ink-950 text-[11px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-tight">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
