/* Wishlist page. Items are stored in localStorage and their details come from the API. */
(async function () {
  await Components.init();
  const grid = document.getElementById("wishGrid");
  Components.bindProductActions(grid);

  async function render() {
    const ids = Store.getWishlist();
    document.getElementById("wishSub").textContent = `${ids.length} saved item(s)`;
    if (!ids.length) {
      grid.innerHTML = `<div class="empty"><div style="font-size:40px">♡</div><h3>Your wishlist is empty</h3><p>Tap the heart on any product to save it.</p><a class="btn" href="index.html">Browse products</a></div>`;
      return;
    }
    try {
      const { products } = await API.get("/products");
      const saved = products.filter((p) => ids.includes(p.id));
      grid.innerHTML = saved.map(Components.productCard).join("");
    } catch (err) {
      grid.innerHTML = `<div class="empty">${Components.esc(err.message)}</div>`;
    }
  }

  window.addEventListener("store:changed", () => render());
  render();
})();
