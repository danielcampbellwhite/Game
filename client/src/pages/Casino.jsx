import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';
import { sfx, scheduleRouletteTicks, isSfxOn, setSfxOn } from '../lib/sfx.js';

const TABS = [
  { key: 'roulette',  label: ' Roulette' },
  { key: 'blackjack', label: ' Blackjack' },
  { key: 'slots',     label: ' Slots' },
];

//  Roulette wheel + spin animation 

// European single-zero wheel order, 0 at top going clockwise.
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SEG_COUNT = WHEEL_ORDER.length;
const SEG_DEG = 360 / SEG_COUNT;

function polar(r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

function sectorPath(r, startDeg, endDeg) {
  const s = polar(r, startDeg);
  const e = polar(r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M 0 0 L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
}

function RouletteWheel({ rotation, spinning }) {
  return (
    <div className="relative w-64 h-64 sm:w-72 sm:h-72 mx-auto select-none">
      <div className="absolute inset-0"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 3.6s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
        }}>
        <svg viewBox="-150 -150 300 300" className="w-full h-full drop-shadow-xl">
          {WHEEL_ORDER.map((n, i) => {
            const startA = i * SEG_DEG - SEG_DEG / 2;
            const endA = startA + SEG_DEG;
            const fill = n === 0 ? '#15803d' : (RED_SET.has(n) ? '#991b1b' : '#0a0908');
            const labelPos = polar(120, i * SEG_DEG);
            return (
              <g key={n}>
                <path d={sectorPath(140, startA, endA)} fill={fill} stroke="#1f1d1b" strokeWidth="0.5" />
                <text
                  x={labelPos.x} y={labelPos.y}
                  fill="#f5f5f4"
                  fontSize="13"
                  fontWeight="600"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${i * SEG_DEG}, ${labelPos.x}, ${labelPos.y})`}>
                  {n}
                </text>
              </g>
            );
          })}
          <circle r="22" fill="#1f1d1b" stroke="#fbbf24" strokeWidth="2" />
          <circle r="6" fill="#fbbf24" />
        </svg>
      </div>
      {/* Fixed pointer */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
        <svg width="22" height="26"><polygon points="11,26 0,4 22,4" fill="#fbbf24" stroke="#0a0908" strokeWidth="1" /></svg>
      </div>
    </div>
  );
}

function Roulette() {
  const { character, refresh } = useGame();
  const [betType, setBetType] = useState('red');
  const [betValue, setBetValue] = useState(17);
  const [amount, setAmount] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  async function spin() {
    if (busy) return;
    setBusy(true);
    setLast(null);
    sfx.rouletteStart();
    const cancelTicks = scheduleRouletteTicks(3.6);
    try {
      const r = await api.post('/casino/roulette/spin', { betType, betValue: Number(betValue), amount: Number(amount) });
      const idx = WHEEL_ORDER.indexOf(r.number);
      const fullRevs = 6 + Math.floor(Math.random() * 3); // 6–8 revolutions
      // Compute the delta needed so the FINAL rotation lands exactly on the
      // result segment, regardless of any drift accumulated from prior spins.
      // The bug previously: subtracting `idx * SEG_DEG` from any starting
      // rotation only worked if rotation%360 was already 0; otherwise the
      // wheel ended off by the prior offset, so visual didn't match result.
      const targetModNorm  = ((-idx * SEG_DEG) % 360 + 360) % 360;
      const currentModNorm = ((rotation        % 360) + 360) % 360;
      // We always spin counter-clockwise (subtract from rotation). Pick the
      // delta that lands on the right modulo while still spinning forward.
      let delta = (currentModNorm - targetModNorm + 360) % 360;
      if (delta < 30) delta += 360; // make sure the wheel actually turns
      delta += fullRevs * 360;
      const newRotation = rotation - delta;
      setRotation(newRotation);
      setTimeout(async () => {
        setLast(r);
        setBusy(false);
        // 35:1 single-number wins are jackpot-rare; play the bigger chime.
        if (r.won && betType === 'number') sfx.jackpot();
        else if (r.won) sfx.win();
        else sfx.lose();
        await refresh();
      }, 3700);
    } catch (e) {
      cancelTicks();
      setLast({ error: e.message });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <RouletteWheel rotation={rotation} spinning={busy} />

      {last && !busy && (
        <div className="text-center">
          {last.error
            ? <p className="text-blood-400 text-sm">{last.error}</p>
            : <p className={`text-sm ${last.won ? 'text-money-400' : 'text-blood-400'}`}>
                Landed on <b>{last.number} {last.color}</b> — {last.won ? ` won ${fmt(last.payout)}` : `lost ${fmt(amount)}`}
              </p>}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs uppercase text-ink-100/60">Bet on</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['red', ' Red', '1:1'],
            ['black', ' Black', '1:1'],
            ['odd', 'Odd', '1:1'],
            ['even', 'Even', '1:1'],
            ['low', '1–18', '1:1'],
            ['high', '19–36', '1:1'],
            ['dozen1', '1st 12', '2:1'],
            ['dozen2', '2nd 12', '2:1'],
            ['dozen3', '3rd 12', '2:1'],
          ].map(([k, label, payout]) => (
            <button key={k} disabled={busy}
              onClick={() => setBetType(k)}
              className={`btn text-xs ${betType === k ? 'btn-primary' : 'btn-ghost'}`}>
              <div>{label}<div className="text-[9px] opacity-70">{payout}</div></div>
            </button>
          ))}
          <button disabled={busy}
            onClick={() => setBetType('number')}
            className={`btn text-xs col-span-3 ${betType === 'number' ? 'btn-primary' : 'btn-ghost'}`}>
            Single number (35:1) — pick {betType === 'number' && (
              <input type="number" min="0" max="36" value={betValue} onChange={e => setBetValue(e.target.value)}
                className="ml-2 w-16" onClick={e => e.stopPropagation()} />
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="Stake" className="flex-1" disabled={busy} />
        <button disabled={busy || !amount || character.cash < amount} className="btn btn-gold flex-1" onClick={spin}>
          {busy ? 'Spinning…' : `Spin for ${fmt(Number(amount) || 0)}`}
        </button>
      </div>
    </div>
  );
}

//  Slots — spinning reel animation 

const SLOT_EMOJI_POOL = ['','','','','','7️⃣'];

function SlotReel({ symbol, spinning }) {
  return (
    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-md bg-ink-800/80 border border-ink-100/10 overflow-hidden flex items-center justify-center">
      <div className={`text-5xl sm:text-6xl ${spinning ? 'animate-pulse' : ''}`}
        style={spinning ? { filter: 'blur(1px)', transform: 'translateY(2px)' } : undefined}>
        {symbol}
      </div>
    </div>
  );
}

function Slots() {
  const { character, refresh } = useGame();
  const [amount, setAmount] = useState(50);
  const [reels, setReels] = useState(['','','']);
  const [reelSpin, setReelSpin] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const intervals = useRef([null, null, null]);

  function startReel(idx) {
    intervals.current[idx] = setInterval(() => {
      setReels(rs => {
        const next = [...rs];
        next[idx] = SLOT_EMOJI_POOL[Math.floor(Math.random() * SLOT_EMOJI_POOL.length)];
        return next;
      });
    }, 70);
    setReelSpin(s => { const n = [...s]; n[idx] = true; return n; });
  }

  function stopReel(idx, finalSym) {
    if (intervals.current[idx]) {
      clearInterval(intervals.current[idx]);
      intervals.current[idx] = null;
    }
    setReels(rs => { const n = [...rs]; n[idx] = finalSym; return n; });
    setReelSpin(s => { const n = [...s]; n[idx] = false; return n; });
  }

  useEffect(() => () => intervals.current.forEach(i => i && clearInterval(i)), []);

  async function spin() {
    if (busy) return;
    setBusy(true);
    setLast(null);
    sfx.slotsStart();
    [0,1,2].forEach(startReel);

    try {
      const r = await api.post('/casino/slots/spin', { amount: Number(amount) });
      const finalEmojis = r.reels.map(x => x.emoji);
      // Stagger the reel stops left → right with a satisfying thunk on each.
      setTimeout(() => { stopReel(0, finalEmojis[0]); sfx.reelStop(); }, 1200);
      setTimeout(() => { stopReel(1, finalEmojis[1]); sfx.reelStop(); }, 1800);
      setTimeout(async () => {
        stopReel(2, finalEmojis[2]);
        sfx.reelStop();
        setLast(r);
        setBusy(false);
        // Top-tier slot wins (bells & sevens) get the jackpot fanfare.
        const big = r.won && r.payout >= Number(amount) * 50;
        if (big) sfx.jackpot();
        else if (r.won) sfx.win();
        else sfx.lose();
        await refresh();
      }, 2400);
    } catch (e) {
      [0,1,2].forEach(idx => intervals.current[idx] && clearInterval(intervals.current[idx]));
      setReelSpin([false,false,false]);
      setLast({ error: e.message });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-center">
      <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-6 inline-flex justify-center gap-2 mx-auto">
        {reels.map((r, i) => <SlotReel key={i} symbol={r} spinning={reelSpin[i]} />)}
      </div>
      {last && !busy && !last.error && (
        <p className={`text-sm ${last.won ? 'text-money-400 font-semibold' : 'text-blood-400'}`}>
          {last.won ? ` JACKPOT — ${fmt(last.payout)}!` : `Lost ${fmt(amount)}`}
        </p>
      )}
      {last?.error && <p className="text-blood-400 text-xs">{last.error}</p>}
      <div className="flex gap-2 max-w-md mx-auto">
        <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1" disabled={busy} />
        <button disabled={busy || !amount || character.cash < amount} className="btn btn-gold flex-1" onClick={spin}>
          {busy ? 'Spinning…' : `Spin for ${fmt(Number(amount) || 0)}`}
        </button>
      </div>
      <p className="text-[11px] text-ink-100/45">
        Three of a kind:  ×5 ·  ×8 ·  ×12 ·  ×25 ·  ×75 · 7️⃣ ×250
      </p>
    </div>
  );
}

//  Blackjack — animated cards 

const HIDDEN_CARD = '';

// Card slot with a "deal" flip-in animation.
function BlackjackCard({ value, idx }) {
  return (
    <span
      className="inline-block transition-all duration-500"
      style={{
        animation: 'bj-deal 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
        animationDelay: `${idx * 0.35}s`,
      }}>
      {value}
    </span>
  );
}

// We diff incoming hand state against displayed state and animate the new
// cards in one at a time. This makes deal/hit/dealer-play feel deliberate
// rather than instantly snapping.
const STEP_MS = 450;        // delay between each new card appearing
const DEALER_REVEAL_MS = 700;

function useAnimatedHand(remoteHand) {
  const [displayHand, setDisplayHand] = useState(remoteHand);
  const [animating, setAnimating] = useState(false);
  const queueRef = useRef([]);

  useEffect(() => {
    if (!remoteHand) { setDisplayHand(null); return; }
    if (!displayHand) {
      // Fresh hand — cascade reveal cards (already animated by BlackjackCard).
      setDisplayHand(remoteHand);
      return;
    }

    // Diff: how many new cards on each side?
    const newPlayer = remoteHand.playerCards.length - displayHand.playerCards.length;
    const newDealer = remoteHand.dealerCards.length - displayHand.dealerCards.length;
    const dealerRevealed =
      displayHand.dealerCards.includes(HIDDEN_CARD) && !remoteHand.dealerCards.includes(HIDDEN_CARD);

    if (newPlayer <= 0 && newDealer <= 0 && !dealerRevealed) {
      setDisplayHand(remoteHand);
      return;
    }

    // Build a queue of "intermediate" hand states to step through.
    const queue = [];
    let curPlayer = [...displayHand.playerCards];
    let curDealer = [...displayHand.dealerCards];

    // Add new player cards one at a time
    for (let i = 0; i < newPlayer; i++) {
      curPlayer = [...curPlayer, remoteHand.playerCards[displayHand.playerCards.length + i]];
      queue.push({ ...displayHand, playerCards: curPlayer, dealerCards: curDealer, playerTotal: null, status: 'playing', result: null, message: null });
    }

    // Reveal dealer hole card if needed
    if (dealerRevealed) {
      curDealer = [remoteHand.dealerCards[0], ...curDealer.slice(1)];
      // Replace placeholder in slot 1 with actual second card
      curDealer[1] = remoteHand.dealerCards[1];
      queue.push({ ...displayHand, playerCards: curPlayer, dealerCards: [...curDealer], playerTotal: null, status: 'finished', result: null, message: null });
    }

    // Add additional dealer cards one at a time
    const dealerAlreadyHas = displayHand.dealerCards.length;
    const startDealerIdx = dealerRevealed ? dealerAlreadyHas : dealerAlreadyHas;
    for (let i = startDealerIdx; i < remoteHand.dealerCards.length; i++) {
      curDealer = [...curDealer, remoteHand.dealerCards[i]];
      queue.push({ ...displayHand, playerCards: curPlayer, dealerCards: [...curDealer], playerTotal: null, status: 'finished', result: null, message: null });
    }

    // Final state with full totals + result message
    queue.push(remoteHand);

    queueRef.current = queue;
    setAnimating(true);

    let idx = 0;
    const tick = () => {
      if (idx >= queue.length) {
        setAnimating(false);
        return;
      }
      setDisplayHand(queue[idx]);
      idx++;
      const wait = (idx === 1 && dealerRevealed) ? DEALER_REVEAL_MS : STEP_MS;
      setTimeout(tick, wait);
    };
    tick();
  }, [remoteHand]); // eslint-disable-line react-hooks/exhaustive-deps

  return { displayHand, animating };
}

function Blackjack() {
  const { character, refresh } = useGame();
  const [serverHand, setServerHand] = useState(null);
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);
  const { displayHand, animating } = useAnimatedHand(serverHand);

  async function load() {
    const r = await api.get('/casino/blackjack');
    setServerHand(r.hand);
  }
  useEffect(() => { load(); }, []);

  async function call(action, body) {
    setBusy(action); setMsg(null);
    try {
      const r = await api.post(`/casino/blackjack/${action}`, body);
      setServerHand(r.hand);
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  const hand = displayHand;
  const playing = hand?.status === 'playing';
  const finished = hand?.status === 'finished';
  const reallyFinished = serverHand?.status === 'finished' && !animating;

  // Play a card-deal sound every time the animator surfaces a new card.
  const lastCardCounts = useRef({ p: 0, d: 0 });
  useEffect(() => {
    if (!displayHand) { lastCardCounts.current = { p: 0, d: 0 }; return; }
    const np = displayHand.playerCards.length;
    const nd = displayHand.dealerCards.length;
    const newP = Math.max(0, np - lastCardCounts.current.p);
    const newD = Math.max(0, nd - lastCardCounts.current.d);
    if (newP + newD > 0) sfx.cardDeal();
    lastCardCounts.current = { p: np, d: nd };
  }, [displayHand]);

  // Result chime once the animation has finished settling on the final hand.
  const lastResult = useRef(null);
  useEffect(() => {
    if (!reallyFinished) { lastResult.current = null; return; }
    const r = serverHand.result;
    if (r === lastResult.current) return;
    lastResult.current = r;
    if      (r === 'blackjack') sfx.jackpot();
    else if (r === 'won')       sfx.win();
    else if (r === 'lost')      sfx.lose();
    else if (r === 'push')      sfx.push();
  }, [reallyFinished, serverHand?.result]);
  const resultColor = {
    won: 'text-money-400',
    blackjack: 'text-gold-400',
    lost: 'text-blood-400',
    push: 'text-yellow-300',
  }[serverHand?.result] || '';
  const showResultText = reallyFinished;

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes bj-deal {
          0%   { opacity: 0; transform: translateY(-30px) rotate(-12deg) scale(0.7); }
          70%  { opacity: 1; transform: translateY(4px)   rotate(2deg)   scale(1.04); }
          100% { opacity: 1; transform: translateY(0)     rotate(0)      scale(1); }
        }
      `}</style>

      {msg && <p className="text-blood-400 text-xs">{msg}</p>}

      {hand ? (
        <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-4 space-y-4">
          <div>
            <div className="text-[10px] uppercase text-ink-100/55">
              Dealer {!animating && hand.dealerTotal != null && `(${hand.dealerTotal})`}
            </div>
            <div className="font-display text-4xl tabular-nums tracking-widest mt-1 min-h-[3rem]">
              {hand.dealerCards.map((c, i) => <BlackjackCard key={`d-${i}-${c}`} value={c} idx={i} />)
                .reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`gap-d-${i}`} className="inline-block w-3" />, el], [])}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/55">
              You ({hand.playerTotal ?? '…'}) · staking {fmt(hand.bet)}
            </div>
            <div className="font-display text-4xl tabular-nums tracking-widest mt-1 min-h-[3rem]">
              {hand.playerCards.map((c, i) => <BlackjackCard key={`p-${i}-${c}`} value={c} idx={i} />)
                .reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`gap-p-${i}`} className="inline-block w-3" />, el], [])}
            </div>
          </div>
          {showResultText && serverHand.message && (
            <p className={`text-sm font-semibold ${resultColor}`}>
              {serverHand.result === 'won' || serverHand.result === 'blackjack' ? ' ' : ''}
              {serverHand.message}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-100/55 text-center py-6">Place a bet to start a hand.</p>
      )}

      {playing && !animating ? (
        <div className="grid grid-cols-3 gap-2">
          <button disabled={busy === 'hit' || animating}    className="btn btn-primary" onClick={() => call('hit')}>Hit</button>
          <button disabled={busy === 'stand' || animating}  className="btn btn-money"   onClick={() => call('stand')}>Stand</button>
          <button disabled={busy === 'double' || animating || character.cash < hand.bet || hand.playerCards.length !== 2}
            className="btn btn-gold" onClick={() => call('double')}>Double</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input type="number" min="1" value={bet} onChange={e => setBet(e.target.value)} className="flex-1" disabled={animating || busy} />
          <button disabled={busy === 'deal' || animating || !bet || character.cash < bet} className="btn btn-gold flex-1"
            onClick={() => call('deal', { bet: Number(bet) })}>
            {animating ? 'Dealing…' : reallyFinished ? 'Deal again' : 'Deal'}
          </button>
        </div>
      )}
    </div>
  );
}

//  Page 

function SoundToggle() {
  const [on, setOn] = useState(isSfxOn());
  function toggle() {
    const next = !on;
    setSfxOn(next);
    setOn(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? 'Mute sound effects' : 'Unmute sound effects'}
      title={on ? 'Mute sound effects' : 'Unmute sound effects'}
      className="btn btn-ghost text-xs">
      {on ? ' Sound on' : ' Muted'}
    </button>
  );
}

export default function Casino() {
  const [tab, setTab] = useState('roulette');
  return (
    <div className="space-y-4">
      <Card title=" The Lucky Crown Casino"
        subtitle="Roulette spins, blackjack hands, and slot pulls. The house always wins, but tonight could be different."
        right={<SoundToggle />}>
        <div className="flex gap-2">
          {TABS.map(t => (
            <button key={t.key}
              className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'} flex-1`}
              onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </Card>
      <Card>
        {tab === 'roulette'  && <Roulette  />}
        {tab === 'blackjack' && <Blackjack />}
        {tab === 'slots'     && <Slots     />}
      </Card>
    </div>
  );
}
