// cart.js — shared cart logic for Buttfire Coffee
//
// Cart is stored in localStorage as an array of { id, quantity }.
// Product names/prices are looked up from CATALOG so both pages agree
// on pricing. The server (api/create-checkout-session.js) has its own
// copy of these prices and is the actual source of truth for what gets
// charged — this client-side copy is only for display.

const CART_KEY = 'buttfire_cart';

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

function addToCart(id, qty = 1) {
  if (!CATALOG[id]) return;
  const cart = getCart();
  const existing = cart.find((i) => i.id === id);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ id, quantity: qty });
  }
  saveCart(cart);
}

function removeFromCart(id) {
  saveCart(getCart().filter((i) => i.id !== id));
}

function setQuantity(id, qty) {
  qty = Math.max(0, Math.floor(qty) || 0);
  if (qty === 0) return removeFromCart(id);
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
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
function cartDetailed() {
  return getCart()
    .filter((i) => CATALOG[i.id])
    .map((i) => ({ id: i.id, quantity: i.quantity, ...CATALOG[i.id] }));
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
