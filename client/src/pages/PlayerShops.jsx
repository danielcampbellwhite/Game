import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
import { fmt } from '../components/Money.jsx';

const FOUNDING_COST = 10000;
const FOUNDING_LEVEL = 15;

function ShopRow({ shop, isMine }) {
  return (
    <Link to={`/shops/${shop.id}`}
      className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 hover:border-blood-500/40 hover:bg-ink-900/60 transition flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium truncate">{shop.name}</span>
          {isMine && <span className="text-[10px] uppercase text-blood-400">your shop</span>}
        </div>
        <div className="text-[11px] text-ink-100/55 mt-0.5">
          {shop.listing_count} listing{shop.listing_count === 1 ? '' : 's'}
          {shop.owner && <> · run by <span className="text-ink-100/75">{shop.owner.avatar} {shop.owner.name}</span></>}
        </div>
      </div>
    </Link>
  );
}

function FoundShopForm({ character, onFounded }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const cantAfford = (character?.cash || 0) < FOUNDING_COST;
  const tooLow = (character?.level || 1) < FOUNDING_LEVEL;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post('/player-shops', { name, description });
      setName(''); setDescription('');
      onFounded();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[10px] uppercase text-ink-100/55">Shop name</label>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={32}
          placeholder='e.g. Danny’s Tuned Cars'
          className="w-full" disabled={busy} />
      </div>
      <div>
        <label className="text-[10px] uppercase text-ink-100/55">Description (optional)</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={280} rows={3}
          placeholder='Quick blurb shown on the storefront — what you sell, who you are, how to reach you.'
          className="w-full" disabled={busy} />
        <div className="text-[10px] text-ink-100/40 text-right">{description.length}/280 — editable later</div>
      </div>
      <p className="text-[11px] text-ink-100/55">
        Founding costs <b className="text-money-400">{fmt(FOUNDING_COST)}</b>. No rent — your only ongoing cost is the
        5% sales tax taken off every sale. Stock unlimited items via the wholesaler or your own inventory.
      </p>
      {tooLow && (
        <div className="rounded-md border border-ink-100/10 bg-ink-950/40 p-2">
          <LockBadge level={FOUNDING_LEVEL} />
        </div>
      )}
      {err && <p className="text-blood-400 text-xs">{err}</p>}
      <button type="submit" className="btn btn-primary w-full text-sm"
        disabled={busy || cantAfford || tooLow || name.trim().length < 3}>
        {busy ? 'Setting up…'
          : tooLow ? `Reach level ${FOUNDING_LEVEL}`
          : cantAfford ? `Need ${fmt(FOUNDING_COST)}`
          : `Found shop · ${fmt(FOUNDING_COST)}`}
      </button>
    </form>
  );
}

export default function PlayerShops() {
  const { character } = useGame();
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [showFound, setShowFound] = useState(false);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    if (!character?.city) return;
    try {
      const [dir, my] = await Promise.all([
        api.get(`/player-shops/in/${character.city}`),
        api.get('/player-shops/mine'),
      ]);
      setData(dir);
      setMine(my);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [character?.city]);

  if (!data || !mine) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;

  const myShopsHere = mine.shops.filter(s => s.city === character.city);
  const atCap = myShopsHere.length >= mine.max_per_city;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card title={` Player Shops — ${data.cityName}`}
        subtitle="Player-run businesses operating in this city. Buy in person, or set up your own.">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-100/55">{data.shops.length} shop{data.shops.length === 1 ? '' : 's'} in this city</span>
          <button onClick={() => setShowFound(s => !s)} className="ml-auto btn btn-primary text-xs">
            {showFound ? 'Hide form' : '+ Found a shop'}
          </button>
        </div>
      </Card>

      {showFound && (
        <Card title="Found a new shop"
          subtitle={atCap
            ? `You're at the ${mine.max_per_city}-business cap for ${data.cityName}.`
            : `You have ${myShopsHere.length}/${mine.max_per_city} businesses in ${data.cityName}.`}>
          {atCap
            ? <p className="text-xs text-blood-400">Close one of your businesses here before founding another.</p>
            : <FoundShopForm character={character}
                onFounded={async () => { setShowFound(false); setMsg('Shop founded.'); await load(); }} />}
        </Card>
      )}

      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      {mine.shops.length > 0 && (
        <Card title="Your shops" subtitle="Across every city.">
          <div className="grid sm:grid-cols-2 gap-3">
            {mine.shops.map(s => <ShopRow key={s.id} shop={s} isMine />)}
          </div>
        </Card>
      )}

      <Card title="Directory" subtitle="Tap any shop to browse stock.">
        {data.shops.length === 0 ? (
          <p className="text-xs text-ink-100/55 text-center py-6">
            No player shops in {data.cityName} yet. Be the first.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.shops.map(s => (
              <ShopRow key={s.id} shop={s} isMine={s.owner?.id === character.id} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
