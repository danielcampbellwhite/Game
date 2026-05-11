import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { STOCKS, stockById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { getStockPrice, getAllStocks } from '../services/market.js';

const router = Router();

// Bid/ask spread — players pay slightly more than mid to buy and receive
// slightly less than mid to sell. Without a spread, stocks round-trip for
// zero cost and let players park cash off the "robbable" surface for free
// (the rob route only takes from `cash`, not stocks). The spread is small
// (0.5% each side, 1% round-trip) so day-to-day trading still feels free
// — it just makes parking cash there to dodge robbery cost something.
const SPREAD_BUY  = 1.005;
const SPREAD_SELL = 0.995;

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const lvl = ch.level || 1;
  const market = getAllStocks().map(s => {
    const cat = stockById(s.id);
    const levelGate = cat?.levelGate || 1;
    return { ...s, levelGate, locked: lvl < levelGate };
  });
  const holdings = db.prepare('SELECT * FROM stocks_owned WHERE char_id = ?').all(ch.id).map(h => {
    const stock = stockById(h.stock_id);
    const price = getStockPrice(h.stock_id);
    return { ...h, name: stock.name, price, value: Math.floor(price * h.shares), pl: Math.floor((price - h.avg_price) * h.shares) };
  });
  res.json({ market, holdings });
});

router.post('/buy', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const stock = stockById(req.body?.stock_id);
  const shares = Math.max(1, parseInt(req.body?.shares || 0, 10));
  if (!stock) return res.status(400).json({ error: 'Unknown stock' });
  const gate = stock.levelGate || 1;
  if ((ch.level || 1) < gate) return res.status(403).json({ error: `${stock.name} unlocks at level ${gate}.` });
  const mid = getStockPrice(stock.id);
  const askPrice = mid * SPREAD_BUY;
  const cost = Math.floor(askPrice * shares);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  ch.cash -= cost;
  const existing = db.prepare('SELECT * FROM stocks_owned WHERE char_id = ? AND stock_id = ?').get(ch.id, stock.id);
  if (existing) {
    const total = existing.shares + shares;
    const avg = ((existing.avg_price * existing.shares) + askPrice * shares) / total;
    db.prepare('UPDATE stocks_owned SET shares = ?, avg_price = ? WHERE id = ?').run(total, avg, existing.id);
  } else {
    db.prepare('INSERT INTO stocks_owned (char_id, stock_id, shares, avg_price) VALUES (?, ?, ?, ?)')
      .run(ch.id, stock.id, shares, askPrice);
  }
  writeLog(ch.id, 'stock', `Bought ${shares} ${stock.id} @ £${askPrice.toFixed(2)} (-£${cost}).`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/sell', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const stock = stockById(req.body?.stock_id);
  const shares = Math.max(1, parseInt(req.body?.shares || 0, 10));
  if (!stock) return res.status(400).json({ error: 'Unknown stock' });
  const existing = db.prepare('SELECT * FROM stocks_owned WHERE char_id = ? AND stock_id = ?').get(ch.id, stock.id);
  if (!existing || existing.shares < shares) return res.status(400).json({ error: 'Not enough shares' });
  const mid = getStockPrice(stock.id);
  const bidPrice = mid * SPREAD_SELL;
  const earn = Math.floor(bidPrice * shares);
  ch.cash += earn;
  if (existing.shares === shares) {
    db.prepare('DELETE FROM stocks_owned WHERE id = ?').run(existing.id);
  } else {
    db.prepare('UPDATE stocks_owned SET shares = shares - ? WHERE id = ?').run(shares, existing.id);
  }
  const pl = Math.floor((bidPrice - existing.avg_price) * shares);
  writeLog(ch.id, 'stock', `Sold ${shares} ${stock.id} @ £${bidPrice.toFixed(2)} (+£${earn}, P/L £${pl}).`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), earn, pl });
});

export default router;
