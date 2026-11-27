/* Cart page. The server prices the cart; this page only displays the result. */
(async function () {
  await Components.init();
  const money = Components.money;
  const esc = Components.esc;
  const $ = (id) => document.getElementById(id);
  let summary = null;

  async function refresh() {
    const cart = Store.getCart();
    $("cartSub").textContent = `${Store.cartCount()} item(s)`;

    if (!cart.length) {
      $("cartItems").innerHTML = `<div class="empty"><div style="font-size:40px">🛒</div><h3>Your cart is empty</h3><p>Add something you love to get started.</p><a class="btn" href="index.html">Continue shopping</a></div>`;
      $("cartSummary").innerHTML = "";
      return;
    }

    try {
      summary = await API.post("/cart/summary", {
        items: cart.map((x) => ({ product_id: x.id, qty: x.qty })),
        coupon_code: Store.getCoupon(),
      });
    } catch (e) {
      $("cartSummary").innerHTML = `<div class="alert">${esc(e.message)}</div>`;
      return;
    }

    if (summary.coupon_code === null && Store.getCoupon()) Store.setCoupon("");

    $("cartItems").innerHTML = summary.items.map((item) => `
      <div class="cart-line">
        <div class="thumb">${esc(item.emoji)}</div>
        <div>
          <a class="name" style="min-height:0;display:block" href="product.html?id=${item.product_id}">${esc(item.name)}</a>
          <div class="muted">${esc(item.brand)} · ${money(item.unit_price)} each</div>
          <div class="qty">
            <button data-step="${item.product_id}" data-n="-1" aria-label="Decrease">−</button>
            <strong>${item.qty}</strong>
            <button data-step="${item.product_id}" data-n="1" aria-label="Increase">+</button>
          </div>
        </div>
        <div style="text-align:right">
          <div class="price" style="margin:0">${money(item.line_total)}</div>
          <button class="link-btn" data-remove="${item.product_id}">Remove</button>
        </div>
      </div>`).join("")
      + (summary.stock_issues.length ? `<div class="alert" style="margin-top:12px">${summary.stock_issues.map(esc).join("<br>")}</div>` : "");

    $("cartSummary").innerHTML = renderSummary();
  }

  function renderSummary() {
    const s = summary;
    const toFree = Math.max(0, s.free_delivery_above - s.subtotal);
    return `
      <h3>Order summary</h3>
      <div class="summary-row"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
      <div class="summary-row"><span>Discount${s.coupon_code ? ` (${esc(s.coupon_code)})` : ""}</span><span class="savings">− ${money(s.discount)}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${s.delivery_fee === 0 ? "<span class='savings'>FREE</span>" : money(s.delivery_fee)}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(s.total)}</span></div>
      <p class="muted">${toFree > 0 ? `Add ${money(toFree)} more for free delivery.` : "You get free delivery on this order."}</p>
      <form id="couponForm" class="form" style="display:flex;gap:8px;margin:14px 0">
        <input class="input" id="couponInput" placeholder="Coupon code (e.g. SNAP10)" value="${esc(s.coupon_code || "")}" style="text-transform:uppercase">
        <button class="btn btn-light" type="submit">Apply</button>
      </form>
      <div class="field-error" id="couponError"></div>
      ${s.coupon_code ? `<button class="link-btn" id="removeCoupon">Remove coupon</button>` : ""}
      <button class="btn btn-block" id="checkoutBtn" style="margin-top:14px">Proceed to checkout →</button>`;
  }

  $("cartItems").addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]");
    const remove = e.target.closest("[data-remove]");
    if (step) {
      const id = Number(step.dataset.step);
      const cur = Store.getCart().find((x) => x.id === id);
      if (cur) {
        const next = cur.qty + Number(step.dataset.n);
        if (next > Store.MAX_QTY) Components.toast(`You can order at most ${Store.MAX_QTY} of one item`, true);
        Store.setQty(id, next);
        refresh();
      }
    }
    if (remove) {
      Store.removeFromCart(Number(remove.dataset.remove));
      Components.toast("Item removed");
      refresh();
    }
  });

  $("cartSummary").addEventListener("click", async (e) => {
    if (e.target.id === "checkoutBtn") {
      location.href = "checkout.html";
    }
    if (e.target.id === "removeCoupon") {
      Store.setCoupon("");
      refresh();
    }
  });

  $("cartSummary").addEventListener("submit", async (e) => {
    if (e.target.id !== "couponForm") return;
    e.preventDefault();
    const code = $("couponInput").value.trim().toUpperCase();
    $("couponError").textContent = "";
    if (!code) { $("couponError").textContent = "Enter a coupon code."; return; }
    try {
      await API.get("/coupons/" + encodeURIComponent(code));
      Store.setCoupon(code);
      Components.toast(`Coupon ${code} applied`);
      refresh();
    } catch (err) {
      $("couponError").textContent = err.message;
    }
  });

  refresh();
})();
