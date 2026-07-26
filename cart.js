// cart.js — shared cart logic for Buttfire Coffee
//
// Cart is stored in localStorage as an array of:
//   { id, quantity, variant: { gender, title } | null }
//
// Some products (mugs, and later caps/tees) come in a gender (male/female)
// and a title (CCM, PMP, etc.). Bags come in gender only. Simple products
// have variant: null. Two cart lines with the same id but different
// variants are kept as separate lines, since they're different physical
// items to produce.
//
// Product names/prices are looked up from CATALOG so both pages agree
// on pricing. The server (api/create-checkout-session.js) has its own
// copy of these prices and is the actual source of truth for what gets
// charged — this client-side copy is only for display.

const CART_KEY = 'buttfire_cart';

// Title options shared by products that offer the abbreviation choice
// (mugs now; caps and tees once their full art sets exist).
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

const CATALOG = {
  'quick-start-12oz': {
    name: 'The Quick Start (12oz)',
    price: 1800,
    hasGender: true,
    previewPath: (variant) => `images/bags/bag-pattern-${variant.gender}.png`
  },
  'full-sprint-2lb': {
    name: 'The Full Sprint (2lb)',
    price: 4600,
    hasGender: true,
    previewPath: (variant) => `images/bags/bag-pattern-${variant.gender}.png`
  },
  'long-haul-5lb': {
    name: 'The Long Haul (5lb)',
    price: 9900,
    hasGender: true,
    previewPath: (variant) => `images/bags/bag-pattern-${variant.gender}.png`
  },
  'ignition-mug': {
    name: 'Ignition Mug',
    price: 2200,
    hasGender: true,
    hasTitle: true,
    titles: TITLES,
    previewPath: (variant) => `images/mugs/wrap-${variant.title}-${variant.gender}.png`
  },
  'lit-fuse-tee': {
    name: 'Lit Fuse Tee',
    price: 3200,
    hasGender: true,
    hasTitle: true,
    titles: TITLES,
    previewPath: (variant) => `images/tees/tee-${variant.title}-${variant.gender}.png`
  },
  'fast-lane-cap': {
    name: 'Fast Lane Cap',
    price: 2600,
    hasGender: true,
    hasTitle: true,
    titles: TITLES,
    previewPath: (variant) => `images/caps/cap-${variant.title}-${variant.gender}.png`
  },
  'grab-go-tote': {
    name: 'Grab & Go Tote',
    price: 2000,
    hasGender: true,
    hasTitle: true,
    titles: TITLES,
    previewPath: (variant) => `images/totes/tote-${variant.title}-${variant.gender}.png`
  },
  'spark-pack': { name: 'Spark Pack', price: 1000 },
  'pourover-guide': { name: 'Pour-Over Pocket Guide', price: 600 }
};

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

// Two lines match only if id AND variant are identical.
function sameVariant(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.gender === b.gender && a.title === b.title;
}

function addToCart(id, qty = 1, variant = null) {
  if (!CATALOG[id]) return;
  const cart = getCart();
  const existing = cart.find((i) => i.id === id && sameVariant(i.variant, variant));
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ id, quantity: qty, variant });
  }
  saveCart(cart);
}

function removeFromCart(id, variant = null) {
  saveCart(getCart().filter((i) => !(i.id === id && sameVariant(i.variant, variant))));
}

function setQuantity(id, qty, variant = null) {
  qty = Math.max(0, Math.floor(qty) || 0);
  if (qty === 0) return removeFromCart(id, variant);
  const cart = getCart();
  const item = cart.find((i) => i.id === id && sameVariant(i.variant, variant));
  if (!item) return;
  item.quantity = qty;
  saveCart(cart);
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

// Returns cart items merged with catalog details (name, price),
// dropping any items whose id no longer exists in the catalog.
// Adds a display-ready `variantLabel` and `previewImage` when applicable.
function cartDetailed() {
  return getCart()
    .filter((i) => CATALOG[i.id])
    .map((i) => {
      const product = CATALOG[i.id];
      const entry = { id: i.id, quantity: i.quantity, variant: i.variant || null, ...product };
      if (i.variant) {
        const genderLabel = i.variant.gender ? (i.variant.gender === 'male' ? 'Male' : 'Female') : '';
        const titleLabel = i.variant.title && product.titles ? product.titles[i.variant.title] : '';
        entry.variantLabel = [titleLabel, genderLabel].filter(Boolean).join(' · ');
        if (product.previewPath) entry.previewImage = product.previewPath(i.variant);
      }
      return entry;
    });
}

function cartSubtotalCents() {
  return cartDetailed().reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function formatUSD(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function updateCartBadge() {
  const count = cartCount();
  document.querySelectorAll('.cart-badge').forEach((el) => {
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
