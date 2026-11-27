/* Cart and wishlist kept in localStorage. Prices are never stored here:
   the server calculates every total from the product IDs and quantities. */
const Store = (() => {
  const CART_KEY = "snapcart.cart";
  const WISH_KEY = "snapcart.wishlist";
  const COUPON_KEY = "snapcart.coupon";
  const MAX_QTY = 10;

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  };
  const emit = () => window.dispatchEvent(new Event("store:changed"));

  function getCart() { return read(CART_KEY, []); }
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    emit();
  }
  function addToCart(productId, qty = 1) {
    const cart = getCart();
    const item = cart.find((x) => x.id === productId);
    if (item) item.qty = Math.min(item.qty + qty, MAX_QTY);
    else cart.push({ id: productId, qty: Math.min(qty, MAX_QTY) });
    saveCart(cart);
  }
  function setQty(productId, qty) {
    let cart = getCart();
    if (qty < 1) cart = cart.filter((x) => x.id !== productId);
    else cart.forEach((x) => { if (x.id === productId) x.qty = Math.min(qty, MAX_QTY); });
    saveCart(cart);
  }
  function removeFromCart(productId) {
    saveCart(getCart().filter((x) => x.id !== productId));
  }
  function clearCart() { saveCart([]); }
  function cartCount() { return getCart().reduce((sum, x) => sum + x.qty, 0); }

  function getWishlist() { return read(WISH_KEY, []); }
  function isWished(productId) { return getWishlist().includes(productId); }
  function toggleWishlist(productId) {
    const list = getWishlist();
    const next = list.includes(productId) ? list.filter((x) => x !== productId) : [...list, productId];
    localStorage.setItem(WISH_KEY, JSON.stringify(next));
    emit();
    return next.includes(productId);
  }

  function getCoupon() { return localStorage.getItem(COUPON_KEY) || ""; }
  function setCoupon(code) {
    if (code) localStorage.setItem(COUPON_KEY, code);
    else localStorage.removeItem(COUPON_KEY);
  }

  return {
    MAX_QTY, getCart, saveCart, addToCart, setQty, removeFromCart, clearCart, cartCount,
    getWishlist, isWished, toggleWishlist, getCoupon, setCoupon,
  };
})();
