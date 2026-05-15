import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';
import ClothingSvg from '../components/ClothingSvg.jsx';
import { fmt } from '../components/Money.jsx';

const TIER_META = {
  low: {
    title: 'Streetwear Outlet',
    blurb: 'Tracksuits, gold chains, snapbacks. Cheap, flashy, all about presence.',
    tone: 'border-blood-500/40',
  },
  high: {
    title: 'Atelier',
    blurb: 'Bespoke suits, Italian leather, watches that take a year to ship. By appointment only.',
    tone: 'border-gold-500/40',
  },
};

const SLOT_LABELS = {
  hat: 'Hat',
  top: 'Top',
  bottom: 'Bottom',
  shoes: 'Shoes',
  accessory: 'Accessory',
};

export default function ClothingStore() {
  const { tier } = useParams();
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get(`/clothing/store/${tier}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { setData(null); load(); }, [tier]);

  async function buy(item) {
    setBusy(item.id); setMsg(null);
    try {
      await api.post(`/clothing/buy/${tier}`, { item_id: item.id });
      setMsg(`Bought ${item.name} — £${item.cost.toLocaleString()}.`);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const meta = TIER_META[tier] || TIER_META.low;

  // Group by slot for tidy browsing.
  const bySlot = {};
  for (const it of data.items) {
    (bySlot[it.slot] = bySlot[it.slot] || []).push(it);
  }

  return (
    <div className="space-y-4">
      <Card title={meta.title} subtitle={meta.blurb}
        right={<Link to="/inventory?tab=wardrobe" className="btn btn-ghost text-xs">→ Your wardrobe</Link>}>
        <p className="text-[12px] text-ink-100/55">
          Cash: <span className="text-money-300 tabular-nums">{fmt(character?.cash)}</span> · Purely cosmetic — no stat effects, just style.
        </p>
        {msg && <p className="text-xs text-money-300 mt-2">{msg}</p>}
      </Card>

      {Object.entries(SLOT_LABELS).map(([slot, label]) => {
        const items = bySlot[slot] || [];
        if (items.length === 0) return null;
        return (
          <Card key={slot} title={label}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(it => (
                <div key={it.id}
                  className={`rounded-lg p-3 border ${meta.tone} bg-ink-950/40 flex gap-3 items-start`}>
                  <div className="shrink-0 rounded-md bg-ink-900/50 border border-ink-100/10 p-1">
                    <ClothingSvg id={it.id} size={64} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{it.name}</div>
                    <div className="text-[12px] text-ink-100/55 leading-snug">{it.desc}</div>
                    <div className="text-[13px] mt-1 text-money-300 tabular-nums">{fmt(it.cost)}</div>
                    <div className="mt-2">
                      {it.owned ? (
                        <span className="text-[11px] uppercase tracking-wide text-money-400">Owned</span>
                      ) : (
                        <button
                          onClick={() => buy(it)}
                          disabled={busy === it.id || (character?.cash || 0) < it.cost}
                          className="btn btn-primary text-xs py-1 disabled:opacity-40">
                          {busy === it.id ? '…' : (character?.cash || 0) < it.cost ? 'Can\'t afford' : 'Buy'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
