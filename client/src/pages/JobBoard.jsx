import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';

const TITLE_MAX = 60;
const BODY_MAX  = 500;
const RATE_MAX  = 40;

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function timeUntil(ts) {
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s <= 0) return 'expired';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function PostForm({ categories, onPosted, disabled }) {
  const [category, setCategory] = useState('protection');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [rateText, setRateText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post('/job-board', { category, title, body, rate_text: rateText });
      setTitle(''); setBody(''); setRateText('');
      onPosted();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] uppercase text-ink-100/55">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full" disabled={busy || disabled}>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[12px] uppercase text-ink-100/55">Rate (free-form)</label>
          <input value={rateText} onChange={e => setRateText(e.target.value)}
            maxLength={RATE_MAX}
            placeholder='e.g. £500/job · 1% of take · negotiable'
            className="w-full" disabled={busy || disabled} />
        </div>
      </div>
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder='e.g. Wheelman available — clean record, fast cars'
          className="w-full" disabled={busy || disabled} />
        <div className="text-[12px] text-ink-100/40 text-right">{title.length}/{TITLE_MAX}</div>
      </div>
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Description</label>
        <textarea value={body} onChange={e => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={4}
          placeholder='What you offer, what you need, terms, how to reach you. Keep it short — interested players DM you.'
          className="w-full" disabled={busy || disabled} />
        <div className="text-[12px] text-ink-100/40 text-right">{body.length}/{BODY_MAX}</div>
      </div>
      {err && <p className="text-blood-400 text-xs">{err}</p>}
      <button disabled={busy || disabled} className="btn btn-primary w-full text-sm" type="submit">
        {busy ? 'Posting…' : disabled ? 'Posting limit reached — retract a listing first' : 'Post listing'}
      </button>
    </form>
  );
}

function ListingCard({ l, isMine, onRetract, busy }) {
  return (
    <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs px-1.5 py-0.5 rounded bg-ink-800/60 text-ink-100/80 shrink-0">
            {l.category_emoji} {l.category_label}
          </span>
          <span className="font-medium truncate">{l.title}</span>
        </div>
        <span className="text-[12px] text-ink-100/45 shrink-0">expires in {timeUntil(l.expires_at)}</span>
      </div>
      <p className="text-[12px] text-ink-100/75 whitespace-pre-wrap break-words">{l.body}</p>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <div className="text-ink-100/55">
          Posted by{' '}
          {l.poster ? (
            <Link to={`/players/${l.poster.id}`} className="text-blood-400 hover:underline">
              {l.poster.avatar} {l.poster.name}
            </Link>
          ) : <span className="italic">unknown</span>}
          {l.poster?.level != null && <span className="ml-1 text-ink-100/40">L{l.poster.level}</span>}
          <span className="text-ink-100/40"> · {timeAgo(l.created_at)}</span>
        </div>
        <div className="text-money-400 font-medium">{l.rate_text}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {l.poster && !isMine && (
          <Link to={`/messages/with/${l.poster.id}`} className="btn btn-primary text-xs text-center">
            Contact
          </Link>
        )}
        {isMine && (
          <button onClick={() => onRetract(l.id)} disabled={busy === `del-${l.id}`}
            className="btn btn-ghost text-xs col-span-2">
            {busy === `del-${l.id}` ? '…' : 'Retract'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function JobBoard() {
  const { character } = useGame();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/job-board')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function retract(id) {
    setBusy(`del-${id}`); setMsg(null);
    try {
      await api.delete(`/job-board/${id}`);
      setMsg('Listing retracted.');
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;

  const filtered = tab === 'all'
    ? data.listings
    : tab === 'mine'
      ? data.listings.filter(l => l.poster?.id === character?.id)
      : data.listings.filter(l => l.category === tab);

  const atLimit = data.my_active_count >= data.max_per_player;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card title={` The ${data.cityName} Daily — Classifieds`}
        subtitle="A player-driven job board. Post what you offer or scan the columns for work."
        right={
          <button onClick={() => setShowForm(s => !s)} className="btn btn-primary text-xs">
            {showForm ? 'Hide form' : '+ Post a listing'}
          </button>
        }>
        <p className="text-[13px] text-ink-100/55">
          Listings are scoped to your current city. Reach out via DM — payment is settled
          between you and the other player however you arrange (bank transfer, cash drop, hand-shake).
          You can have up to <b>{data.max_per_player}</b> listings active at once;
          they auto-expire after <b>7 days</b>.
        </p>
      </Card>

      {showForm && (
        <Card title="Post a new listing"
          subtitle={atLimit
            ? 'You\'re at the listing limit — retract one of your existing posts to free a slot.'
            : `${data.my_active_count}/${data.max_per_player} of your listing slots used.`}>
          <PostForm
            categories={data.categories}
            disabled={atLimit}
            onPosted={async () => { setShowForm(false); setMsg('Listing posted.'); await load(); }}
          />
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setTab('all')}
            className={`px-3 py-1.5 rounded-md text-xs ${tab === 'all' ? 'bg-blood-700 text-white' : 'bg-ink-800/40 text-ink-100/70 hover:bg-ink-800/70'}`}>
            All · {data.listings.length}
          </button>
          <button onClick={() => setTab('mine')}
            className={`px-3 py-1.5 rounded-md text-xs ${tab === 'mine' ? 'bg-yellow-700 text-white' : 'bg-ink-800/40 text-ink-100/70 hover:bg-ink-800/70'}`}>
            Mine · {data.my_active_count}
          </button>
          {data.categories.map(c => {
            const n = data.listings.filter(l => l.category === c.id).length;
            if (!n) return null;
            return (
              <button key={c.id} onClick={() => setTab(c.id)}
                className={`px-3 py-1.5 rounded-md text-xs ${tab === c.id ? 'bg-blood-700 text-white' : 'bg-ink-800/40 text-ink-100/70 hover:bg-ink-800/70'}`}>
                {c.emoji} {c.label} · {n}
              </button>
            );
          })}
        </div>
      </Card>

      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      {filtered.length === 0 ? (
        <Card><p className="text-xs text-ink-100/55 text-center py-6">
          {tab === 'mine'
            ? 'You have no active listings. Hit "+ Post a listing" above to advertise your services.'
            : 'No listings in this column. Be the first to post.'}
        </p></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map(l => (
            <ListingCard key={l.id} l={l}
              isMine={l.poster?.id === character?.id}
              onRetract={retract} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}
