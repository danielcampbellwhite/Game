import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

function Slider({ label, value, onChange, hint, max = 5 }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="uppercase text-ink-100/70 tracking-wide">{label}</span>
        <span className="font-semibold tabular-nums">{value} / {max}</span>
      </div>
      <input type="range" min="1" max={max} value={value} onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-blood-500" />
      <p className="text-[10px] text-ink-100/50">{hint}</p>
    </div>
  );
}

function Founder({ templates, currentCity, currentCityName, onFounded, character }) {
  const [picked, setPicked] = useState(null);
  const [name, setName] = useState('');
  const [scale, setScale] = useState(2);
  const [risk, setRisk] = useState(1);
  const [quality, setQuality] = useState(2);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Live preview — debounced via effect dependency on slider values
  useEffect(() => {
    if (!picked) { setPreview(null); return; }
    let alive = true;
    api.post('/businesses/preview', { template_id: picked.id, scale, risk, quality })
      .then(p => { if (alive) setPreview(p); })
      .catch(() => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [picked?.id, scale, risk, quality]);

  async function found() {
    if (!picked) return;
    setBusy(true); setErr(null);
    try {
      await api.post('/businesses/found', { template_id: picked.id, name, scale, risk, quality });
      setPicked(null); setName(''); setScale(2); setRisk(1); setQuality(2); setPreview(null);
      onFounded?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const legalTemplates = templates.filter(t => !t.illegal);
  const illegalTemplates = templates.filter(t => t.illegal);

  return (
    <Card title="🏗️ Found a new business" subtitle={`In ${currentCityName} — fly elsewhere to build there instead.`}>
      <p className="text-[11px] text-ink-100/50 mb-3">
        Pick a template, name your venture, and tune the sliders.{' '}
        <b>Scale</b> raises cost and hourly income.{' '}
        <b>Risk</b> only applies to illegal fronts — it boosts profit but amplifies police <i>raid</i> chance.{' '}
        <b>Quality</b> raises hourly slightly and, on illegal fronts, lowers raid odds — base 5% at quality 1, down to 1% at quality 5.{' '}
        <span className="text-blood-400">A raid <b>destroys the business entirely</b>, wipes pending earnings, and may jail you.</span>{' '}
        <span className="text-money-400">Legal businesses are never raided.</span>
      </p>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs uppercase text-ink-100/60 mb-1">Legal — clean cash</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {legalTemplates.map(t => (
              <button key={t.id} type="button" onClick={() => setPicked(t)}
                className={`p-2 rounded-lg border text-left text-xs ${picked?.id === t.id ? 'border-blood-500 bg-blood-700/20' : 'border-ink-100/10 hover:bg-ink-800/60'}`}>
                <div className="text-xl">{t.emoji}</div>
                <div className="font-medium leading-tight">{t.name}</div>
                <div className="text-[10px] text-ink-100/50">Lvl {t.levelGate}+</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs uppercase text-ink-100/60 mb-1">Illegal — dirty cash + raid risk</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {illegalTemplates.map(t => (
              <button key={t.id} type="button" onClick={() => setPicked(t)}
                className={`p-2 rounded-lg border text-left text-xs ${picked?.id === t.id ? 'border-blood-500 bg-blood-700/20' : 'border-ink-100/10 hover:bg-ink-800/60'}`}>
                <div className="text-xl">{t.emoji}</div>
                <div className="font-medium leading-tight">{t.name}</div>
                <div className="text-[10px] text-ink-100/50">Lvl {t.levelGate}+</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {picked && (
        <div className="mt-5 pt-4 border-t border-ink-100/10 grid md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase text-ink-100/70 tracking-wide">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={`Tony's ${picked.name}`} maxLength={32} className="w-full" />
            </div>
            <Slider label="Scale" value={scale} onChange={setScale} hint="Bigger operation. More cost, much more hourly." />
            {picked.illegal && (
              <Slider label="Risk" value={risk} onChange={setRisk} hint="Brazen vs. discreet. Higher = bigger payout, more police raids." />
            )}
            <Slider label="Quality" value={quality} onChange={setQuality}
              hint={picked.illegal
                ? 'Premium fitout. Higher cost, slight bump to hourly, lower raid odds.'
                : 'Premium fitout. Higher cost, slight bump to hourly. (No raid risk on legal businesses.)'} />
          </div>
          <div className="rounded-lg p-3 border border-ink-100/15 bg-ink-950/60">
            <div className="text-2xl mb-1">{picked.emoji} {picked.name}</div>
            <div className="text-xs text-ink-100/60">Located in {currentCityName}.</div>
            <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
              <div>
                <div className="text-[10px] uppercase text-ink-100/50">Build cost</div>
                <div className={`tabular-nums ${preview && character.cash < preview.cost ? 'text-blood-400' : 'text-money-400'}`}>{fmt(preview?.cost)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-ink-100/50">Hourly</div>
                <div className={`tabular-nums ${picked.illegal ? 'text-blood-400' : 'text-money-400'}`}>{fmt(preview?.hourly)}</div>
              </div>
              {picked.illegal && (
                <div>
                  <div className="text-[10px] uppercase text-ink-100/50">Raid chance / collect</div>
                  <div className="tabular-nums">{((preview?.raidChance || 0) * 100).toFixed(2)}%</div>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase text-ink-100/50">Payback (cap 24h)</div>
                <div className="tabular-nums">{preview?.hourly ? `${Math.ceil(preview.cost / preview.hourly)} h` : '—'}</div>
              </div>
            </div>
            {err && <p className="text-blood-400 text-xs mt-2">{err}</p>}
            <button disabled={busy || !preview || !name || character.cash < (preview?.cost || 0)}
              className="btn btn-primary w-full mt-4" onClick={found}>
              {busy ? '...' : preview ? `Found for ${fmt(preview.cost)}` : 'Pick a template'}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Businesses() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [launder, setLaunder] = useState('');
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);
  const [showFounder, setShowFounder] = useState(false);

  async function load() { setData(await api.get('/businesses')); }
  useEffect(() => { load(); }, [character?.city]);

  async function action(path, body, key) {
    setBusy(key); setMsg(null);
    try {
      const r = await api.post(`/businesses/${path}`, body);
      if (r.raided) setMsg(`🚨 RAID! Business confiscated · lost ${fmt(r.lost)} pending${r.jailMin ? ` · jailed ${r.jailMin}m` : ''}`);
      else if (r.earnings) setMsg(`Collected ${fmt(r.earnings)}`);
      else if (r.clean) setMsg(`Cleaned ${fmt(r.clean)} (lost ${fmt(r.lost)})`);
      else setMsg('Done.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title="Your empire" right={
        <button className="btn btn-primary text-xs" onClick={() => setShowFounder(s => !s)}>
          {showFounder ? 'Close founder' : '+ Found new'}
        </button>
      }>
        {!data.owned.length ? <p className="text-sm text-ink-100/60">No businesses yet — found your first below.</p> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.owned.map(b => (
              <div key={b.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{b.emoji} {b.name}</div>
                    <div className="text-[10px] text-ink-100/50">{b.template_name} · Lvl {b.level} · {b.cityName}</div>
                  </div>
                  {b.illegal && <span className="text-blood-400 text-[10px] uppercase">illegal</span>}
                </div>
                <div className="text-[11px] text-ink-100/60 mt-1">
                  {fmt(b.hourly)}/hr · pending: <span className={b.illegal ? 'text-blood-400' : 'text-money-400'}>{fmt(b.pending)}</span>
                  {b.illegal && b.raidChance > 0 && <span className="ml-2 text-yellow-400">raid {(b.raidChance * 100).toFixed(1)}%</span>}
                </div>
                <div className="text-[10px] text-ink-100/40 mt-0.5">scale {b.scale} · risk {b.risk} · quality {b.quality}</div>
                <div className="flex gap-2 mt-2">
                  <button disabled={busy === `c${b.id}` || b.pending <= 0} className="btn btn-money text-xs flex-1"
                    onClick={() => action('collect', { id: b.id }, `c${b.id}`)}>Collect</button>
                  <button disabled={busy === `u${b.id}` || character.cash < b.upgradeCost || b.level >= 10} className="btn text-xs flex-1"
                    onClick={() => action('upgrade', { id: b.id }, `u${b.id}`)}>
                    {b.level >= 10 ? 'Maxed' : `Upgrade ${fmt(b.upgradeCost)}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showFounder && (
        <Founder
          templates={data.templates}
          currentCity={data.currentCity}
          currentCityName={data.currentCityName}
          character={character}
          onFounded={async () => { await refresh(); await load(); setShowFounder(false); }}
        />
      )}

      <Card title="🧼 Money Laundering" subtitle={`Dirty cash: ${fmt(character.dirty_cash)}`}>
        {data.owned.some(b => b.launderRate) ? (
          <>
            <div className="flex gap-2">
              <input type="number" min="1" placeholder="Amount to launder" value={launder} onChange={e => setLaunder(e.target.value)} className="flex-1" />
              <button disabled={!launder || busy === 'l'} className="btn btn-gold" onClick={() => action('launder', { amount: parseInt(launder, 10) }, 'l')}>Launder</button>
            </div>
            <p className="text-[11px] text-ink-100/50 mt-2">
              Your best-rate front is used automatically. Currently:{' '}
              <b className="text-money-400">
                {Math.round(Math.max(...data.owned.filter(b => b.launderRate).map(b => b.launderRate)) * 100)}%
              </b>{' '}retained per pound cleaned.
            </p>
          </>
        ) : (
          <div className="text-sm space-y-2">
            <p className="text-ink-100/75">
              You don't own a business that can act as a laundering front yet — dirty cash stays dirty until you do.
            </p>
            <p className="text-[11px] text-ink-100/55">
              Found one of these via <b>+ Found new</b> above. Each has a different "clean rate" — the % of every pound that survives the wash:
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-ink-100/65 mt-1">
              <li>🧼 Car Wash — <b className="text-money-400">70%</b></li>
              <li>🎰 Underground Casino — <b className="text-money-400">74%</b></li>
              <li>💃 Strip Club — <b className="text-money-400">78%</b></li>
              <li>🏘️ Real Estate Office — <b className="text-money-400">78%</b></li>
              <li>🪩 Nightclub — <b className="text-money-400">82%</b></li>
              <li>🏨 Luxury Hotel — <b className="text-money-400">86%</b></li>
            </ul>
            <p className="text-[11px] text-ink-100/45">
              Higher tiers clean more efficiently but cost a lot more upfront. The £25k Car Wash is the cheapest entry into laundering.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
