import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

const KIND_LABEL = {
  misc:   '🛒 Item',
  weapon: '🔫 Weapon',
  armour: '🦺 Armour',
  ammo:   '🔋 Ammo',
  drug:   '💊 Drug',
};

// Builds the inventory list the picker pulls from. We hit /api/inventory
// to get the player's stacks; only sellable kinds are surfaced (matches
// what the server's validateOffer accepts).
function useMyInventory(refreshKey) {
  const [inv, setInv] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/inventory');
        const items = [];
        for (const w of r.weapons || []) if (w.id !== 'fists') items.push({ kind: 'weapon', item_id: w.id, qty: w.qty, name: w.name, emoji: '🔫' });
        for (const a of r.armours || []) if (a.id !== 'none')  items.push({ kind: 'armour', item_id: a.id, qty: a.qty, name: a.name, emoji: '🦺' });
        for (const a of r.ammo || [])    items.push({ kind: 'ammo',   item_id: a.id, qty: a.qty, name: a.name, emoji: '🔋' });
        for (const d of r.drugs || [])   items.push({ kind: 'drug',   item_id: d.id, qty: d.qty, name: d.name, emoji: '💊' });
        for (const m of r.misc || [])    items.push({ kind: 'misc',   item_id: m.id, qty: m.qty, name: m.name, emoji: m.emoji });
        setInv(items);
      } catch { setInv([]); }
    })();
  }, [refreshKey]);
  return inv;
}

function OfferDisplay({ offer, label, isMine }) {
  return (
    <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-ink-100/55">{label}</span>
        {isMine && <span className="text-[10px] text-money-400">your side</span>}
      </div>
      {offer.items.length === 0 && offer.cash === 0 ? (
        <p className="text-[11px] text-ink-100/45 italic">No items, no cash.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {offer.items.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between">
              <span>{it.emoji} {it.name}</span>
              <span className="tabular-nums text-ink-100/65">×{it.qty}</span>
            </li>
          ))}
          {offer.cash > 0 && (
            <li className="flex items-baseline justify-between border-t border-ink-100/10 pt-1 mt-1">
              <span className="text-money-400">💵 Cash</span>
              <span className="tabular-nums text-money-400">{fmt(offer.cash)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function MyOfferEditor({ inv, offer, onChange, disabled }) {
  // The "stage" lets the user assemble an offer line-by-line before
  // pushing the whole thing to the server. We round-trip the entire
  // offer on each change for simplicity — server is authoritative.
  const [pickKey, setPickKey] = useState('');
  const [pickQty, setPickQty] = useState(1);

  const remainingFor = (kind, item_id) => {
    const owned = inv?.find(i => i.kind === kind && i.item_id === item_id)?.qty || 0;
    const used = offer.items
      .filter(o => o.kind === kind && o.item_id === item_id)
      .reduce((n, o) => n + o.qty, 0);
    return owned - used;
  };

  const availableItems = (inv || [])
    .filter(i => remainingFor(i.kind, i.item_id) > 0);

  useEffect(() => {
    if (!pickKey && availableItems[0]) setPickKey(`${availableItems[0].kind}|${availableItems[0].item_id}`);
  }, [availableItems, pickKey]);

  const [pickKind, pickId] = pickKey ? pickKey.split('|') : ['', ''];
  const remaining = pickKey ? remainingFor(pickKind, pickId) : 0;

  function add() {
    if (!pickKey || pickQty < 1 || pickQty > remaining) return;
    const meta = inv.find(i => i.kind === pickKind && i.item_id === pickId);
    const next = {
      ...offer,
      items: [...offer.items, { kind: pickKind, item_id: pickId, qty: pickQty, name: meta?.name, emoji: meta?.emoji }],
    };
    onChange(next);
    setPickQty(1);
  }

  function removeItem(idx) {
    const next = { ...offer, items: offer.items.filter((_, i) => i !== idx) };
    onChange(next);
  }

  function setCash(n) {
    onChange({ ...offer, cash: Math.max(0, parseInt(n, 10) || 0) });
  }

  return (
    <div className="rounded-lg border border-blood-500/40 bg-blood-700/5 p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-money-400">Your offer</span>
      </div>

      {offer.items.length === 0 && offer.cash === 0 ? (
        <p className="text-[11px] text-ink-100/45 italic">Add items and / or cash below.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {offer.items.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between">
              <span>{it.emoji} {it.name} <span className="text-ink-100/55 tabular-nums text-[11px]">×{it.qty}</span></span>
              <button onClick={() => removeItem(i)} disabled={disabled}
                className="text-[11px] text-blood-400 hover:underline disabled:opacity-50">
                remove
              </button>
            </li>
          ))}
          {offer.cash > 0 && (
            <li className="flex items-baseline justify-between border-t border-ink-100/10 pt-1 mt-1">
              <span className="text-money-400">💵 Cash</span>
              <span className="tabular-nums text-money-400">{fmt(offer.cash)}</span>
            </li>
          )}
        </ul>
      )}

      <div className="border-t border-ink-100/10 pt-3 space-y-2">
        <div className="text-[10px] uppercase text-ink-100/55">Add an item from your inventory</div>
        {availableItems.length === 0 ? (
          <p className="text-[11px] text-ink-100/45">Nothing else to offer.</p>
        ) : (
          <div className="grid grid-cols-[1fr_70px_70px] gap-2">
            <select value={pickKey} onChange={e => { setPickKey(e.target.value); setPickQty(1); }}
              disabled={disabled} className="text-xs">
              {availableItems.map(it => {
                const left = remainingFor(it.kind, it.item_id);
                return (
                  <option key={`${it.kind}|${it.item_id}`} value={`${it.kind}|${it.item_id}`}>
                    {KIND_LABEL[it.kind]} · {it.emoji} {it.name} ({left} left)
                  </option>
                );
              })}
            </select>
            <input type="number" min="1" max={remaining} value={pickQty}
              onChange={e => setPickQty(Math.max(1, Math.min(remaining, parseInt(e.target.value, 10) || 1)))}
              disabled={disabled} className="text-xs" />
            <button onClick={add} disabled={disabled || !pickKey || pickQty < 1 || pickQty > remaining}
              className="btn btn-primary text-xs">Add</button>
          </div>
        )}
      </div>

      <div className="border-t border-ink-100/10 pt-3 space-y-1">
        <div className="text-[10px] uppercase text-ink-100/55">Cash to include</div>
        <input type="number" min="0" value={offer.cash}
          onChange={e => setCash(e.target.value)} disabled={disabled}
          className="w-full text-sm" placeholder="0" />
      </div>
    </div>
  );
}

function ChatPane({ messages, character, onSend }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    await onSend(t);
  }

  return (
    <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 space-y-2">
      <div className="text-[10px] uppercase text-ink-100/55">Trade chat</div>
      <div ref={scrollRef} className="max-h-48 overflow-y-auto space-y-1 text-sm">
        {messages.length === 0 && <p className="text-[11px] text-ink-100/40 italic">No messages yet.</p>}
        {messages.map(m => (
          <div key={m.id} className={`text-sm ${m.sender_id === character.id ? 'text-money-300' : 'text-ink-50'}`}>
            <span className="text-[10px] uppercase text-ink-100/45 mr-2">
              {m.sender_id === character.id ? 'you' : 'them'}
            </span>
            {m.body}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} maxLength={240}
          placeholder="Type a message…" className="flex-1 text-sm" />
        <button type="submit" disabled={!text.trim()} className="btn btn-primary text-xs">Send</button>
      </form>
    </div>
  );
}

export default function Trade() {
  const { id } = useParams();
  const { character, refresh } = useGame();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [invKey, setInvKey] = useState(0);
  useScrollOnMessage(msg);

  // Local working copy of my offer — flushed to server on Save / Confirm.
  const [draft, setDraft] = useState({ items: [], cash: 0 });
  const [draftDirty, setDraftDirty] = useState(false);

  const inv = useMyInventory(invKey);

  async function load() {
    try {
      const r = await api.get(`/trades/${id}`);
      setData(r);
      // Sync draft from server's view of my offer when not in dirty edit.
      const myOffer = r.trade.your_side === 'initiator' ? r.trade.initiator_offer : r.trade.recipient_offer;
      if (!draftDirty && myOffer) {
        setDraft({ items: myOffer.items.map(i => ({ kind: i.kind, item_id: i.item_id, qty: i.qty, name: i.name, emoji: i.emoji })), cash: myOffer.cash });
      }
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Live updates from the other side.
  useEventStream('trade.updated',   (p) => { if (p?.trade_id === Number(id)) { setDraftDirty(false); load(); } });
  useEventStream('trade.accepted',  (p) => { if (p?.trade_id === Number(id)) load(); });
  useEventStream('trade.cancelled', (p) => { if (p?.trade_id === Number(id)) load(); });
  useEventStream('trade.completed', (p) => { if (p?.trade_id === Number(id)) load(); });
  useEventStream('trade.message',   (p) => { if (p?.trade_id === Number(id)) load(); });

  // Cheap fallback poll while on the page.
  useEffect(() => {
    const i = setInterval(load, 3500);
    return () => clearInterval(i);
  }, [id, draftDirty]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function call(action, body) {
    setBusy(action); setMsg(null);
    try {
      const r = await api.post(`/trades/${id}/${action}`, body);
      if (r.character) await refresh();
      setDraftDirty(false);
      setInvKey(k => k + 1);
      await load();
      return r;
    } catch (e) { setMsg(e.message); throw e; }
    finally { setBusy(null); }
  }

  async function saveOffer() {
    setBusy('offer'); setMsg(null);
    try {
      await api.post(`/trades/${id}/offer`, { items: draft.items, cash: draft.cash });
      setDraftDirty(false);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function send(body) {
    try { await api.post(`/trades/${id}/messages`, { body }); await load(); }
    catch (e) { setMsg(e.message); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const { trade, messages } = data;

  const youAreInitiator = trade.your_side === 'initiator';
  const other = youAreInitiator ? trade.recipient : trade.initiator;
  const myOffer = youAreInitiator ? trade.initiator_offer : trade.recipient_offer;
  const theirOffer = youAreInitiator ? trade.recipient_offer : trade.initiator_offer;
  const myConfirmed = youAreInitiator ? trade.initiator_confirmed : trade.recipient_confirmed;
  const theirConfirmed = youAreInitiator ? trade.recipient_confirmed : trade.initiator_confirmed;
  const ended = trade.status !== 'pending' && trade.status !== 'active';

  // Tax estimate on cash flowing each way (server matches this — 5%).
  const myCashTax = Math.floor((draft.cash || myOffer.cash) * 0.05);
  const myCashOut = (draft.cash || myOffer.cash) - myCashTax;
  const theirCashTax = Math.floor(theirOffer.cash * 0.05);
  const theirCashIn = theirOffer.cash - theirCashTax;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Card title="🤝 Trade"
        subtitle={other ? `With ${other.name} (Lvl ${other.level})` : 'Loading…'}
        right={<Link to="/trades" className="btn btn-ghost text-xs">← All trades</Link>}>
        <div className="text-[11px] text-ink-100/55">
          Status: <b>{trade.status}</b> · expires in <Timer until={trade.expires_at} onExpire={load} /> · 5% tax on cash flowing in either direction (sink).
        </div>
      </Card>

      {msg && <Card><p className="text-xs text-blood-400">{msg}</p></Card>}

      {trade.status === 'pending' && !youAreInitiator && (
        <Card>
          <p className="text-sm">{other?.name} wants to trade with you.</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button disabled={busy === 'accept'} onClick={() => call('accept').catch(() => {})}
              className="btn btn-primary text-sm">{busy === 'accept' ? '…' : 'Accept'}</button>
            <button disabled={busy === 'decline'} onClick={() => call('decline').catch(() => nav('/trades'))}
              className="btn btn-ghost text-sm text-blood-400">{busy === 'decline' ? '…' : 'Decline'}</button>
          </div>
        </Card>
      )}

      {trade.status === 'pending' && youAreInitiator && (
        <Card>
          <p className="text-sm text-ink-100/65">Waiting for {other?.name} to accept…</p>
          <button disabled={busy === 'decline'} onClick={() => call('decline').catch(() => nav('/trades'))}
            className="btn btn-ghost text-xs mt-2 text-blood-400">{busy === 'decline' ? '…' : 'Cancel request'}</button>
        </Card>
      )}

      {trade.status === 'active' && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              {myConfirmed
                ? <OfferDisplay offer={myOffer} label="Your offer (locked)" isMine />
                : <MyOfferEditor inv={inv} offer={draft}
                    disabled={busy === 'offer'}
                    onChange={(next) => { setDraft(next); setDraftDirty(true); }} />}
              <div className="mt-2 flex flex-wrap gap-2 items-center text-[11px]">
                {myConfirmed
                  ? <span className="text-money-400">✓ Your side is confirmed</span>
                  : <span className="text-ink-100/55">Your side is unconfirmed</span>}
                {!myConfirmed && draftDirty && (
                  <button disabled={busy === 'offer'} onClick={saveOffer} className="btn btn-primary text-xs">
                    {busy === 'offer' ? '…' : 'Save offer'}
                  </button>
                )}
                {!myConfirmed && !draftDirty && (
                  <button disabled={busy === 'confirm'} onClick={() => call('confirm').catch(() => {})}
                    className="btn btn-money text-xs">
                    {busy === 'confirm' ? '…' : 'Confirm offer'}
                  </button>
                )}
                {myConfirmed && (
                  <button disabled={busy === 'unconfirm'} onClick={() => call('unconfirm').catch(() => {})}
                    className="btn btn-ghost text-xs">
                    {busy === 'unconfirm' ? '…' : 'Unconfirm'}
                  </button>
                )}
              </div>
              {myOffer.cash > 0 && (
                <div className="text-[10px] text-ink-100/45 mt-1">
                  At commit they'll receive {fmt(myCashOut)} (you pay {fmt(myCashTax)} tax).
                </div>
              )}
            </div>
            <div>
              <OfferDisplay offer={theirOffer} label={`${other?.name}'s offer`} />
              <div className="mt-2 text-[11px]">
                {theirConfirmed
                  ? <span className="text-money-400">✓ Their side is confirmed</span>
                  : <span className="text-ink-100/55">Waiting for them to confirm…</span>}
              </div>
              {theirOffer.cash > 0 && (
                <div className="text-[10px] text-ink-100/45 mt-1">
                  At commit you'll receive {fmt(theirCashIn)} (they pay {fmt(theirCashTax)} tax).
                </div>
              )}
            </div>
          </div>

          <Card>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busy === 'complete' || !myConfirmed || !theirConfirmed}
                onClick={() => call('complete').catch(() => {})}
                className="btn btn-money text-sm"
                title={!myConfirmed || !theirConfirmed ? 'Both sides must confirm.' : 'Commit the trade.'}>
                {busy === 'complete' ? '…' : 'Complete trade'}
              </button>
              <button disabled={busy === 'cancel'}
                onClick={() => call('cancel').catch(() => nav('/trades'))}
                className="btn btn-ghost text-sm text-blood-400">
                {busy === 'cancel' ? '…' : 'Cancel trade'}
              </button>
            </div>
          </Card>

          <ChatPane messages={messages} character={character} onSend={send} />
        </>
      )}

      {ended && (
        <Card>
          <p className="text-sm text-ink-100/75">
            Trade {trade.status}.
          </p>
          <Link to="/trades" className="btn btn-ghost text-xs mt-2">← Back to trades</Link>
        </Card>
      )}
    </div>
  );
}
