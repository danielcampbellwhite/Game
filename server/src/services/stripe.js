// Stripe Checkout integration for Gold Bar top-ups.
//
// Two deployment modes:
//   1. Configured: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET set.
//      - Players can buy Bars; the webhook credits their balance on
//        the `checkout.session.completed` event.
//   2. Unconfigured: env vars missing.
//      - Stripe SDK never instantiates; the checkout endpoint returns
//        503 and the UI keeps the "Coming soon" buttons. Server still
//        boots normally for everything else.
//
// All money moves on the SERVER side. The client only receives the
// Embedded Checkout `client_secret`, never a price or pack mutation
// path — the catalogue (GOLD_BAR_PACKS) is the source of truth and
// the server resolves the pack at session-creation time so a tampered
// client can't ask for 1,000,000 Bars at £1.

import Stripe from 'stripe';
import { db } from '../db.js';
import { GOLD_BAR_PACKS } from '../data-premium.js';
import { grantGoldBars } from './premium.js';

// Persistent ledger of every Stripe Checkout Session we've started.
// `stripe_session_id` is the natural idempotency key — Stripe webhook
// re-deliveries (Stripe retries failed deliveries) can't double-credit
// because we INSERT OR IGNORE on first fulfilment and bail out if
// already fulfilled.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gold_bar_purchases (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_session_id  TEXT    NOT NULL UNIQUE,
      pack_id            TEXT    NOT NULL,
      bars               INTEGER NOT NULL,
      amount_pence       INTEGER NOT NULL,
      status             TEXT    NOT NULL DEFAULT 'pending',
      created_at         INTEGER NOT NULL,
      fulfilled_at       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_gbp_user ON gold_bar_purchases(user_id);
  `);
} catch {}

let _stripe = null;
let _initAttempted = false;

function getStripe() {
  if (_initAttempted) return _stripe;
  _initAttempted = true;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn('[stripe] STRIPE_SECRET_KEY not set — top-ups disabled.');
    return null;
  }
  _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  return _stripe;
}

export function isStripeConfigured() {
  return !!getStripe() && !!process.env.STRIPE_WEBHOOK_SECRET;
}

// Pack lookup — never trust a client-supplied price.
function packByIdSafe(packId) {
  return GOLD_BAR_PACKS.find(p => p.id === packId) || null;
}

// Create an Embedded Checkout Session for one pack. Returns
// { client_secret, session_id } on success or { error } on failure.
// The session embeds inside the client via @stripe/react-stripe-js;
// payment completes without leaving /premium.
export async function createCheckoutSession(userId, packId, originUrl) {
  const stripe = getStripe();
  if (!stripe) return { error: 'Top-ups are not configured on this server.' };
  const pack = packByIdSafe(packId);
  if (!pack) return { error: 'Unknown pack.' };

  const amountPence = Math.round(pack.priceGBP * 100);
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'gbp',
        product_data: {
          name: `Mafia Life · ${pack.bars} Gold Bars`,
          description: pack.label,
        },
        unit_amount: amountPence,
      },
      quantity: 1,
    }],
    // The redirect/return URL is consulted only after a successful
    // confirmation — for embedded mode it shows in the page. We
    // append the session_id so the client can poll our /checkout-status
    // endpoint to render the final receipt.
    return_url: `${originUrl}/premium?stripe_session_id={CHECKOUT_SESSION_ID}`,
    // The metadata lets us trace the session back to the user without
    // needing a customer object. The webhook reads the same value.
    metadata: { user_id: String(userId), pack_id: pack.id, bars: String(pack.bars) },
  });

  // Record the pending purchase. UNIQUE on stripe_session_id means a
  // retry of this same call (race condition) would error harmlessly.
  db.prepare(`
    INSERT INTO gold_bar_purchases
      (user_id, stripe_session_id, pack_id, bars, amount_pence, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(userId, session.id, pack.id, pack.bars, amountPence, Date.now());

  return { client_secret: session.client_secret, session_id: session.id };
}

// Read-only helper for the client to render a "Thanks, +X Bars" panel
// after the embedded flow completes. Re-reads our local ledger AFTER
// checking with Stripe so we don't surface "paid" until the webhook
// has actually credited the balance.
export async function getCheckoutStatus(sessionId, userId) {
  const stripe = getStripe();
  if (!stripe) return { error: 'Top-ups are not configured on this server.' };
  const row = db.prepare(
    'SELECT * FROM gold_bar_purchases WHERE stripe_session_id = ? AND user_id = ?'
  ).get(sessionId, userId);
  if (!row) return { error: 'Unknown session.' };

  // Cached: once fulfilled we don't need to hit Stripe again.
  if (row.status === 'fulfilled') {
    return { status: 'fulfilled', bars: row.bars, pack_id: row.pack_id };
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return {
    status: row.status,
    payment_status: session.payment_status,
    bars: row.bars,
    pack_id: row.pack_id,
  };
}

// Webhook handler — Stripe POSTs an `event` here. We verify the
// signature, then on `checkout.session.completed` we mark the local
// purchase as fulfilled and grant the Bars. Idempotent: a re-delivery
// of the same event finds status='fulfilled' and is a no-op.
export function handleStripeWebhook(rawBody, signature) {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !whSecret) return { status: 503, body: { error: 'Webhook not configured.' } };

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, whSecret);
  } catch (e) {
    return { status: 400, body: { error: `Signature verification failed: ${e.message}` } };
  }

  if (event.type !== 'checkout.session.completed') {
    return { status: 200, body: { ok: true, ignored: event.type } };
  }

  const session = event.data.object;
  const sessionId = session.id;
  const userId = parseInt(session.metadata?.user_id, 10);
  const bars = parseInt(session.metadata?.bars, 10);

  if (!userId || !bars) {
    return { status: 400, body: { error: 'Webhook missing user_id / bars metadata.' } };
  }
  if (session.payment_status !== 'paid') {
    return { status: 200, body: { ok: true, status: 'unpaid', ignored: true } };
  }

  // Idempotent credit. Wrap in a transaction so the status flip and
  // the balance grant commit together — same pattern as buyPremiumItem.
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(
      'SELECT id, status FROM gold_bar_purchases WHERE stripe_session_id = ?'
    ).get(sessionId);
    if (!row) {
      db.exec('ROLLBACK');
      return { status: 404, body: { error: 'Unknown session in webhook.' } };
    }
    if (row.status === 'fulfilled') {
      db.exec('ROLLBACK');
      return { status: 200, body: { ok: true, already_fulfilled: true } };
    }
    db.prepare(
      `UPDATE gold_bar_purchases SET status = 'fulfilled', fulfilled_at = ? WHERE id = ?`
    ).run(Date.now(), row.id);
    grantGoldBars(userId, bars);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[stripe] fulfilment failed:', e);
    return { status: 500, body: { error: 'Fulfilment failed; will retry on next webhook.' } };
  }

  return { status: 200, body: { ok: true, credited_bars: bars, user_id: userId } };
}
