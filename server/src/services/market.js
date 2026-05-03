import { db } from '../db.js';
import { CITIES, DRUGS, STOCKS, drugById, cityById, stockById } from '../data.js';

const DRUG_TICK_MS = 60 * 60 * 1000;        // hourly walk
const STOCK_TICK_MS = 30 * 60 * 1000;       // 30 min walk
const STOCK_TREND_MS = 6 * 60 * 60 * 1000;  // re-roll trend every 6h

function gauss(stdDev = 1) {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

//  Drugs 

function ensureDrugRow(city, drug) {
  const row = db.prepare('SELECT * FROM drug_market WHERE city = ? AND drug_id = ?').get(city, drug.id);
  if (row) return row;
  const cityObj = cityById(city);
  const start = drug.base * (cityObj?.drugMul || 1.0);
  const now = Date.now();
  db.prepare('INSERT INTO drug_market (city, drug_id, price, last_updated) VALUES (?, ?, ?, ?)')
    .run(city, drug.id, start, now);
  return { city, drug_id: drug.id, price: start, last_updated: now };
}

export function getDrugPrice(city, drugId) {
  const drug = drugById(drugId);
  if (!drug) return null;
  let row = ensureDrugRow(city, drug);
  const now = Date.now();
  const ticks = Math.floor((now - row.last_updated) / DRUG_TICK_MS);
  if (ticks > 0) {
    const cityMul = cityById(city)?.drugMul || 1.0;
    let price = row.price;
    for (let i = 0; i < Math.min(ticks, 24); i++) { // cap walks per call
      price *= 1 + gauss(0.08);
    }
    const min = drug.base * cityMul * 0.4;
    const max = drug.base * cityMul * 2.5;
    price = clamp(price, min, max);
    db.prepare('UPDATE drug_market SET price = ?, last_updated = ? WHERE city = ? AND drug_id = ?')
      .run(price, row.last_updated + ticks * DRUG_TICK_MS, city, drugId);
    row.price = price;
    row.last_updated += ticks * DRUG_TICK_MS;
  }
  return Math.round(row.price);
}

export function getDrugMarketForCity(city) {
  return DRUGS.map(d => ({
    id: d.id, name: d.name,
    levelGate: d.levelGate,
    price: getDrugPrice(city, d.id),
    base: d.base,
  }));
}

//  Stocks 

const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // keep 24h, show 12h

// Inlined rather than module-level prepared because this file is imported
// before initDb() runs the table creation.
const insertHistory = (stockId, ts, price) =>
  db.prepare('INSERT OR REPLACE INTO stock_history (stock_id, ts, price) VALUES (?, ?, ?)').run(stockId, ts, price);
const pruneHistory = (cutoff) =>
  db.prepare('DELETE FROM stock_history WHERE ts < ?').run(cutoff);

function ensureStockRow(stock) {
  const row = db.prepare('SELECT * FROM stock_market WHERE stock_id = ?').get(stock.id);
  if (row) return row;
  const now = Date.now();
  db.prepare('INSERT INTO stock_market (stock_id, price, trend, last_updated, trend_until) VALUES (?, ?, ?, ?, ?)')
    .run(stock.id, stock.base, 0, now, now + STOCK_TREND_MS);

  // Bootstrap 24 history points walking backwards from the base price so a
  // brand-new market has an interesting-looking graph from the first frame.
  let p = stock.base;
  insertHistory(stock.id, now, p);
  for (let i = 1; i <= 24; i++) {
    p = p / (1 + gauss(stock.vol));
    p = clamp(p, stock.base * 0.4, stock.base * 2.5);
    insertHistory(stock.id, now - i * STOCK_TICK_MS, p);
  }
  return { stock_id: stock.id, price: stock.base, trend: 0, last_updated: now, trend_until: now + STOCK_TREND_MS };
}

export function getStockPrice(stockId) {
  const stock = stockById(stockId);
  if (!stock) return null;
  let row = ensureStockRow(stock);
  const now = Date.now();
  const ticks = Math.floor((now - row.last_updated) / STOCK_TICK_MS);
  if (ticks > 0) {
    let price = row.price;
    let trend = row.trend;
    let trendUntil = row.trend_until;
    for (let i = 0; i < Math.min(ticks, 48); i++) {
      const stamp = row.last_updated + (i + 1) * STOCK_TICK_MS;
      if (stamp >= trendUntil) {
        trend = (Math.random() - 0.5) * 0.04; // ±2%
        trendUntil = stamp + STOCK_TREND_MS;
      }
      price *= 1 + trend / 24 + gauss(stock.vol);
      const min = stock.base * 0.2;
      const max = stock.base * 5.0;
      price = clamp(price, min, max);
      // Persist each tick so the graph captures every step, not just the final.
      insertHistory(stockId, stamp, price);
    }
    db.prepare('UPDATE stock_market SET price = ?, trend = ?, last_updated = ?, trend_until = ? WHERE stock_id = ?')
      .run(price, trend, row.last_updated + ticks * STOCK_TICK_MS, trendUntil, stockId);
    row.price = price;
    row.trend = trend;
    row.trend_until = trendUntil;
    row.last_updated += ticks * STOCK_TICK_MS;
    pruneHistory(now - HISTORY_RETENTION_MS);
  }
  return Math.round(row.price * 100) / 100;
}

// Most recent N hours of price ticks for a stock, oldest → newest.
export function getStockHistory(stockId, hours = 12) {
  // Force a tick to flush any in-flight ticks into history.
  getStockPrice(stockId);
  const since = Date.now() - hours * 60 * 60 * 1000;
  const rows = db.prepare(
    'SELECT ts, price FROM stock_history WHERE stock_id = ? AND ts >= ? ORDER BY ts ASC'
  ).all(stockId, since);
  return rows.map(r => ({ ts: r.ts, price: Math.round(r.price * 100) / 100 }));
}

export function getAllStocks() {
  return STOCKS.map(s => ({
    id: s.id, name: s.name, base: s.base,
    price: getStockPrice(s.id),
    history: getStockHistory(s.id, 12),
  }));
}
