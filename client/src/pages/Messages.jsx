import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import Card from '../components/Card.jsx';

function timeShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ThreadList({ threads, activeId, onPick }) {
  if (!threads.length) {
    return (
      <div className="p-4 text-xs text-ink-100/55">
        No conversations yet. Find someone on the <Link to="/players" className="underline text-money-400">Players</Link> page.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-ink-100/5">
      {threads.map(t => {
        const active = t.thread_id === activeId;
        return (
          <li key={t.thread_id}>
            <button
              onClick={() => onPick(t)}
              className={`w-full text-left p-3 transition ${active ? 'bg-blood-700/20' : 'hover:bg-ink-900/60'}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-xl shrink-0">{t.other.avatar}</span>
                <span className="font-medium text-sm truncate flex-1">{t.other.name}</span>
                {t.unread > 0 && (
                  <span className="bg-blood-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {t.unread > 99 ? '99+' : t.unread}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-100/60 mt-1 truncate">
                {t.last_message
                  ? <>{t.last_message.mine ? <span className="text-ink-100/40">you: </span> : null}{t.last_message.body}</>
                  : <span className="italic text-ink-100/40">No messages yet.</span>}
              </div>
              <div className="text-[10px] text-ink-100/35 mt-1">{timeShort(t.last_message_at)}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Conversation({ otherId, character }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const nav = useNavigate();

  // Resolve thread by other character id (fetched via /players first if needed).
  async function loadByOther() {
    try {
      // Find the existing thread by listing and filtering — cheap.
      const tl = await api.get('/messages');
      const existing = tl.threads.find(t => String(t.other.id) === String(otherId));
      if (existing) {
        await loadThread(existing.thread_id);
      } else {
        // No thread yet — show empty state with the target's profile.
        const p = await api.get(`/players/${otherId}`);
        setData({ thread: null, messages: [], other: p.profile, blocks_you: p.blocks_you, you_block: p.you_block });
      }
    } catch (e) { setError(e.message); }
  }

  async function loadThread(threadId) {
    try {
      const r = await api.get(`/messages/${threadId}`);
      setData({ thread: r.thread, messages: r.messages, other: r.thread.other });
      // Mark as read.
      await api.post(`/messages/${threadId}/read`);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { loadByOther(); /* eslint-disable-line */ }, [otherId]);

  // Receive incoming events for this conversation.
  useEventStream('dm.received', (payload) => {
    if (!data) return;
    if (data.thread && payload.thread_id === data.thread.id) {
      setData(prev => ({ ...prev, messages: [...prev.messages, payload.message] }));
      // Auto-mark as read since the user is looking at it.
      api.post(`/messages/${data.thread.id}/read`).catch(() => {});
    } else if (!data.thread && String(payload.from?.id) === String(otherId)) {
      // First message from this person while we had no thread yet.
      loadByOther();
    }
  });
  useEventStream('dm.sent', (payload) => {
    if (data?.thread && payload.thread_id === data.thread.id) {
      setData(prev => ({ ...prev, messages: [...prev.messages, payload.message] }));
    }
  });

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [data?.messages?.length]);

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post(`/messages/to/${otherId}`, { body });
      setText('');
      // Switch to the live thread row if we didn't have one before.
      if (!data?.thread) {
        await loadThread(r.thread_id);
      }
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  if (!data) return <div className="p-4 text-xs text-ink-100/55">Loading…</div>;

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="border-b border-ink-100/10 p-3 flex items-baseline gap-3">
        <button onClick={() => nav('/messages')} className="text-xs text-ink-100/50 hover:text-ink-50">←</button>
        <span className="text-xl">{data.other?.avatar}</span>
        <div className="flex-1 min-w-0">
          <Link to={`/players/${data.other?.id}`} className="font-medium hover:text-blood-400">{data.other?.name}</Link>
          <div className="text-[10px] text-ink-100/50">{data.other?.online ? 'online' : 'offline'}</div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar p-3 space-y-2">
        {data.messages.length === 0 && (
          <p className="text-xs text-ink-100/45 italic text-center mt-4">Say hello.</p>
        )}
        {data.messages.map(m => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.mine ? 'bg-blood-700/40 text-ink-50' : 'bg-ink-800/60 text-ink-50'}`}>
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className="text-[10px] text-ink-100/45 mt-1">{timeShort(m.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-blood-400 px-3 pb-2">{error}</p>}
      <form onSubmit={send} className="border-t border-ink-100/10 p-3 flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={1500}
          placeholder="Write a message…"
          disabled={busy || data.blocks_you || data.you_block}
          className="flex-1 bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blood-500/60 disabled:opacity-50"
        />
        <button disabled={busy || !text.trim() || data.blocks_you || data.you_block}
          className="btn btn-primary text-xs">
          {busy ? '…' : 'Send'}
        </button>
      </form>
      {(data.blocks_you || data.you_block) && (
        <p className="text-[11px] text-ink-100/55 px-3 pb-3">
          {data.you_block ? "You've blocked this player." : 'This player has blocked you.'}
        </p>
      )}
    </div>
  );
}

export default function Messages() {
  const params = useParams();   // /messages or /messages/with/:otherId
  const otherId = params.otherId;
  const nav = useNavigate();
  const { character } = useGame();
  const [threads, setThreads] = useState([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await api.get('/messages');
      setThreads(r.threads || []);
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  // Live updates: any new dm.received event refreshes the thread list.
  useEventStream('dm.received', () => load());
  useEventStream('dm.sent',     () => load());
  useEventStream('dm.unread',   () => load());

  if (!character) return null;

  // Mobile: show only the conversation when one is open. Desktop: side by side.
  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-4">
      <Card title="Threads" className={otherId ? 'hidden md:block' : ''}>
        {busy && threads.length === 0 && <p className="text-xs text-ink-100/55 p-2">Loading…</p>}
        <ThreadList
          threads={threads}
          activeId={threads.find(t => String(t.other.id) === String(otherId))?.thread_id}
          onPick={t => nav(`/messages/with/${t.other.id}`)}
        />
      </Card>
      <Card className={!otherId ? 'hidden md:block' : ''}>
        {otherId ? (
          <Conversation key={otherId} otherId={otherId} character={character} />
        ) : (
          <p className="text-xs text-ink-100/55 p-4">Pick a thread on the left, or find someone via <Link to="/players" className="underline text-money-400">Players</Link>.</p>
        )}
      </Card>
    </div>
  );
}
