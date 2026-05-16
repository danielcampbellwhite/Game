import React, { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { Link, useNavigate } from 'react-router-dom';

//  Showcase content 
//
// Edit these arrays as features ship. STATS is the at-a-glance numbers
// strip; SHOWCASE is the screenshot grid. Each card optionally accepts
// an `img` URL — if provided, it renders <img>; otherwise we fall back
// to a styled gradient placeholder so the layout stays intact while
// real screenshots are still being captured.
//
// To drop a real screenshot in, save the file under
//   client/public/screenshots/<name>.png
// and set `img: '/screenshots/<name>.png'`.

const STATS = [
  { value: '18',    label: 'Cities' },
  { value: '60+',   label: 'Real-world weapons' },
  { value: '105',   label: 'Vehicles' },
  { value: '15',    label: 'Careers' },
  { value: '20+',   label: 'Business templates' },
  { value: '100',   label: 'Level cap' },
];

const SHOWCASE = [
  { img: null, emoji: '', bg: 'from-blue-900/40 to-ink-950',
    title: 'A real-time world map',
    blurb: '18 cities. Live player counts. Drag and zoom to scout the action.' },
  { img: null, emoji: '', bg: 'from-yellow-900/40 to-ink-950',
    title: 'Casino & vice',
    blurb: 'Roulette, blackjack, slots, sports books, scratchers — with sound effects.' },
  { img: null, emoji: '', bg: 'from-blood-900/50 to-ink-950',
    title: 'Real-time PvP',
    blurb: 'Challenge anyone in your city. Knockout for sport, murder during a war.' },
  { img: null, emoji: '', bg: 'from-emerald-900/30 to-ink-950',
    title: 'Gangs, wars, heists',
    blurb: 'Found a gang at level 10. Wage 24h turf wars. Plan multi-role heists.' },
  { img: null, emoji: '', bg: 'from-violet-900/30 to-ink-950',
    title: '105 vehicles to own',
    blurb: 'From beaters to hypercars. Buy clean, steal them, or chop them up.' },
  { img: null, emoji: '', bg: 'from-orange-900/30 to-ink-950',
    title: 'A real arsenal',
    blurb: 'Glocks, SIGs, M4s, Barretts — with matching ammo and tiered armour.' },
];

const BULLETS = [
  'Lift wallets, knock over banks, run drugs across borders, hunt rival players in the alley.',
  'Found a gang. Declare war on another. Hold turf for permanent crime-cooldown perks.',
  'Hold down a job for steady wages, fence illegal cash through the underworld, bet your bankroll on the next horse race.',
  'No background workers — your city accrues income, drift and timers while you\'re offline. Drop in for five minutes or all night.',
];

function StatBlock({ value, label }) {
  return (
    <div className="text-center">
      <div className="font-display text-3xl text-blood-400 tabular-nums">{value}</div>
      <div className="text-[12px] uppercase text-ink-100/55 tracking-wide mt-1">{label}</div>
    </div>
  );
}

function ShowcaseCard({ s }) {
  return (
    <div className="rounded-lg border border-ink-100/10 overflow-hidden bg-ink-950/60">
      {s.img ? (
        <img src={s.img} alt={s.title} className="w-full h-32 object-cover" />
      ) : (
        <div className={`relative h-32 bg-gradient-to-br ${s.bg} flex items-center justify-center overflow-hidden`}>
          <span className="text-7xl opacity-25 select-none">{s.emoji}</span>
        </div>
      )}
      <div className="p-3 border-t border-ink-100/10">
        <div className="text-sm font-medium text-ink-50">{s.title}</div>
        <div className="text-[13px] text-ink-100/55 leading-snug mt-0.5">{s.blurb}</div>
      </div>
    </div>
  );
}

export default function Login() {
  const { login, register } = useGame();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      if (mode === 'login') {
        const r = await login(username, password);
        nav(r.hasCharacter ? '/' : '/create');
      } else {
        await register(username, email, password);
        nav('/create');
      }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      {/* Login form */}
      <div className="card max-w-sm mx-auto">
        <div className="text-center mb-4">
          <div className="relative inline-block pb-3">
            <span className="font-display text-5xl text-blood-500 leading-none tracking-wide">MAFIA LIFE</span>
            <span
              aria-hidden
              className="font-cursive text-gold-400/95 text-3xl leading-none absolute -bottom-2 right-0 translate-y-3 select-none pointer-events-none whitespace-nowrap"
              style={{ textShadow: '0 1px 0 rgba(0,0,0,0.55)' }}>
              Criminal Empire
            </span>
          </div>
          <p className="text-xs text-ink-100/50 mt-3">Build an empire — or rot in jail trying.</p>
          <p className="text-[13px] text-ink-100/40 mt-1">
            <Link to="/patches" className="hover:text-blood-300 transition">Patches & updates →</Link>
          </p>
        </div>
        <div className="flex gap-1 mb-4 text-xs">
          <button className={`btn ${mode==='login' ? 'btn-primary' : 'btn-ghost'} flex-1`} onClick={() => setMode('login')}>Sign in</button>
          <button className={`btn ${mode==='register' ? 'btn-primary' : 'btn-ghost'} flex-1`} onClick={() => setMode('register')}>Create account</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" autoFocus className="w-full" />
          {mode === 'register' && (
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (for account recovery)" type="email" autoComplete="email" className="w-full" />
          )}
          <div className="relative">
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-2 my-auto h-7 px-2 text-[13px] uppercase tracking-wide text-ink-100/60 hover:text-ink-50 transition">
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {err && <p className="text-blood-400 text-xs">{err}</p>}
          <button disabled={busy} type="submit" className="btn btn-primary w-full">
            {busy ? '...' : (mode === 'login' ? 'Enter the city' : 'Start a new life')}
          </button>
        </form>
      </div>

      {/* Showcase */}
      <div className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-display text-2xl text-ink-50">From petty thief to global empire</h2>
          <p className="text-sm text-ink-100/65 mt-2">
            A persistent browser-based crime sim. No install, no download — pick a name,
            pick a city, see how long you last.
          </p>
        </div>

        <div className="card">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {STATS.map(s => <StatBlock key={s.label} {...s} />)}
          </div>
        </div>

        <ul className="grid sm:grid-cols-2 gap-2 max-w-2xl mx-auto text-sm text-ink-100/75">
          {BULLETS.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-blood-400 shrink-0">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SHOWCASE.map(s => <ShowcaseCard key={s.title} s={s} />)}
        </div>
      </div>
    </div>
  );
}
