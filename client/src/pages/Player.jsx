import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Player() {
  const { id } = useParams();
  const { character } = useGame();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get(`/players/${id}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function startConversation() {
    setBusy('start'); setMsg(null);
    try {
      // Send an empty open message? No — just navigate. The Messages page
      // can find-or-create the thread when the user actually sends.
      nav(`/messages/with/${id}`);
    } finally { setBusy(null); }
  }

  async function challenge(mode = 'knockout') {
    setBusy('challenge-' + mode); setMsg(null);
    try {
      await api.post('/pvp/challenge', { target_id: parseInt(id, 10), mode });
      setMsg(mode === 'murder'
        ? 'Murder challenge sent. Waiting for them to accept (60s).'
        : 'Challenge sent. Waiting for them to accept (60s).');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function startTrade() {
    setBusy('trade'); setMsg(null);
    try {
      const r = await api.post('/trades', { target_id: parseInt(id, 10) });
      nav(`/trades/${r.trade.id}`);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  // My gang membership (cached for the Invite button visibility/eligibility).
  const [myGang, setMyGang] = useState(null);
  useEffect(() => {
    api.get('/gangs/me').then(r => setMyGang(r.membership)).catch(() => {});
  }, []);

  async function invite() {
    if (!myGang?.gang?.id) return;
    setBusy('invite'); setMsg(null);
    try {
      await api.post(`/gangs/${myGang.gang.id}/invite`, { target_id: parseInt(id, 10) });
      setMsg(`Invited to "${myGang.gang.name}".`);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function block() {
    setBusy('block'); setMsg(null);
    try {
      await api.post(`/messages/blocks/${id}`);
      setMsg('Player blocked.');
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function unblock() {
    setBusy('unblock'); setMsg(null);
    try {
      await api.delete(`/messages/blocks/${id}`);
      setMsg('Block removed.');
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const p = data.profile;
  const isSelf = character?.id === p.id;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      <Card>
        <div className="flex items-baseline gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-display text-3xl">{p.name}</div>
            <div className="text-xs text-ink-100/60">
              {p.rank} · Level {p.at_max_level ? '999+' : p.level}{p.prestige ? ` · ⭐ ${p.prestige}` : ''}
            </div>
            <div className="text-[11px] text-ink-100/45 mt-1">
              {p.online
                ? <span className="text-money-400">● online now</span>
                : <span>last seen {timeAgo(p.last_active_at)}</span>}
              {' · '}
              <span>{p.city.replace(/_/g, ' ')}</span>
            </div>
            {p.gang && (
              <div className="text-[11px] mt-1">
                Gang: <Link to={`/gangs/${p.gang.id}`} className="text-blood-400 hover:underline">{p.gang.name} <span className="text-ink-100/55 font-mono">[{p.gang.tag}]</span></Link>
              </div>
            )}
          </div>
        </div>

        {!isSelf && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy === 'start' || data.you_block || data.blocks_you}
              onClick={startConversation}
              className="btn btn-primary text-xs">
              {busy === 'start' ? '…' : 'Message'}
            </button>
            <button
              disabled={busy === 'challenge-knockout'}
              onClick={() => challenge('knockout')}
              className="btn text-xs"
              title={p.city !== character?.city ? 'Different city — fly to them first.' : 'Mutual combat — they must accept; turn-based fight in the Fight Club.'}>
              {busy === 'challenge-knockout' ? '…' : 'Challenge'}
            </button>
            <button
              disabled={p.city !== character?.city}
              onClick={() => nav(`/rob/${p.id}`)}
              className="btn text-xs"
              title={p.city !== character?.city ? 'Different city — fly to them first.' : "Mug them on the spot — async. Win and you steal all their cash + put them in hospital."}>
              Rob
            </button>
            <button
              disabled={p.city !== character?.city}
              onClick={() => nav(`/murder/${p.id}`)}
              className="btn text-xs"
              title={p.city !== character?.city ? 'Different city — fly to them first.' : 'Async assassination attempt with your equipped weapon. Permadeath on success.'}>
              Murder
            </button>
            <button
              disabled={busy === 'trade' || p.city !== character?.city}
              onClick={startTrade}
              className="btn text-xs"
              title={p.city !== character?.city ? 'You must both be in the same city to trade.' : 'Open a trade window with this player.'}>
              {busy === 'trade' ? '…' : 'Trade'}
            </button>
            {/* Invite to my gang — only if I'm officer+ and target has no gang */}
            {(myGang?.role === 'leader' || myGang?.role === 'officer') && !p.gang && (
              <button disabled={busy === 'invite'} onClick={invite} className="btn text-xs">
                {busy === 'invite' ? '…' : `Invite to ${myGang.gang.tag}`}
              </button>
            )}
            {data.you_block ? (
              <button disabled={busy === 'unblock'} onClick={unblock} className="btn btn-ghost text-xs">
                {busy === 'unblock' ? '…' : 'Unblock'}
              </button>
            ) : (
              <button disabled={busy === 'block'} onClick={block} className="btn btn-ghost text-xs">
                {busy === 'block' ? '…' : 'Block'}
              </button>
            )}
          </div>
        )}

        {data.blocks_you && (
          <p className="text-[11px] text-blood-400 mt-3">This player has blocked you.</p>
        )}
        {data.you_block && (
          <p className="text-[11px] text-yellow-400 mt-3">You've blocked this player.</p>
        )}
      </Card>

      {/* ── Loadout ──────────────────────────────────────────────── */}
      <Card title="🎒 Loadout" subtitle="What this player is carrying right now.">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Weapon</div>
            <div className="font-medium">
              {!data.loadout?.weapon || data.loadout.weapon.id === 'fists'
                ? 'Fists'
                : data.loadout.weapon.name}
            </div>
            <div className="text-[11px] text-ink-100/60">
              {data.loadout?.weapon?.maker ? `${data.loadout.weapon.maker} · ` : ''}
              DMG {data.loadout?.weapon?.dmg ?? 4}
              {data.loadout?.weapon?.ammoType ? ` · ${data.loadout.weapon.ammoType}` : ' · melee'}
            </div>
            {data.loadout?.weapon?.ammoType && (
              <div className="text-[11px] mt-1 tabular-nums">
                <span className="text-ink-100/50">Rounds left:</span>{' '}
                <span className={data.loadout.weapon_ammo > 0 ? 'text-money-400' : 'text-blood-400'}>
                  {data.loadout.weapon_ammo}
                </span>
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Armour</div>
            <div className="font-medium">
              {!data.loadout?.armour || data.loadout.armour.id === 'none'
                ? 'No armour'
                : data.loadout.armour.name}
            </div>
            <div className="text-[11px] text-ink-100/60">DEF {data.loadout?.armour?.def ?? 0}</div>
          </div>
        </div>
      </Card>

      {/* ── Garage ──────────────────────────────────────────────── */}
      <Card title={`🚗 Garage · ${data.garage?.length || 0}`}
        subtitle={data.garage?.length ? 'Cars they own across the world.' : 'No cars on file.'}>
        {data.garage?.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.garage.map(v => (
              <div key={v.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="font-medium">{v.maker} {v.name}</div>
                <div className="text-[11px] text-ink-100/60">Tier {v.tier} · book {fmt(v.bookPrice)}</div>
                <div className="text-[10px] text-ink-100/40 mt-0.5">
                  {v.acquired_via === 'stolen' ? '🥷 stolen' : '💼 bought'} · in {v.cityName}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Properties ──────────────────────────────────────────── */}
      <Card title={`🏘️ Properties · ${data.properties?.length || 0}`}
        subtitle={data.properties?.length ? 'Real estate they hold the deeds to.' : 'No registered property.'}>
        {data.properties?.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.properties.map(p => (
              <div key={p.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="font-medium">{p.name}</div>
                {p.address && <div className="text-[11px] text-ink-100/55">{p.address}</div>}
                <div className="text-[10px] text-ink-100/40 mt-0.5">
                  {p.cityName} · {fmt(p.cost)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Businesses ──────────────────────────────────────────── */}
      <Card title={`🏗️ Businesses · ${data.businesses?.length || 0}`}
        subtitle={data.businesses?.length ? 'Fronts and operations on the books.' : 'No businesses on the books.'}>
        {data.businesses?.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.businesses.map(b => (
              <div key={b.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{b.name}</div>
                  <span className="text-[10px] uppercase text-ink-100/40">L{b.level}</span>
                </div>
                <div className="text-[11px] text-ink-100/60">
                  {b.template_name}
                  {b.illegal && <span className="ml-1 text-blood-400">· illegal</span>}
                </div>
                <div className="text-[10px] text-ink-100/40 mt-0.5">
                  {b.cityName} · {fmt(b.hourly)}/hr
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <Link to="/players" className="text-xs text-ink-100/60 hover:text-ink-50">← Back to player list</Link>
      </Card>
    </div>
  );
}
