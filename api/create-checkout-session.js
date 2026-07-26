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
  'quick-start-12oz': { name: 'The Quick Start (12oz)', price: 1800 },
  'full-sprint-2lb': { name: 'The Full Sprint (2lb)', price: 4600 },
  'long-haul-5lb': { name: 'The Long Haul (5lb)', price: 9900 },
  'ignition-mug': { name: 'Ignition Mug', price: 2200 },
  'lit-fuse-tee': { name: 'Lit Fuse Tee', price: 3200 },
  'fast-lane-cap': { name: 'Fast Lane Cap', price: 2600 },
  'grab-go-tote': { name: 'Grab & Go Tote', price: 2000 },
  'spark-pack': { name: 'Spark Pack', price: 1000 },
  'pourover-guide': { name: 'Pour-Over Pocket Guide', price: 600 }
};

const TITLES = {
  ccm: 'Certified Construction Manager',
  oe: 'Office Engineer',
  ce: 'Construction Engineer',
  re: 'Resident Engineer',
  pe: 'Professional Engineer',
  idr: "Inspector's Daily Report",
  pmp: 'Project Management Professional',
  pm: 'Project Manager',
  crew: 'Crew',
  eo: 'Equipment Operator',
  heo: 'Heavy Equipment Operator',
  qi: 'Quality Inspector',
  qa: 'Quality Assurance'
};

// Builds the display name Stripe (and your order records/emails) will
// show for a line item, folding in the gender/title variant if present
// — e.g. "Ignition Mug — Certified Construction Manager (Female)".
function lineItemName(product, variant) {
  if (!variant) return product.name;
  const parts = [];
  if (variant.title && TITLES[variant.title]) parts.push(TITLES[variant.title]);
  if (variant.gender) parts.push(variant.gender === 'male' ? 'Male' : 'Female');
  return parts.length ? `${product.name} — ${parts.join(' · ')}` : product.name;
}

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
          product_data: { name: lineItemName(product, item.variant) },
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
