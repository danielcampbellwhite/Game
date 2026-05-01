import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

function Sparkline({ points, up, width = 320, height = 64 }) {
  if (!points || points.length < 2) {
    return <div style={{ width, height }} className="rounded bg-ink-950/30" />;
  }
  const ys = points.map(p => p.price);
  const xs = points.map(p => p.ts);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const yRange = maxY - minY || 1;
  const xRange = maxX - minX || 1;
  // 6 px padding top/bottom so peaks/troughs aren't flush against the edge
  const PAD = 6;
  const innerH = height - PAD * 2;
  const project = (p) => {
    const x = ((p.ts - minX) / xRange) * width;
    const y = PAD + (1 - (p.price - minY) / yRange) * innerH;
    return [x, y];
  };
  const linePath = points.map((p, i) => {
    const [x, y] = project(p);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const lineColor = up ? '#22c55e' : '#ef4444';
  const fillColor = up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
  // Subtle horizontal gridlines at min, midpoint, max
  const gridY = [PAD, height / 2, height - PAD];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
      {gridY.map((y, i) => (
        <line key={i} x1="0" x2={width} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      <path d={areaPath} fill={fillColor} />
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {/* End-of-line dot */}
      {(() => { const [x, y] = project(points[points.length - 1]); return <circle cx={x} cy={y} r="2.5" fill={lineColor} />; })()}
    </svg>
  );
}

function StockCard({ stock, holding, qty, setQty, onTrade, busy }) {
  const points = stock.history || [];
  const first = points[0]?.price ?? stock.price;
  const delta = stock.price - first;
  const deltaPct = first ? (delta / first) * 100 : 0;
  const up = delta >= 0;
  const high = points.length ? Math.max(...points.map(p => p.price)) : stock.price;
  const low  = points.length ? Math.min(...points.map(p => p.price)) : stock.price;

  return (
    <div className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
      <div className="flex justify-between items-baseline">
        <div className="min-w-0">
          <span className="font-medium tracking-wide">{stock.id}</span>
          <span className="text-ink-100/50 text-xs ml-2">{stock.name}</span>
          {stock.sector && <span className="text-[9px] uppercase tracking-wider text-ink-100/35 ml-2">{stock.sector}</span>}
        </div>
        <div className="text-right">
          <div className="font-display text-xl tabular-nums">£{stock.price.toFixed(2)}</div>
          <div className={`text-[11px] tabular-nums ${up ? 'text-money-400' : 'text-blood-400'}`}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{delta.toFixed(2)} ({up ? '+' : ''}{deltaPct.toFixed(2)}%) <span className="text-ink-100/40 ml-1">12h</span>
          </div>
        </div>
      </div>

      <div className="mt-2 -mx-3 border-y border-ink-100/5">
        <Sparkline points={points} up={up} />
      </div>
      <div className="flex justify-between text-[10px] text-ink-100/40 tabular-nums mt-1">
        <span>L £{low.toFixed(2)}</span>
        <span>H £{high.toFixed(2)}</span>
      </div>

      {holding ? (
        <div className="text-[11px] mt-2">
          Held <b>{holding.shares}</b> @ £{holding.avg_price.toFixed(2)} ·
          P/L <span className={holding.pl >= 0 ? 'text-money-400' : 'text-blood-400'}>{fmt(holding.pl)}</span>
        </div>
      ) : <div className="text-[11px] text-ink-100/40 mt-2">No position</div>}

      <div className="flex gap-2 mt-2">
        <input type="number" min="1" placeholder="qty"
          value={qty} onChange={e => setQty(e.target.value)} className="w-20" />
        <button disabled={busy} className="btn btn-primary text-xs flex-1" onClick={() => onTrade('buy')}>Buy</button>
        <button disabled={!holding || busy} className="btn btn-money text-xs flex-1" onClick={() => onTrade('sell')}>Sell</button>
      </div>
    </div>
  );
}

export default function Stocks() {
  const { refresh } = useGame();
  const [data, setData] = useState(null);
  const [shares, setShares] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/stocks')); }
  useEffect(() => {
    load();
    // Refresh every 60s so the graph stays fresh as ticks roll in.
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  async function trade(stock_id, action) {
    const n = Math.max(1, parseInt(shares[stock_id] || 1, 10));
    setBusy(`${action}-${stock_id}`); setMsg(null);
    try { await api.post(`/stocks/${action}`, { stock_id, shares: n }); await refresh(); await load(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const holdMap = Object.fromEntries(data.holdings.map(h => [h.stock_id, h]));

  return (
    <div className="space-y-3">
      <Card title="📈 Stock Broker" subtitle="Live tickers — past 12 hours of price action shown. Markets tick every 30 minutes.">
        {msg && <p className="text-xs text-blood-400">{msg}</p>}
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {data.market.map(s => (
          <StockCard
            key={s.id}
            stock={s}
            holding={holdMap[s.id]}
            qty={shares[s.id] || ''}
            setQty={(v) => setShares({ ...shares, [s.id]: v })}
            onTrade={(action) => trade(s.id, action)}
            busy={!!busy}
          />
        ))}
      </div>
    </div>
  );
}
