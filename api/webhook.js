// api/webhook.js
//
// Stripe calls this endpoint the moment a checkout completes — including
// cases where the customer closes the tab right after paying, so this is
// the reliable source of truth for "did this order actually go through,"
// rather than trusting the browser to redirect to success.html.
//
// This handler does two things on a completed checkout:
//   1. Logs the order (visible in Vercel's function logs)
//   2. Emails a notification to the shop owner via SMTP
//
// IMPORTANT: Stripe signs webhook payloads, and verifying that signature
// requires the RAW request body — not the parsed JSON. That's why body
// parsing is disabled below and the raw body is read manually.

const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const { sql } = require('@vercel/postgres');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Disable Vercel's automatic body parsing so we can access the raw
// request body for Stripe's signature check.
module.exports.config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587/25
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function formatUSD(cents) {
  return '$' + (cents / 100).toFixed(2);
}

async function sendOrderEmail(order) {
  const transport = buildTransport();

  const itemLines = order.items
    .map((i) => `  • ${i.quantity} × ${i.description} — ${formatUSD(i.amount_total)}`)
    .join('\n');

  const shipping = order.shippingAddress
    ? `\nShipping to:\n  ${order.shippingAddress.name || ''}\n  ${[
        order.shippingAddress.line1,
        order.shippingAddress.line2,
        order.shippingAddress.city,
        order.shippingAddress.state,
        order.shippingAddress.postal_code,
        order.shippingAddress.country
      ]
        .filter(Boolean)
        .join(', ')}\n`
    : '';

  const text = `New order on Buttfire Coffee

Order ref: ${order.sessionId}
Customer: ${order.customerEmail || 'unknown'}

Items:
${itemLines}

Total: ${formatUSD(order.amountTotal)}
${shipping}
View full details in Stripe: https://dashboard.stripe.com/payments`;

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: `New order — ${formatUSD(order.amountTotal)} (${order.customerEmail || 'no email'})`,
    text
  });
}

async function saveOrder(order) {
  await sql`
    INSERT INTO orders (session_id, customer_email, amount_total, currency, items, shipping_address)
    VALUES (
      ${order.sessionId},
      ${order.customerEmail},
      ${order.amountTotal},
      ${order.currency},
      ${JSON.stringify(order.items)}::jsonb,
      ${order.shippingAddress ? JSON.stringify(order.shippingAddress) : null}::jsonb
    )
    ON CONFLICT (session_id) DO NOTHING
  `;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Only act on completed checkouts; acknowledge everything else so
  // Stripe doesn't keep retrying events we don't care about.
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  try {
    const session = event.data.object;

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100
    });

    const order = {
      sessionId: session.id,
      customerEmail: session.customer_details ? session.customer_details.email : session.customer_email,
      amountTotal: session.amount_total,
      currency: session.currency,
      shippingAddress: session.shipping_details ? session.shipping_details.address : null,
      items: lineItems.data.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        amount_total: li.amount_total
      })),
      createdAt: new Date().toISOString()
    };

    // 1. Log the order. Visible in Vercel's dashboard under
    //    Project → Logs (or `vercel logs` from the CLI).
    console.log('ORDER_COMPLETED', JSON.stringify(order));

    // 2. Persist to Postgres — the permanent, queryable record.
    //    ON CONFLICT DO NOTHING makes this safe if Stripe retries the event.
    if (process.env.POSTGRES_URL) {
      await saveOrder(order);
    } else {
      console.warn('Order not saved to database: POSTGRES_URL not configured');
    }

    // 3. Email notification
    if (process.env.SMTP_HOST && process.env.NOTIFY_EMAIL) {
      await sendOrderEmail(order);
    } else {
      console.warn('Email not sent: SMTP_HOST or NOTIFY_EMAIL not configured');
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error processing webhook:', err);
    // Still return 200 so Stripe doesn't endlessly retry an event that
    // failed for a reason on our end (e.g. email misconfigured) after
    // we've already logged it — the order itself did go through.
    return res.status(200).json({ received: true, processingError: err.message });
  }
};
