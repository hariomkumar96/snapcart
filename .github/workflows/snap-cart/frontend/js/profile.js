/* Profile editing and the customer's order history. */
(async function () {
  await Components.init();
  if (!Components.requireUser()) return;
  const esc = Components.esc;
  const money = Components.money;
  const form = document.getElementById("profileForm");

  form.name.value = Components.user.name;
  form.email.value = Components.user.email;
  form.phone.value = Components.user.phone || "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.querySelectorAll("[data-err]").forEach((el) => (el.textContent = ""));
    try {
      await API.put("/auth/profile", { name: form.name.value.trim(), phone: form.phone.value.trim() });
      Components.toast("Profile updated");
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      Object.entries(err.errors || {}).forEach(([k, msg]) => {
        const el = form.querySelector(`[data-err="${k}"]`);
        if (el) el.textContent = msg;
      });
      form.querySelector('[data-err="_form"]').textContent = Object.keys(err.errors || {}).length ? "" : err.message;
    }
  });

  document.getElementById("logoutBtn").onclick = async () => {
    await API.post("/auth/logout");
    location.href = "index.html";
  };

  try {
    const { orders } = await API.get("/orders");
    const box = document.getElementById("orderList");
    if (!orders.length) {
      box.innerHTML = `<div class="empty">No orders yet. <a href="index.html">Start shopping</a></div>`;
      return;
    }
    box.innerHTML = orders.map((o) => `
      <div class="cart-line" style="grid-template-columns:1fr auto">
        <div>
          <b>${esc(o.order_code)}</b> <span class="status ${esc(o.status)}">${esc(o.status)}</span>
          <div class="muted">${esc(o.created_at)} · ${o.items.length} item(s) · ${money(o.total)}</div>
        </div>
        <a class="btn btn-small btn-light" href="order.html?code=${encodeURIComponent(o.order_code)}">Track</a>
      </div>`).join("");
  } catch (err) {
    document.getElementById("orderList").innerHTML = `<div class="alert">${esc(err.message)}</div>`;
  }
})();
