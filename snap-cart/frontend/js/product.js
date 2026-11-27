/* Product detail page with quantity picker and add / buy / wishlist actions. */
(async function () {
  await Components.init();
  const box = document.getElementById("detail");
  const id = Number(Components.param("id"));

  if (!id) {
    box.innerHTML = `<div class="empty">Product not found. <a href="index.html">Back to shop</a></div>`;
    return;
  }

  let product;
  try {
    ({ product } = await API.get("/products/" + id));
  } catch (e) {
    box.innerHTML = `<div class="empty">${Components.esc(e.message)} <br><a href="index.html">Back to shop</a></div>`;
    return;
  }

  const money = Components.money;
  const esc = Components.esc;
  let qty = 1;
  document.title = product.name + " — Snap Cart";

  function render() {
    const wished = Store.isWished(product.id);
    const out = product.stock === 0;
    box.innerHTML = `
      <p class="muted"><a href="index.html?cat=${esc(product.category_slug)}">${esc(product.category)}</a> / ${esc(product.brand)}</p>
      <div class="panel" style="display:grid;grid-template-columns:1fr 1.2fr;gap:28px">
        <div class="photo" style="height:320px;border-radius:13px">
          ${product.image_url ? `<img src="${esc(product.image_url)}" alt="${esc(product.name)}">` : `<span style="font-size:120px">${esc(product.emoji)}</span>`}
        </div>
        <div>
          <div class="brand">${esc(product.brand)}</div>
          <h2 style="margin:6px 0 10px">${esc(product.name)}</h2>
          <div class="rating">★ ${product.rating.toFixed(1)} customer rating</div>
          <div class="price" style="font-size:26px">${money(product.price)} <span class="old">${money(product.original_price)}</span>
            ${product.discount_percent > 0 ? `<span class="savings" style="font-size:15px">${product.discount_percent}% off</span>` : ""}</div>
          <p class="muted" style="margin:14px 0">${esc(product.description)}</p>
          <ul class="muted" style="padding-left:18px;line-height:1.9">
            <li>Free delivery on orders above ₹499</li>
            <li>Easy 7-day returns</li>
            <li>${out ? "Currently out of stock" : `In stock (${product.stock} left)`}</li>
          </ul>
          <div class="qty" style="margin:16px 0">
            <button id="minus" aria-label="Decrease">−</button><strong id="qtyNum">${qty}</strong><button id="plus" aria-label="Increase">+</button>
          </div>
          <div class="form-actions">
            <button class="btn btn-light" id="addBtn" ${out ? "disabled" : ""}>Add to cart</button>
            <button class="btn" id="buyBtn" ${out ? "disabled" : ""}>Buy now</button>
            <button class="btn btn-light" id="wishBtn">${wished ? "♥ Wishlisted" : "♡ Wishlist"}</button>
          </div>
        </div>
      </div>`;

    const setQty = (n) => { qty = Math.max(1, Math.min(Store.MAX_QTY, n)); document.getElementById("qtyNum").textContent = qty; };
    document.getElementById("minus").onclick = () => setQty(qty - 1);
    document.getElementById("plus").onclick = () => setQty(qty + 1);
    document.getElementById("addBtn").onclick = () => { Store.addToCart(product.id, qty); Components.toast(`Added ${qty} to your cart`); };
    document.getElementById("buyBtn").onclick = () => { Store.addToCart(product.id, qty); location.href = "checkout.html"; };
    document.getElementById("wishBtn").onclick = () => { Store.toggleWishlist(product.id); render(); };
  }

  render();
})();
