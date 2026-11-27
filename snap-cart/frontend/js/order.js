/* Order tracking page: progress bar, timeline, items and cancel button. */
(async function () {
  await Components.init();
  if (!Components.requireUser()) return;
  const box = document.getElementById("orderBox");
  const esc = Components.esc;
  const money = Components.money;
  const code = Components.param("code");

  if (!code) {
    box.innerHTML = `<div class="empty">No order selected. <a href="profile.html">View your orders</a></div>`;
    return;
  }

  async function load() {
    let order;
    try {
      ({ order } = await API.get("/orders/" + encodeURIComponent(code)));
    } catch (err) {
      box.innerHTML = `<div class="empty">${esc(err.message)} <br><a href="profile.html">Back to orders</a></div>`;
      return;
    }

    const cancelled = order.status === "Cancelled";
    const reached = order.steps.indexOf(order.status);
    const progress = cancelled ? "" : `
      <div class="progress">${order.steps.map((s, i) =>
        `<div class="${i <= reached ? "done" : ""}">${esc(s)}</div>`).join("")}</div>`;

    box.innerHTML = `
      <div class="section-head">
        <div><h2>Order ${esc(order.order_code)}</h2><div class="sub">Placed on ${esc(order.created_at)}</div></div>
        <span class="status ${esc(order.status)}">${esc(order.status)}</span>
      </div>
      ${progress}
      ${cancelled ? `<div class="alert">This order was cancelled. Any items were returned to stock.</div>` : ""}
      <div class="two-col">
        <section class="panel">
          <h3>Items</h3>
          ${order.items.map((i) => `
            <div class="summary-row"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.line_total)}</span></div>`).join("")}
          <div class="summary-row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
          <div class="summary-row"><span>Discount${order.coupon_code ? " (" + esc(order.coupon_code) + ")" : ""}</span><span class="savings">− ${money(order.discount)}</span></div>
          <div class="summary-row"><span>Delivery</span><span>${order.delivery_fee === 0 ? "FREE" : money(order.delivery_fee)}</span></div>
          <div class="summary-row total"><span>Total</span><span>${money(order.total)}</span></div>
          <p class="muted">Payment: ${order.payment_method === "COD" ? "Cash on Delivery" : "UPI"}</p>
          ${order.can_cancel ? `<button class="btn btn-danger" id="cancelBtn">Cancel order</button>` : ""}
        </section>
        <aside class="panel">
          <h3>Delivering to</h3>
          <p>${esc(order.full_name)}<br>${esc(order.address)}<br>PIN ${esc(order.pincode)}</p>
          <h3 style="margin-top:18px">Timeline</h3>
          <ul class="timeline">
            ${order.timeline.map((t) => `<li><b>${esc(t.status)}</b><br><span class="muted">${esc(t.created_at)} · ${esc(t.note || "")}</span></li>`).join("")}
          </ul>
        </aside>
      </div>`;

    const cancel = document.getElementById("cancelBtn");
    if (cancel) {
      cancel.onclick = async () => {
        if (!confirm("Cancel this order?")) return;
        try {
          await API.post(`/orders/${encodeURIComponent(order.order_code)}/cancel`);
          Components.toast("Order cancelled");
          load();
        } catch (err) {
          Components.toast(err.message, true);
        }
      };
    }
  }

  load();
})();
