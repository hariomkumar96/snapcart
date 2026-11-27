/* Checkout: address + payment form with validation, live order summary,
   then place the order through the API and show the confirmation. */
(async function () {
  await Components.init();
  const area = document.getElementById("checkoutArea");
  const money = Components.money;
  const esc = Components.esc;

  if (!Components.user) {
    area.innerHTML = `<div class="panel center-card" style="text-align:center">
      <h3>Sign in to continue</h3><p class="muted">Please sign in before you check out.</p>
      <a class="btn" href="login.html?next=checkout.html">Sign in</a></div>`;
    return;
  }
  if (!Store.getCart().length) {
    area.innerHTML = `<div class="empty">Your cart is empty. <a href="index.html">Continue shopping</a></div>`;
    return;
  }

  const user = Components.user;
  let summary = null;

  area.innerHTML = `
    <div class="two-col">
      <section class="panel">
        <h3>Delivery address</h3>
        <form id="checkoutForm" class="form" novalidate>
          <div class="form-grid">
            <label class="full"><span>Receiver's full name</span><input class="input" name="full_name" value="${esc(user.name)}"><div class="field-error" data-err="full_name"></div></label>
            <label><span>Mobile number</span><input class="input" name="phone" value="${esc(user.phone)}" placeholder="10-digit mobile"><div class="field-error" data-err="phone"></div></label>
            <label><span>PIN code</span><input class="input" name="pincode" maxlength="6" placeholder="6-digit PIN"><div class="field-error" data-err="pincode"></div></label>
            <label class="full"><span>Address</span><textarea class="input" name="address" rows="3" placeholder="House no., street, area, city"></textarea><div class="field-error" data-err="address"></div></label>
          </div>

          <h3 style="margin-top:22px">Payment method</h3>
          <div class="form-grid">
            <label class="full"><span>Choose how you'd like to pay</span>
              <select class="input" name="payment_method">
                <option value="COD">Cash on Delivery</option>
                <option value="UPI">UPI</option>
              </select>
            </label>
            <label class="full" id="upiBox" style="display:none"><span>UPI ID</span><input class="input" name="upi_id" placeholder="yourname@bank"><div class="field-error" data-err="upi_id"></div></label>
          </div>
          <div class="field-error" data-err="items"></div>
          <div class="field-error" data-err="_form"></div>
          <button class="btn btn-block" type="submit" id="placeBtn" style="margin-top:16px">Place order</button>
        </form>
      </section>

      <aside class="panel" id="orderSummary"><div class="spinner">Calculating…</div></aside>
    </div>`;

  const form = document.getElementById("checkoutForm");
  const payment = form.payment_method;
  payment.onchange = () => {
    document.getElementById("upiBox").style.display = payment.value === "UPI" ? "block" : "none";
  };

  async function loadSummary() {
    try {
      summary = await API.post("/cart/summary", {
        items: Store.getCart().map((x) => ({ product_id: x.id, qty: x.qty })),
        coupon_code: Store.getCoupon(),
      });
      document.getElementById("orderSummary").innerHTML = `
        <h3>Order summary</h3>
        ${summary.items.map((i) => `<div class="summary-row"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.line_total)}</span></div>`).join("")}
        <div class="summary-row"><span>Subtotal</span><span>${money(summary.subtotal)}</span></div>
        <div class="summary-row"><span>Discount${summary.coupon_code ? " (" + esc(summary.coupon_code) + ")" : ""}</span><span class="savings">− ${money(summary.discount)}</span></div>
        <div class="summary-row"><span>Delivery</span><span>${summary.delivery_fee === 0 ? "FREE" : money(summary.delivery_fee)}</span></div>
        <div class="summary-row total"><span>Amount to pay</span><span>${money(summary.total)}</span></div>
        ${summary.stock_issues.map((m) => `<div class="alert" style="margin-top:10px">${esc(m)}</div>`).join("")}
        <a class="link-btn" href="cart.html" style="display:inline-block;margin-top:10px">Edit cart</a>`;
    } catch (e) {
      document.getElementById("orderSummary").innerHTML = `<div class="alert">${esc(e.message)}</div>`;
    }
  }

  function showErrors(errors) {
    form.querySelectorAll("[data-err]").forEach((el) => (el.textContent = ""));
    form.querySelectorAll(".input").forEach((el) => el.classList.remove("invalid"));
    Object.entries(errors).forEach(([field, msg]) => {
      const el = form.querySelector(`[data-err="${field}"]`);
      if (el) el.textContent = msg;
      const input = form.querySelector(`[name="${field}"]`);
      if (input) input.classList.add("invalid");
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("placeBtn");
    const data = Object.fromEntries(new FormData(form).entries());
    // Light client-side checks for quick feedback. The server re-checks everything.
    const local = {};
    if (data.full_name.trim().length < 2) local.full_name = "Enter the receiver's name.";
    if (!/^[6-9]\d{9}$/.test(data.phone.replace(/[\s-]/g, ""))) local.phone = "Enter a valid 10-digit mobile number.";
    if (data.address.trim().length < 10) local.address = "Enter a complete address (at least 10 characters).";
    if (!/^\d{6}$/.test(data.pincode.trim())) local.pincode = "Enter a valid 6-digit PIN code.";
    if (data.payment_method === "UPI" && !/^[\w.\-]{2,256}@[A-Za-z]{2,64}$/.test(data.upi_id.trim())) local.upi_id = "Enter a valid UPI ID, for example name@bank.";
    showErrors(local);
    if (Object.keys(local).length) return;

    btn.disabled = true;
    btn.textContent = "Placing order…";
    try {
      const res = await API.post("/orders", {
        full_name: data.full_name,
        phone: data.phone,
        address: data.address,
        pincode: data.pincode,
        payment_method: data.payment_method,
        upi_id: data.upi_id,
        coupon_code: Store.getCoupon(),
        items: Store.getCart().map((x) => ({ product_id: x.id, qty: x.qty })),
      });
      Store.clearCart();
      Store.setCoupon("");
      showConfirmation(res.order_code, res.total);
    } catch (err) {
      showErrors(err.errors || {});
      document.querySelector('[data-err="_form"]').textContent = err.errors && Object.keys(err.errors).length ? "" : err.message;
      btn.disabled = false;
      btn.textContent = "Place order";
      loadSummary();
    }
  });

  function showConfirmation(code, total) {
    area.innerHTML = `
      <div class="panel center-card" style="text-align:center;padding:34px">
        <div style="font-size:58px">✅</div>
        <h2 style="color:var(--green)">Order placed!</h2>
        <p>Your order <b>${esc(code)}</b> for <b>${money(total)}</b> is confirmed.</p>
        <p class="muted">Track it any time from your orders.</p>
        <div class="form-actions" style="justify-content:center">
          <a class="btn" href="order.html?code=${encodeURIComponent(code)}">Track order</a>
          <a class="btn btn-light" href="index.html">Continue shopping</a>
        </div>
      </div>`;
  }

  loadSummary();
})();
