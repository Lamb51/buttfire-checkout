// cart.js — shared cart logic for Buttfire Coffee
//
// Cart is stored in localStorage as an array of:
//   { id, quantity, variant: null }
//
// The catalog is intentionally simple: two 12oz coffee roasts and one
// mug, none of which have size/color/title options anymore.
//
// Product names/prices are looked up from CATALOG so both pages agree
// on pricing. The server (api/create-checkout-session.js) has its own
// copy of these prices and is the actual source of truth for what gets
// charged — this client-side copy is only for display.

const CART_KEY = 'buttfire_cart';

const CATALOG = {
  'ethiopian-12oz': { name: 'Ethiopian Buttfire Roast (12oz)', price: 1800 },
  'costa-rican-12oz': { name: 'Costa Rican Buttfire Roast (12oz)', price: 1800 },
  'buttfire-mug': { name: 'Buttfire Mug', price: 2200 }
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
function cartDetailed() {
  return getCart()
    .filter((i) => CATALOG[i.id])
    .map((i) => {
      const product = CATALOG[i.id];
      return { id: i.id, quantity: i.quantity, variant: i.variant || null, ...product };
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
