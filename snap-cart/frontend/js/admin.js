/* Admin dashboard: stats and charts, product/category management, orders, customers. */
(async function () {
  await Components.init();
  if (!Components.requireUser({ admin: true })) return;

  const $ = (id) => document.getElementById(id);
  const esc = Components.esc;
  const money = Components.money;
  const STATUSES = ["Placed", "Packed", "Shipped", "Out for Delivery", "Delivered", "Cancelled"];
  let categories = [];
  let charts = {};

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll("[id^='tab-']").forEach((s) => (s.hidden = s.id !== "tab-" + tab.dataset.tab));
      loaders[tab.dataset.tab]();
    };
  });

  // ---------- Dashboard ----------
  async function loadDashboard() {
    const d = await API.get("/admin/dashboard");
    const s = d.stats;
    $("statCards").innerHTML = [
      ["Total sales", money(s.total_sales)],
      ["Orders", s.total_orders],
      ["Pending (placed)", s.pending_orders],
      ["Customers", s.customers],
    ].map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("");

    const make = (key, id, config) => {
      if (charts[key]) charts[key].destroy();
      charts[key] = new Chart($(id), config);
    };
    make("sales", "salesChart", {
      type: "line",
      data: {
        labels: d.daily_sales.map((x) => x.day),
        datasets: [{ label: "Sales (₹)", data: d.daily_sales.map((x) => x.sales), borderColor: "#2457d6", backgroundColor: "#2457d620", fill: true, tension: 0.3 }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
    make("category", "categoryChart", {
      type: "doughnut",
      data: {
        labels: d.sales_by_category.map((x) => x.category),
        datasets: [{ data: d.sales_by_category.map((x) => x.sales), backgroundColor: ["#2457d6", "#ff9d25", "#159b62", "#e54865", "#7c3aed", "#0ea5e9", "#84cc16"] }],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });
    make("status", "statusChart", {
      type: "bar",
      data: {
        labels: d.orders_by_status.map((x) => x.status),
        datasets: [{ label: "Orders", data: d.orders_by_status.map((x) => x.count), backgroundColor: "#2457d6" }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  // ---------- Categories ----------
  async function loadCategories() {
    const res = await API.get("/admin/categories");
    categories = res.categories;
    $("categoryRows").innerHTML = categories.map((c) => `
      <tr>
        <td style="font-size:20px">${esc(c.icon)}</td>
        <td><b>${esc(c.name)}</b></td>
        <td>${c.product_count}</td>
        <td><button class="link-btn" data-del-cat="${c.id}">Delete</button></td>
      </tr>`).join("") || `<tr><td colspan="4" class="muted">No categories yet.</td></tr>`;
    const select = document.querySelector('#productForm select[name="category_id"]');
    select.innerHTML = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  }

  $("categoryRows").addEventListener("click", async (e) => {
    const id = e.target.dataset.delCat;
    if (!id || !confirm("Delete this category?")) return;
    try {
      await API.del("/admin/categories/" + id);
      Components.toast("Category deleted");
      loadCategories();
    } catch (err) { Components.toast(err.message, true); }
  });

  const categoryForm = $("categoryForm");
  categoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = categoryForm.name.value.trim();
    const errBox = categoryForm.querySelector('[data-err="name"]');
    errBox.textContent = "";
    if (name.length < 2) { errBox.textContent = "Enter at least 2 characters."; return; }
    try {
      await API.post("/admin/categories", { name, icon: categoryForm.icon.value.trim() });
      categoryForm.reset();
      categoryForm.querySelector('[data-err="_form"]').textContent = "";
      Components.toast("Category added");
      loadCategories();
    } catch (err) {
      categoryForm.querySelector('[data-err="_form"]').textContent = err.message;
    }
  });

  // ---------- Products ----------
  let products = [];
  async function loadProducts() {
    if (!categories.length) await loadCategories();
    const res = await API.get("/admin/products");
    products = res.products;
    $("productRows").innerHTML = products.map((p) => `
      <tr>
        <td><span style="font-size:18px">${esc(p.emoji)}</span> <b>${esc(p.name)}</b><div class="muted">${esc(p.brand)}</div></td>
        <td>${esc(p.category)}</td>
        <td>${money(p.price)} <span class="muted"><s>${money(p.original_price)}</s></span></td>
        <td>${p.discount_percent}%</td>
        <td>${p.stock}</td>
        <td>${p.rating.toFixed(1)}★</td>
        <td style="white-space:nowrap">
          <button class="btn btn-small btn-light" data-edit="${p.id}">Edit</button>
          <button class="btn btn-small btn-danger" data-delete="${p.id}">Delete</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted">No products yet.</td></tr>`;
  }

  const productModal = $("productModal");
  const productForm = $("productForm");

  function openProductForm(p) {
    productForm.reset();
    productForm.querySelectorAll("[data-err]").forEach((el) => (el.textContent = ""));
    $("productModalTitle").textContent = p ? "Edit product" : "Add product";
    if (p) {
      productForm.id.value = p.id;
      productForm.name.value = p.name;
      productForm.brand.value = p.brand;
      productForm.category_id.value = p.category_id;
      productForm.original_price.value = p.original_price;
      productForm.price.value = p.price;
      productForm.stock.value = p.stock;
      productForm.rating.value = p.rating;
      productForm.emoji.value = p.emoji;
      productForm.image_url.value = p.image_url || "";
      productForm.description.value = p.description;
    } else {
      productForm.id.value = "";
      productForm.rating.value = 4;
      productForm.stock.value = 10;
      productForm.emoji.value = "📦";
    }
    productModal.classList.add("show");
  }
  function closeProductForm() { productModal.classList.remove("show"); }

  $("newProductBtn").onclick = () => openProductForm(null);
  productModal.addEventListener("click", (e) => { if (e.target === productModal || e.target.dataset.close !== undefined) closeProductForm(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeProductForm(); });

  $("productRows").addEventListener("click", async (e) => {
    const edit = e.target.dataset.edit;
    const del = e.target.dataset.delete;
    if (edit) openProductForm(products.find((p) => p.id === Number(edit)));
    if (del && confirm("Delete this product? Past orders keep their history.")) {
      try {
        await API.del("/admin/products/" + del);
        Components.toast("Product deleted");
        loadProducts();
      } catch (err) { Components.toast(err.message, true); }
    }
  });

  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = productForm;
    const body = {
      name: f.name.value.trim(),
      brand: f.brand.value.trim(),
      category_id: f.category_id.value,
      original_price: f.original_price.value,
      price: f.price.value,
      stock: f.stock.value,
      rating: f.rating.value,
      emoji: f.emoji.value.trim() || "📦",
      image_url: f.image_url.value.trim(),
      description: f.description.value.trim(),
    };
    // Quick client-side checks. The server validates everything again.
    const local = {};
    if (body.name.length < 3) local.name = "At least 3 characters.";
    if (body.brand.length < 2) local.brand = "Enter the brand.";
    if (Number(body.price) <= 0) local.price = "Enter a price above 0.";
    if (Number(body.original_price) < Number(body.price)) local.original_price = "Original price must be at least the selling price.";
    if (Number(body.stock) < 0 || !Number.isInteger(Number(body.stock))) local.stock = "Enter a whole number.";
    if (Number(body.rating) < 0 || Number(body.rating) > 5) local.rating = "Rating must be 0–5.";
    f.querySelectorAll("[data-err]").forEach((el) => (el.textContent = ""));
    Object.entries(local).forEach(([k, msg]) => (f.querySelector(`[data-err="${k}"]`).textContent = msg));
    if (Object.keys(local).length) return;

    try {
      if (f.id.value) await API.put("/admin/products/" + f.id.value, body);
      else await API.post("/admin/products", body);
      closeProductForm();
      Components.toast("Product saved");
      loadProducts();
    } catch (err) {
      Object.entries(err.errors || {}).forEach(([k, msg]) => {
        const el = f.querySelector(`[data-err="${k}"]`);
        if (el) el.textContent = msg;
      });
      f.querySelector('[data-err="_form"]').textContent = Object.keys(err.errors || {}).length ? "" : err.message;
    }
  });

  // ---------- Orders ----------
  async function loadOrders() {
    const status = $("orderFilter").value;
    const res = await API.get("/admin/orders" + (status ? "?status=" + encodeURIComponent(status) : ""));
    $("orderRows").innerHTML = res.orders.map((o) => `
      <tr>
        <td><b>${esc(o.order_code)}</b><div class="muted">${esc(o.created_at)}</div></td>
        <td>${esc(o.customer_name)}<div class="muted">${esc(o.customer_email)}</div></td>
        <td>${money(o.total)}</td>
        <td>${o.payment_method}</td>
        <td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td>
        <td>
          <select class="input" data-status-for="${esc(o.order_code)}" ${o.status === "Cancelled" ? "disabled" : ""} style="padding:6px">
            ${STATUSES.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
      </tr>`).join("") || `<tr><td colspan="6" class="muted">No orders.</td></tr>`;
  }

  $("orderFilter").onchange = loadOrders;
  $("orderRows").addEventListener("change", async (e) => {
    const code = e.target.dataset.statusFor;
    if (!code) return;
    try {
      await API.put(`/admin/orders/${encodeURIComponent(code)}/status`, { status: e.target.value });
      Components.toast("Order status updated");
      loadOrders();
    } catch (err) {
      Components.toast(err.message, true);
      loadOrders();
    }
  });

  // ---------- Customers ----------
  async function loadCustomers() {
    const { customers } = await API.get("/admin/customers");
    $("customerRows").innerHTML = customers.map((c) => `
      <tr>
        <td><b>${esc(c.name)}</b></td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.phone) || "—"}</td>
        <td>${esc(c.joined)}</td>
        <td>${c.orders}</td>
        <td>${money(c.spent)}</td>
      </tr>`).join("") || `<tr><td colspan="6" class="muted">No customers yet.</td></tr>`;
  }

  const loaders = {
    dashboard: loadDashboard,
    products: loadProducts,
    categories: loadCategories,
    orders: loadOrders,
    customers: loadCustomers,
  };

  loadDashboard().catch((e) => Components.toast(e.message, true));
  loadCategories();
})();
