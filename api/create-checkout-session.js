// api/create-checkout-session.js
//
// Vercel serverless function. Lives at /api/create-checkout-session
// once deployed. Creates a Stripe-hosted Checkout Session and hands
// the client back a URL to redirect to. No card data ever touches
// this server — Stripe's page handles that, which keeps you out of
// PCI-DSS scope.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Fallback catalog, keyed by the same product ids used in cart.js.
// In production you'd look these up from a real product database, but
// for a small shop hardcoding prices here (in cents) is perfectly sane
// and safer than trusting a price sent from the browser.
const CATALOG = {
  'ethiopian-12oz': { name: 'Ethiopian Buttfire Roast (12oz)', price: 1800 },
  'costa-rican-12oz': { name: 'Costa Rican Buttfire Roast (12oz)', price: 1800 },
  'buttfire-mug': { name: 'Buttfire Mug', price: 2200 }
};

module.exports = async (req, res) => {
  // CORS + method guard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, email } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    const line_items = items.map((item) => {
      const product = CATALOG[item.id];
      if (!product) {
        throw new Error(`Unknown product: ${item.id}`);
      }
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: product.price
        },
        quantity: item.quantity || 1
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      customer_email: email || undefined,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      success_url: `${process.env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/checkout.html`
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Something went wrong' });
  }
};
