import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';
import EffectsPills from '../components/EffectsPills.jsx';

function ListingRow({ listing, isOwner, onBuy, onDelist, busy, sameCity }) {
  const [qty, setQty] = useState(1);
  const total = listing.price_each * qty;
  return (
    <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium">{listing.emoji} {listing.name}</div>
        <div className="text-money-400 tabular-nums">{fmt(listing.price_each)}</div>
      </div>
      {listing.desc && <div className="text-[13px] text-ink-100/55">{listing.desc}</div>}
      <EffectsPills effects={listing.effects} />
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-ink-100/55">in stock: <b className="text-ink-100/85 tabular-nums">{listing.qty}</b></span>
        <span className="text-ink-100/40">{listing.source === 'wholesale' ? 'Wholesale stock' : 'Owner-listed'}</span>
      </div>
      {isOwner ? (
        <button onClick={() => onDelist(listing.id)} disabled={busy === `del-${listing.id}`}
          className="btn btn-ghost text-xs w-full">
          {busy === `del-${listing.id}` ? '…' : 'Delist'}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 items-center">
          <input type="number" min="1" max={listing.qty} value={qty}
            onChange={e => setQty(Math.max(1, Math.min(listing.qty, parseInt(e.target.value, 10) || 1)))}
            className="text-center" />
          <button
            disabled={busy === `buy-${listing.id}` || !sameCity}
            onClick={() => onBuy(listing.id, qty)}
            className="btn btn-money text-xs"
            title={!sameCity ? "You must be in this shop's city to buy." : `Pay ${fmt(total)}`}>
            {busy === `buy-${listing.id}` ? '…' : `Buy · ${fmt(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = {
  misc:             ' Item',
  weapon:           ' Weapon',
  armour:           ' Armour',
  ammo:             ' Ammo',
  drug:             ' Drug',
  weapon_instance:  ' Modded weapon',
  vehicle:          ' Vehicle',
};

// Per-instance items have qty=1 always and are referenced by instance_id
// rather than item_id. The picker collapses qty controls for these.
const PER_INSTANCE_KINDS = new Set(['weapon_instance', 'vehicle']);

function ListFromInventoryForm({ shop, onListed }) {
  const [items, setItems] = useState(null);
  // pickKey for per-instance items uses the instance_id; for stacks, it
  // uses the item_id. Encoded as `${kind}|${ref}` either way.
  const [pickKey, setPickKey] = useState('');
  const [qty, setQty] = useState(1);
  const [retail, setRetail] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  function refOf(it) {
    return PER_INSTANCE_KINDS.has(it.kind)
      ? `${it.kind}|i:${it.instance_id}`
      : `${it.kind}|s:${it.item_id}`;
  }

  async function load() {
    try {
      const r = await api.get(`/player-shops/${shop.id}/listable-inventory`);
      setItems(r.items);
      if (r.items[0]) {
        setPickKey(refOf(r.items[0]));
        setRetail(r.items[0].base_cost || 100);
        setQty(1);
      } else {
        setPickKey('');
      }
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [shop.id]);

  const item = items?.find(i => refOf(i) === pickKey);
  const isPerInstance = item && PER_INSTANCE_KINDS.has(item.kind);
  const ownedQty = item?.qty || 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = isPerInstance
        ? { kind: item.kind, item_id: item.item_id, instance_id: item.instance_id, retail_price: retail }
        : { kind: item.kind, item_id: item.item_id, qty, retail_price: retail };
      await api.post(`/player-shops/${shop.id}/listings/inventory`, body);
      await onListed();
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (items === null) return <p className="text-xs text-ink-100/55">Loading inventory…</p>;
  if (items.length === 0) {
    return <p className="text-xs text-ink-100/55">You have no listable items in your personal inventory right now.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Pick an item from your inventory</label>
        <select value={pickKey} onChange={e => {
          setPickKey(e.target.value);
          const next = items.find(c => refOf(c) === e.target.value);
          if (next) {
            setQty(1);
            if (next.base_cost) setRetail(next.base_cost);
          }
        }} className="w-full" disabled={busy}>
          {items.map(c => (
            <option key={refOf(c)} value={refOf(c)}>
              {KIND_LABEL[c.kind] || c.kind} · {c.emoji} {c.name}
              {PER_INSTANCE_KINDS.has(c.kind) ? '' : ` — ${c.qty} owned`}
              {c.equipped ? ' · equipped' : ''}
            </option>
          ))}
        </select>
        {item?.sub && <div className="text-[12px] text-ink-100/55 mt-1">{item.sub}</div>}
        {item?.equipped && (
          <div className="text-[13px] text-yellow-300 mt-1">
             This is currently equipped. Listing it will unequip you.
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {!isPerInstance && (
          <div>
            <label className="text-[12px] uppercase text-ink-100/55">Qty (max {ownedQty})</label>
            <input type="number" min="1" max={ownedQty} value={qty}
              onChange={e => setQty(Math.max(1, Math.min(ownedQty, parseInt(e.target.value, 10) || 1)))}
              disabled={busy} />
          </div>
        )}
        <div className={isPerInstance ? 'col-span-2' : ''}>
          <label className="text-[12px] uppercase text-ink-100/55">
            {isPerInstance ? 'Retail price' : 'Retail per unit'}
          </label>
          <input type="number" min="1" value={retail}
            onChange={e => setRetail(Math.max(1, parseInt(e.target.value, 10) || 0))}
            disabled={busy} />
        </div>
      </div>
      <p className="text-[13px] text-ink-100/55">
        {isPerInstance
          ? 'Modded items are unique. Once listed, you can\'t equip / further-modify it until sold or delisted.'
          : 'Stacks move from your inventory into the shop. Until they\'re sold, they\'re locked in the listing — delisting or closing returns them to you.'}
      </p>
      {err && <p className="text-blood-400 text-xs">{err}</p>}
      <button type="submit" className="btn btn-primary w-full text-sm"
        disabled={busy || !pickKey || (!isPerInstance && (qty < 1 || qty > ownedQty))}>
        {busy ? 'Listing…' : isPerInstance ? `List for ${fmt(retail)}` : `List ${qty}× at ${fmt(retail)} each`}
      </button>
    </form>
  );
}

function StockFromWholesaleForm({ shop, onStocked }) {
  const [catalogue, setCatalogue] = useState([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(10);
  const [retail, setRetail] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/player-shops/wholesale-catalogue').then(r => {
      setCatalogue(r.items);
      if (r.items[0]) {
        setItemId(r.items[0].id);
        setRetail(r.items[0].base_cost);
      }
    });
  }, []);

  const item = catalogue.find(c => c.id === itemId);
  const totalCost = (item?.wholesale_cost || 0) * qty;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post(`/player-shops/${shop.id}/listings/wholesale`, {
        item_id: itemId, qty, retail_price: retail,
      });
      onStocked();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!item) return <p className="text-xs text-ink-100/55">Loading wholesaler catalogue…</p>;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Item from wholesaler</label>
        <select value={itemId} onChange={e => {
          setItemId(e.target.value);
          const next = catalogue.find(c => c.id === e.target.value);
          if (next) setRetail(next.base_cost);
        }} className="w-full" disabled={busy}>
          {catalogue.map(c => {
            const visible = c.effects
              ? Object.entries(c.effects).filter(([k, v]) => k !== 'nerve' && Number.isFinite(v) && v !== 0)
              : [];
            const effSummary = visible.length
              ? ' · ' + visible.map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`).join(', ')
              : '';
            return (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name} — wholesale {fmt(c.wholesale_cost)}{effSummary}
              </option>
            );
          })}
        </select>
        {item.desc && <div className="text-[13px] text-ink-100/55 mt-2">{item.desc}</div>}
        {item.effects && (
          <div className="mt-2">
            <div className="text-[11px] uppercase tracking-wide text-ink-100/45 mb-1">Effects when used</div>
            <EffectsPills effects={item.effects} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[12px] uppercase text-ink-100/55">Qty</label>
          <input type="number" min="1" max="999" value={qty}
            onChange={e => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={busy} />
        </div>
        <div>
          <label className="text-[12px] uppercase text-ink-100/55">Retail per unit</label>
          <input type="number" min="1" value={retail}
            onChange={e => setRetail(Math.max(1, parseInt(e.target.value, 10) || 0))}
            disabled={busy} />
        </div>
      </div>
      <p className="text-[13px] text-ink-100/55">
        Wholesale spend: <b className="text-blood-400">{fmt(totalCost)}</b> ·
        Potential gross at retail: <b className="text-money-400">{fmt(retail * qty)}</b>.
        Restocking the same item adds to existing stock and updates the retail price.
      </p>
      {err && <p className="text-blood-400 text-xs">{err}</p>}
      <button type="submit" className="btn btn-primary w-full text-sm" disabled={busy}>
        {busy ? 'Stocking…' : `Buy ${qty}× & list at ${fmt(retail)} each`}
      </button>
    </form>
  );
}

const SHOP_NAME_MAX = 32;
const SHOP_DESC_MAX = 280;

function EditShopForm({ shop, onSaved }) {
  const [name, setName] = useState(shop.name);
  const [description, setDescription] = useState(shop.description || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [savedAt, setSavedAt] = useState(0);

  const dirty = name.trim() !== shop.name || description.trim() !== (shop.description || '');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = {};
      if (name.trim() !== shop.name) body.name = name.trim();
      if (description.trim() !== (shop.description || '')) body.description = description.trim();
      await api.patch(`/player-shops/${shop.id}`, body);
      setSavedAt(Date.now());
      await onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Shop name</label>
        <input value={name} maxLength={SHOP_NAME_MAX}
          onChange={e => setName(e.target.value)} className="w-full" disabled={busy} />
      </div>
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Description (optional — shown to visitors)</label>
        <textarea value={description} maxLength={SHOP_DESC_MAX} rows={3}
          placeholder='e.g. The freshest gear in town. We deal in volume — drop us a DM for bulk orders.'
          onChange={e => setDescription(e.target.value)} className="w-full" disabled={busy} />
        <div className="text-[12px] text-ink-100/40 text-right">{description.length}/{SHOP_DESC_MAX}</div>
      </div>
      {err && <p className="text-blood-400 text-xs">{err}</p>}
      <div className="flex gap-2 items-baseline">
        <button type="submit" className="btn btn-primary text-xs"
          disabled={busy || !dirty || name.trim().length < 3}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt > 0 && Date.now() - savedAt < 4000 && !dirty && (
          <span className="text-[13px] text-money-400"> Saved.</span>
        )}
      </div>
    </form>
  );
}

function OwnerPanel({ shop, onChanged }) {
  const [withdraw, setWithdraw] = useState(0);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  async function call(action, body) {
    setBusy(action); setErr(null);
    try { await api.post(`/player-shops/${shop.id}/${action}`, body); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }
  async function close() {
    if (!confirm(`Close "${shop.name}"? Wholesale stock is lost; inventory listings return to you. Sales pot refunds to your wallet.`)) return;
    setBusy('close'); setErr(null);
    try { await api.post(`/player-shops/${shop.id}/close`); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  const profit = (shop.total_revenue || 0) - (shop.total_tax_paid || 0);

  return (
    <Card title="Owner controls" subtitle="Edit your shop, withdraw earnings, or close down."
      right={
        <button onClick={() => setShowEdit(s => !s)} className="btn btn-ghost text-xs">
          {showEdit ? 'Hide edit form' : ' Edit shop'}
        </button>
      }>
      {showEdit && (
        <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 mb-4">
          <EditShopForm shop={shop} onSaved={onChanged} />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
        <div>
          <div className="text-[12px] uppercase text-ink-100/55">Sales till</div>
          <div className="text-money-400 font-semibold tabular-nums">{fmt(shop.sales_cash)}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase text-ink-100/55">Lifetime revenue</div>
          <div className="tabular-nums">{fmt(shop.total_revenue)}</div>
        </div>
        <div>
          <div className="text-[12px] uppercase text-ink-100/55">Net (after tax)</div>
          <div className={`tabular-nums ${profit >= 0 ? 'text-money-400' : 'text-blood-400'}`}>
            {fmt(profit)}
          </div>
          <div className="text-[12px] text-ink-100/55">tax paid {fmt(shop.total_tax_paid)}</div>
        </div>
      </div>

      <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3">
        <div className="text-[12px] uppercase text-ink-100/55 mb-2">Withdraw from sales</div>
        <div className="flex gap-2">
          <input type="number" min="0" max={shop.sales_cash} value={withdraw}
            onChange={e => setWithdraw(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="flex-1" disabled={busy === 'withdraw'} />
          <button onClick={() => call('withdraw', { amount: withdraw })}
            disabled={busy === 'withdraw' || withdraw <= 0 || withdraw > shop.sales_cash}
            className="btn btn-money text-xs">
            {busy === 'withdraw' ? '…' : 'Withdraw'}
          </button>
        </div>
      </div>

      <button onClick={close} disabled={busy === 'close'}
        className="btn btn-ghost text-xs mt-3 text-blood-400">
        {busy === 'close' ? '…' : 'Close shop permanently'}
      </button>

      {err && <p className="text-blood-400 text-xs mt-2">{err}</p>}
    </Card>
  );
}

export default function PlayerShop() {
  const { id } = useParams();
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get(`/player-shops/${id}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function buy(listingId, qty) {
    setBusy(`buy-${listingId}`); setMsg(null);
    try {
      const r = await api.post(`/player-shops/${id}/buy/${listingId}`, { qty });
      setMsg(`Paid ${fmt(r.paid)} (incl. ${fmt(r.tax)} tax).`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }
  async function delist(listingId) {
    setBusy(`del-${listingId}`); setMsg(null);
    try { await api.delete(`/player-shops/${id}/listings/${listingId}`); await load(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const { shop, listings, is_owner, sales_tax_pct } = data;
  const sameCity = shop.city === character?.city;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card title={` ${shop.name}`}
        subtitle={`In ${shop.cityName}${shop.owner ? ` · run by ${shop.owner.avatar} ${shop.owner.name}` : ''}`}
        right={<Link to="/shops" className="btn btn-ghost text-xs">← All shops</Link>}>
        {shop.description && (
          <p className="text-sm text-ink-100/80 whitespace-pre-wrap break-words italic border-l-2 border-blood-500/40 pl-3 my-2">
            {shop.description}
          </p>
        )}
        {!sameCity && (
          <div className="text-[13px] text-ink-100/55">
            You're not in {shop.cityName} — fly there to make a purchase.
          </div>
        )}
        <div className="text-[12px] text-ink-100/45 mt-2">
          Sales tax: {(sales_tax_pct * 100).toFixed(0)}% off the top of every purchase (sink).
        </div>
      </Card>

      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      {is_owner && (
        <>
          <OwnerPanel shop={shop} onChanged={async () => { await refresh(); await load(); }} />
          <Card title="Stock from wholesaler"
            subtitle="Buy bulk consumables at 60% of base. Set your own retail markup. Same items stack into one listing.">
            <StockFromWholesaleForm shop={shop}
              onStocked={async () => { await refresh(); await load(); }} />
          </Card>
          <Card title="List from your inventory"
            subtitle="Move items you already own into the shop. Useful for reselling things you've stockpiled.">
            <ListFromInventoryForm shop={shop}
              onListed={async () => { await refresh(); await load(); }} />
          </Card>
        </>
      )}

      <Card title={`Listings (${listings.length})`}
        subtitle={is_owner ? 'Your stock — delist to remove an item.' : 'Browse the stock.'}>
        {listings.length === 0 ? (
          <p className="text-xs text-ink-100/55 text-center py-6">
            {is_owner ? 'No listings yet — stock from the wholesaler above.' : 'This shop is empty right now.'}
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {listings.map(l => (
              <ListingRow key={l.id} listing={l}
                isOwner={is_owner}
                onBuy={buy}
                onDelist={delist}
                busy={busy}
                sameCity={sameCity} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
