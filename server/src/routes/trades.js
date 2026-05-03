import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import {
  TRADE_TAX_PCT, TRADE_IDLE_TTL_MS, TRADE_MAX_ITEMS_PER_SIDE, TRADE_CHAT_MAX,
  miscItemById, weaponById, armourById, ammoById, drugById, cityById,
} from '../data.js';
import { saveCharacter, publicCharacter, loadCharacterById } from '../services/character.js';
import { sendEvent } from '../services/events.js';
import { writeLog } from '../services/log.js';

const router = Router();

//  Constants 
const SELLABLE_KINDS = new Set(['misc', 'weapon', 'armour', 'ammo', 'drug']);

//  Helpers 
function emptyOffer() { return { items: [], cash: 0 }; }
function parseOffer(json) {
  try {
    const o = JSON.parse(json || '{}');
    return {
      items: Array.isArray(o.items) ? o.items : [],
      cash: Math.max(0, parseInt(o.cash, 10) || 0),
    };
  } catch { return emptyOffer(); }
}
function lookupItem(kind, itemId) {
  if (kind === 'misc')   { const m = miscItemById(itemId);   return m ? { name: m.name, emoji: m.emoji || '' } : null; }
  if (kind === 'weapon') { const w = weaponById(itemId);     return w ? { name: w.name, emoji: '' } : null; }
  if (kind === 'armour') { const a = armourById(itemId);     return a ? { name: a.name, emoji: '' } : null; }
  if (kind === 'ammo')   { const a = ammoById(itemId);       return a ? { name: a.name, emoji: '' } : null; }
  if (kind === 'drug')   { const d = drugById(itemId);       return d ? { name: d.name, emoji: '' } : null; }
  return null;
}
function decorateOfferItems(items) {
  return items.map(i => {
    const meta = lookupItem(i.kind, i.item_id);
    return {
      kind: i.kind,
      item_id: i.item_id,
      qty: i.qty,
      name: meta?.name || i.item_id,
      emoji: meta?.emoji || '',
    };
  });
}
function loadTradeById(id) {
  return db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
}
function side(trade, charId) {
  if (trade.initiator_id === charId) return 'initiator';
  if (trade.recipient_id === charId) return 'recipient';
  return null;
}
function otherId(trade, charId) {
  return trade.initiator_id === charId ? trade.recipient_id : trade.initiator_id;
}
function publicProfileLite(c) {
  return c ? { id: c.id, name: c.name, avatar: c.avatar, level: c.level } : null;
}
function publicTrade(trade, viewerId) {
  const initiator = loadCharacterById(trade.initiator_id);
  const recipient = loadCharacterById(trade.recipient_id);
  const initOffer = parseOffer(trade.initiator_offer_json);
  const recipOffer = parseOffer(trade.recipient_offer_json);
  return {
    id: trade.id,
    status: trade.status,
    created_at: trade.created_at,
    last_active_at: trade.last_active_at,
    ended_at: trade.ended_at,
    expires_at: trade.last_active_at + TRADE_IDLE_TTL_MS,
    initiator: publicProfileLite(initiator),
    recipient: publicProfileLite(recipient),
    initiator_offer: { items: decorateOfferItems(initOffer.items), cash: initOffer.cash },
    recipient_offer: { items: decorateOfferItems(recipOffer.items), cash: recipOffer.cash },
    initiator_confirmed: !!trade.initiator_confirmed,
    recipient_confirmed: !!trade.recipient_confirmed,
    your_side: side(trade, viewerId),
  };
}

// Lazy-expire any active/pending trades whose idle TTL has lapsed.
// Anyone touching the trades surface triggers the sweep so we don't
// need a cron.
function expireIdleTrades(now) {
  const cutoff = now - TRADE_IDLE_TTL_MS;
  const stale = db.prepare(`
    SELECT * FROM trades WHERE status IN ('pending', 'active') AND last_active_at < ?
  `).all(cutoff);
  for (const t of stale) {
    db.prepare(`UPDATE trades SET status = 'expired', ended_at = ? WHERE id = ?`).run(now, t.id);
    sendEvent(t.initiator_id, 'trade.cancelled', { trade_id: t.id, reason: 'expired' });
    sendEvent(t.recipient_id, 'trade.cancelled', { trade_id: t.id, reason: 'expired' });
  }
  return stale.length;
}

function bumpLastActive(tradeId, now) {
  db.prepare('UPDATE trades SET last_active_at = ? WHERE id = ?').run(now, tradeId);
}

// Validate an offer's items against the offerer's current inventory and
// each catalogue lookup. Returns { ok: false, error } or { ok: true }.
function validateOffer(offer, ownerId, ownerCash) {
  if (!Number.isFinite(offer.cash) || offer.cash < 0) {
    return { ok: false, error: 'Bad cash amount.' };
  }
  if (offer.cash > ownerCash) {
    return { ok: false, error: `Offer requires £${offer.cash.toLocaleString()} but you only have £${ownerCash.toLocaleString()}.` };
  }
  if (!Array.isArray(offer.items)) return { ok: false, error: 'Bad items list.' };
  if (offer.items.length > TRADE_MAX_ITEMS_PER_SIDE) {
    return { ok: false, error: `Max ${TRADE_MAX_ITEMS_PER_SIDE} item lines per side.` };
  }
  // Sum required qty per (kind, item_id) so the same item across multiple
  // entries gets validated against total ownership, not per-entry.
  const need = new Map();
  for (const it of offer.items) {
    if (!SELLABLE_KINDS.has(it.kind)) return { ok: false, error: `Items of kind "${it.kind}" can't be traded.` };
    if (!lookupItem(it.kind, it.item_id)) return { ok: false, error: `Unknown ${it.kind}: ${it.item_id}.` };
    const qty = parseInt(it.qty, 10);
    if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: 'Item qty must be ≥1.' };
    const key = `${it.kind}|${it.item_id}`;
    need.set(key, (need.get(key) || 0) + qty);
  }
  for (const [key, qtyNeeded] of need) {
    const [kind, item_id] = key.split('|');
    const have = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(ownerId, kind, item_id);
    if (!have || have.qty < qtyNeeded) {
      const meta = lookupItem(kind, item_id);
      return { ok: false, error: `You only have ${have?.qty || 0} of ${meta?.name || item_id}, offered ${qtyNeeded}.` };
    }
  }
  return { ok: true };
}

// Atomically apply both offers. Caller has verified status='active' and
// both confirmation locks. We re-validate inventory + cash inside this
// SQL transaction so a concurrent inventory change between confirm and
// complete cleanly aborts.
function executeSwap(trade) {
  const init = loadCharacterById(trade.initiator_id);
  const recip = loadCharacterById(trade.recipient_id);
  if (!init || !recip) return { ok: false, error: 'A party has vanished.' };

  const initOffer = parseOffer(trade.initiator_offer_json);
  const recipOffer = parseOffer(trade.recipient_offer_json);

  // Re-validate.
  const v1 = validateOffer(initOffer, init.id, init.cash);
  if (!v1.ok) return { ok: false, error: `Initiator offer failed: ${v1.error}` };
  const v2 = validateOffer(recipOffer, recip.id, recip.cash);
  if (!v2.ok) return { ok: false, error: `Recipient offer failed: ${v2.error}` };

  // Tax: 5% of cash flowing in each direction.
  const initTax = Math.floor(initOffer.cash * TRADE_TAX_PCT);
  const recipTax = Math.floor(recipOffer.cash * TRADE_TAX_PCT);
  const recipReceivesCash = initOffer.cash - initTax;   // cash A→B
  const initReceivesCash  = recipOffer.cash - recipTax; // cash B→A

  db.exec('BEGIN');
  try {
    // Decrement inventories on both sides.
    for (const it of initOffer.items) {
      const row = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(init.id, it.kind, it.item_id);
      if (!row || row.qty < it.qty) throw new Error('initiator inventory drift');
      if (row.qty === it.qty) {
        db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').run(init.id, it.kind, it.item_id);
      } else {
        db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?').run(it.qty, init.id, it.kind, it.item_id);
      }
    }
    for (const it of recipOffer.items) {
      const row = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(recip.id, it.kind, it.item_id);
      if (!row || row.qty < it.qty) throw new Error('recipient inventory drift');
      if (row.qty === it.qty) {
        db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').run(recip.id, it.kind, it.item_id);
      } else {
        db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?').run(it.qty, recip.id, it.kind, it.item_id);
      }
    }
    // Cash debits.
    init.cash  -= initOffer.cash;
    recip.cash -= recipOffer.cash;
    // Cross items.
    for (const it of initOffer.items) {
      db.prepare(`
        INSERT INTO inventory (char_id, kind, item_id, qty)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
      `).run(recip.id, it.kind, it.item_id, it.qty);
    }
    for (const it of recipOffer.items) {
      db.prepare(`
        INSERT INTO inventory (char_id, kind, item_id, qty)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
      `).run(init.id, it.kind, it.item_id, it.qty);
    }
    // Cross cash (post-tax).
    recip.cash += recipReceivesCash;
    init.cash  += initReceivesCash;

    saveCharacter(init);
    saveCharacter(recip);

    // Auto-unequip if either side traded away their last copy of a
    // currently equipped weapon or armour.
    for (const ch of [init, recip]) {
      if (ch.equipped_weapon && ch.equipped_weapon !== 'fists') {
        const have = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").get(ch.id, ch.equipped_weapon);
        if (!have || have.qty <= 0) {
          ch.equipped_weapon = 'fists';
          saveCharacter(ch);
        }
      }
      if (ch.equipped_armour && ch.equipped_armour !== 'none') {
        const have = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'armour' AND item_id = ?").get(ch.id, ch.equipped_armour);
        if (!have || have.qty <= 0) {
          ch.equipped_armour = 'none';
          saveCharacter(ch);
        }
      }
    }

    db.prepare(`UPDATE trades SET status = 'completed', ended_at = ? WHERE id = ?`).run(Date.now(), trade.id);
    db.exec('COMMIT');
    return { ok: true, initTax, recipTax, initReceivesCash, recipReceivesCash };
  } catch (e) {
    db.exec('ROLLBACK');
    return { ok: false, error: 'Trade failed during commit — inventory or cash changed under us. Try again.' };
  }
}

//  Routes 

// GET /api/trades — list active and recent trades for the caller.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  expireIdleTrades(Date.now());
  const ch = req.character;
  const rows = db.prepare(`
    SELECT * FROM trades
    WHERE (initiator_id = ? OR recipient_id = ?)
      AND status IN ('pending', 'active')
    ORDER BY last_active_at DESC
    LIMIT 20
  `).all(ch.id, ch.id);
  res.json({ trades: rows.map(r => publicTrade(r, ch.id)) });
});

// GET /api/trades/:id — full trade state for the participants.
router.get('/:id', requireAuth, requireCharacter, (req, res) => {
  expireIdleTrades(Date.now());
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  if (!side(trade, req.character.id)) return res.status(403).json({ error: 'Not your trade.' });
  const messages = db.prepare(
    'SELECT id, sender_id, body, created_at FROM trade_messages WHERE trade_id = ? ORDER BY id ASC LIMIT 200'
  ).all(id);
  res.json({ trade: publicTrade(trade, req.character.id), messages });
});

// POST /api/trades — initiate a trade (creates 'pending' row).
router.post('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.body?.target_id, 10);
  if (!Number.isFinite(targetId) || targetId === ch.id) {
    return res.status(400).json({ error: 'Pick a player to trade with.' });
  }
  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Player not found.' });
  if (target.city !== ch.city) {
    return res.status(400).json({ error: `You must both be in ${cityById(ch.city)?.name} to trade.` });
  }

  // Block while in jail / hospital / travelling.
  const now = Date.now();
  for (const [c, label] of [[ch, 'You'], [target, 'They']]) {
    if (c.jail_until && c.jail_until > now) return res.status(400).json({ error: `${label}'re in jail.` });
    if (c.hospital_until && c.hospital_until > now) return res.status(400).json({ error: `${label}'re in hospital.` });
    if (c.travel_until && c.travel_until > now) return res.status(400).json({ error: `${label}'re travelling.` });
  }

  // One active/pending trade per character (either side).
  expireIdleTrades(now);
  const existing = db.prepare(`
    SELECT id FROM trades
    WHERE status IN ('pending', 'active')
      AND (initiator_id IN (?, ?) OR recipient_id IN (?, ?))
    LIMIT 1
  `).get(ch.id, targetId, ch.id, targetId);
  if (existing) {
    return res.status(409).json({ error: 'One of you is already in another trade.' });
  }

  const result = db.prepare(`
    INSERT INTO trades (initiator_id, recipient_id, status, created_at, last_active_at)
    VALUES (?, ?, 'pending', ?, ?)
  `).run(ch.id, targetId, now, now);

  writeLog(target.id, 'trade', `${ch.avatar} ${ch.name} wants to trade with you.`, { trade_id: result.lastInsertRowid }, true);
  sendEvent(target.id, 'trade.requested', { trade_id: result.lastInsertRowid, from: { id: ch.id, name: ch.name, avatar: ch.avatar } });

  const trade = loadTradeById(result.lastInsertRowid);
  res.json({ ok: true, trade: publicTrade(trade, ch.id) });
});

// POST /api/trades/:id/accept — recipient accepts.
router.post('/:id/accept', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  if (trade.recipient_id !== ch.id) return res.status(403).json({ error: 'Not your invitation.' });
  if (trade.status !== 'pending') return res.status(409).json({ error: 'Trade already past pending.' });
  const now = Date.now();
  db.prepare(`UPDATE trades SET status = 'active', last_active_at = ? WHERE id = ?`).run(now, id);

  sendEvent(trade.initiator_id, 'trade.accepted', { trade_id: id });
  res.json({ ok: true, trade: publicTrade(loadTradeById(id), ch.id) });
});

// POST /api/trades/:id/decline — recipient declines (or initiator cancels pending).
router.post('/:id/decline', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  if (!side(trade, ch.id)) return res.status(403).json({ error: 'Not your trade.' });
  if (trade.status !== 'pending') return res.status(409).json({ error: 'Trade is no longer pending.' });
  const now = Date.now();
  db.prepare(`UPDATE trades SET status = 'cancelled', ended_at = ? WHERE id = ?`).run(now, id);
  sendEvent(otherId(trade, ch.id), 'trade.cancelled', { trade_id: id, reason: 'declined' });
  res.json({ ok: true });
});

// POST /api/trades/:id/cancel — either side cancels an active trade.
router.post('/:id/cancel', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  if (!side(trade, ch.id)) return res.status(403).json({ error: 'Not your trade.' });
  if (trade.status !== 'active' && trade.status !== 'pending') {
    return res.status(409).json({ error: 'Trade is no longer active.' });
  }
  const now = Date.now();
  db.prepare(`UPDATE trades SET status = 'cancelled', ended_at = ? WHERE id = ?`).run(now, id);
  sendEvent(otherId(trade, ch.id), 'trade.cancelled', { trade_id: id, reason: 'cancelled' });
  res.json({ ok: true });
});

// POST /api/trades/:id/offer — set my side's items + cash.
//
// Editing your own offer always resets BOTH confirmation locks — keeps
// the other player from getting tricked by a swap right before commit.
router.post('/:id/offer', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  const mySide = side(trade, ch.id);
  if (!mySide) return res.status(403).json({ error: 'Not your trade.' });
  if (trade.status !== 'active') return res.status(409).json({ error: 'Trade is not active.' });

  const newOffer = {
    items: Array.isArray(req.body?.items) ? req.body.items : [],
    cash: Math.max(0, parseInt(req.body?.cash, 10) || 0),
  };
  const v = validateOffer(newOffer, ch.id, ch.cash);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const now = Date.now();
  if (mySide === 'initiator') {
    db.prepare(`
      UPDATE trades
      SET initiator_offer_json = ?, initiator_confirmed = 0, recipient_confirmed = 0, last_active_at = ?
      WHERE id = ?
    `).run(JSON.stringify(newOffer), now, id);
  } else {
    db.prepare(`
      UPDATE trades
      SET recipient_offer_json = ?, initiator_confirmed = 0, recipient_confirmed = 0, last_active_at = ?
      WHERE id = ?
    `).run(JSON.stringify(newOffer), now, id);
  }
  sendEvent(otherId(trade, ch.id), 'trade.updated', { trade_id: id });
  res.json({ ok: true, trade: publicTrade(loadTradeById(id), ch.id) });
});

// POST /api/trades/:id/confirm — lock my side. Other side must
// independently re-confirm. /complete then commits the swap.
router.post('/:id/confirm', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  const mySide = side(trade, ch.id);
  if (!mySide) return res.status(403).json({ error: 'Not your trade.' });
  if (trade.status !== 'active') return res.status(409).json({ error: 'Trade is not active.' });

  // Validate at confirm time too (early failure beats late at /complete).
  const myOffer = parseOffer(mySide === 'initiator' ? trade.initiator_offer_json : trade.recipient_offer_json);
  const v = validateOffer(myOffer, ch.id, ch.cash);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const col = mySide === 'initiator' ? 'initiator_confirmed' : 'recipient_confirmed';
  const now = Date.now();
  db.prepare(`UPDATE trades SET ${col} = 1, last_active_at = ? WHERE id = ?`).run(now, id);
  sendEvent(otherId(trade, ch.id), 'trade.updated', { trade_id: id });
  res.json({ ok: true, trade: publicTrade(loadTradeById(id), ch.id) });
});

// POST /api/trades/:id/unconfirm — release my own lock.
router.post('/:id/unconfirm', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  const mySide = side(trade, ch.id);
  if (!mySide) return res.status(403).json({ error: 'Not your trade.' });
  if (trade.status !== 'active') return res.status(409).json({ error: 'Trade is not active.' });
  const col = mySide === 'initiator' ? 'initiator_confirmed' : 'recipient_confirmed';
  db.prepare(`UPDATE trades SET ${col} = 0, last_active_at = ? WHERE id = ?`).run(Date.now(), id);
  sendEvent(otherId(trade, ch.id), 'trade.updated', { trade_id: id });
  res.json({ ok: true, trade: publicTrade(loadTradeById(id), ch.id) });
});

// POST /api/trades/:id/complete — atomic commit.
router.post('/:id/complete', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  if (!side(trade, ch.id)) return res.status(403).json({ error: 'Not your trade.' });
  if (trade.status !== 'active') return res.status(409).json({ error: 'Trade is not active.' });
  if (!trade.initiator_confirmed || !trade.recipient_confirmed) {
    return res.status(409).json({ error: 'Both sides must confirm before completing.' });
  }

  const result = executeSwap(trade);
  if (!result.ok) {
    // Reset confirms so both sides can adjust without cancelling.
    db.prepare(`
      UPDATE trades SET initiator_confirmed = 0, recipient_confirmed = 0, last_active_at = ?
      WHERE id = ?
    `).run(Date.now(), id);
    sendEvent(otherId(trade, ch.id), 'trade.updated', { trade_id: id, error: result.error });
    return res.status(409).json({ error: result.error });
  }

  // Log + push both sides.
  writeLog(
    trade.initiator_id,
    'trade',
    ` Trade with ${loadCharacterById(trade.recipient_id)?.name} completed. Cash in: £${result.initReceivesCash.toLocaleString()} · paid £${(parseOffer(trade.initiator_offer_json).cash - result.initTax).toLocaleString()}+£${result.initTax} tax.`,
    { trade_id: id },
    true,
  );
  writeLog(
    trade.recipient_id,
    'trade',
    ` Trade with ${loadCharacterById(trade.initiator_id)?.name} completed. Cash in: £${result.recipReceivesCash.toLocaleString()} · paid £${(parseOffer(trade.recipient_offer_json).cash - result.recipTax).toLocaleString()}+£${result.recipTax} tax.`,
    { trade_id: id },
    true,
  );
  sendEvent(trade.initiator_id, 'trade.completed', { trade_id: id });
  sendEvent(trade.recipient_id, 'trade.completed', { trade_id: id });

  const fresh = loadTradeById(id);
  res.json({
    ok: true,
    trade: publicTrade(fresh, ch.id),
    character: publicCharacter(loadCharacterById(ch.id)),
  });
});

// POST /api/trades/:id/messages — send a chat message.
router.post('/:id/messages', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const trade = loadTradeById(id);
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  if (!side(trade, ch.id)) return res.status(403).json({ error: 'Not your trade.' });
  if (trade.status !== 'active' && trade.status !== 'pending') {
    return res.status(409).json({ error: 'Trade is no longer active.' });
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Empty message.' });
  if (body.length > TRADE_CHAT_MAX) return res.status(400).json({ error: `Max ${TRADE_CHAT_MAX} characters.` });
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO trade_messages (trade_id, sender_id, body, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, ch.id, body, now);
  bumpLastActive(id, now);
  sendEvent(otherId(trade, ch.id), 'trade.message', { trade_id: id, message_id: result.lastInsertRowid });
  res.json({ ok: true, message: { id: result.lastInsertRowid, sender_id: ch.id, body, created_at: now } });
});

export default router;
