/* Shared header, footer, toast, product card and page guards.
   Every page has <div id="site-header"></div>, <div id="site-footer"></div>
   and calls: const user = await Components.init(); */
const Components = (() => {
  let currentUser = null;

  const CATEGORIES = [
    { slug: "electronics", name: "Electronics" },
    { slug: "fashion", name: "Fashion" },
    { slug: "home", name: "Home & Kitchen" },
    { slug: "beauty", name: "Beauty" },
    { slug: "books", name: "Books" },
    { slug: "sports", name: "Sports" },
    { slug: "grocery", name: "Grocery" },
  ];

  const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const param = (name) => new URLSearchParams(location.search).get(name);

  function toast(message, isError = false) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function renderHeader() {
    const user = currentUser;
    const firstName = user ? esc(user.name.split(" ")[0]) : "Login";
    const userLink = user
      ? `<a class="action" href="profile.html">👤 ${firstName}</a>`
      : `<a class="action" href="login.html">👤 Login</a><a class="action" href="login.html?mode=signup">Sign up</a>`;
    const adminLink = user && user.role === "admin" ? `<a class="action" href="admin.html">⚙ Admin</a>` : "";
    const logout = user ? `<button class="action" id="logoutBtn">Logout</button>` : "";
    const current = (location.search.match(/cat=([^&]+)/) || [])[1];

    document.getElementById("site-header").innerHTML = `
      <div class="topbar">⚡ SNAP DEALS ARE LIVE · Free delivery on orders above ₹499 · Easy 7-day returns</div>
      <header class="site-header">
        <div class="container headrow">
          <a class="logo" href="index.html">Snap<span>Cart.</span></a>
          <form class="search" id="searchForm" role="search">
            <input id="searchInput" placeholder="Search for products, brands and more..." aria-label="Search products" value="${esc(param("q") || "")}">
            <button type="submit">Search</button>
          </form>
          <nav class="head-actions">
            ${userLink}${adminLink}
            <a class="action" href="wishlist.html">♡ Wishlist <span class="badge" id="wishCount">0</span></a>
            <a class="action" href="cart.html">🛒 Cart <span class="badge" id="cartCount">0</span></a>
            ${logout}
          </nav>
        </div>
        <nav class="categorybar">
          <a class="catlink ${!current ? "active" : ""}" href="index.html">All Products</a>
          ${CATEGORIES.map((c) => `<a class="catlink ${current === c.slug ? "active" : ""}" href="index.html?cat=${c.slug}">${esc(c.name)}</a>`).join("")}
        </nav>
      </header>`;

    document.getElementById("searchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = document.getElementById("searchInput").value.trim();
      location.href = "index.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = logout;
    updateBadges();
  }

  function renderFooter() {
    const el = document.getElementById("site-footer");
    if (!el) return;
    el.innerHTML = `
      <footer class="site-footer"><div class="container foot">
        <div><div class="logo">Snap<span>Cart.</span></div><p>Shop smarter, every day.</p></div>
        <div><b>Customer care</b><a href="profile.html">My orders</a><a href="cart.html">Your cart</a></div>
        <div><b>About Snap Cart</b><a href="#">About us</a><a href="#">Privacy policy</a></div>
        <div><b>Demo project</b><p>Built with HTML, CSS, JavaScript, Flask and MySQL.</p></div>
      </div></footer>`;
  }

  function updateBadges() {
    const wish = document.getElementById("wishCount");
    const cart = document.getElementById("cartCount");
    if (wish) wish.textContent = Store.getWishlist().length;
    if (cart) cart.textContent = Store.cartCount();
  }

  async function logout() {
    try { await API.post("/auth/logout"); } catch (_) { /* ignore */ }
    location.href = "index.html";
  }

  async function init() {
    try {
      currentUser = (await API.get("/auth/me")).user;
    } catch (_) {
      currentUser = null;
    }
    renderHeader();
    renderFooter();
    window.addEventListener("store:changed", updateBadges);
    return currentUser;
  }

  /* Send the visitor to login if needed. Returns true when access is allowed. */
  function requireUser({ admin = false } = {}) {
    const here = location.pathname.split("/").pop() + location.search;
    if (!currentUser) {
      location.href = "login.html?next=" + encodeURIComponent(here);
      return false;
    }
    if (admin && currentUser.role !== "admin") {
      location.href = "index.html";
      return false;
    }
    return true;
  }

  /* One product card. Used by the home page and the wishlist page. */
  function productCard(p) {
    const wished = Store.isWished(p.id);
    return `
      <article class="card">
        <div class="photo">
          ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : `<span>${esc(p.emoji)}</span>`}
          ${p.discount_percent > 0 ? `<span class="discount-tag">${p.discount_percent}% OFF</span>` : ""}
          <button class="heart ${wished ? "on" : ""}" data-wish="${p.id}" aria-label="Toggle wishlist">${wished ? "♥" : "♡"}</button>
        </div>
        <div class="details">
          <div class="brand">${esc(p.brand)} · ${esc(p.category)}</div>
          <a class="name" href="product.html?id=${p.id}">${esc(p.name)}</a>
          <div class="rating">★ ${p.rating.toFixed(1)}</div>
          <div class="price">${money(p.price)} <span class="old">${money(p.original_price)}</span></div>
          <div class="muted" style="font-size:11px;margin-top:4px">${p.stock > 0 ? "Free delivery · 7-day returns" : "Out of stock"}</div>
          <div class="card-actions">
            <button class="btn btn-light" data-add="${p.id}" ${p.stock === 0 ? "disabled" : ""}>Add to cart</button>
            <button class="btn" data-buy="${p.id}" ${p.stock === 0 ? "disabled" : ""}>Buy now</button>
          </div>
        </div>
      </article>`;
  }

  /* Wire the add / buy / wishlist buttons inside a container (event delegation). */
  function bindProductActions(container) {
    container.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      const buy = e.target.closest("[data-buy]");
      const wish = e.target.closest("[data-wish]");
      if (add) {
        Store.addToCart(Number(add.dataset.add));
        toast("Added to your cart");
      } else if (buy) {
        Store.addToCart(Number(buy.dataset.buy));
        location.href = "checkout.html";
      } else if (wish) {
        const on = Store.toggleWishlist(Number(wish.dataset.wish));
        toast(on ? "Added to wishlist" : "Removed from wishlist");
      }
    });
  }

  return { init, toast, money, esc, param, requireUser, productCard, bindProductActions, CATEGORIES, get user() { return currentUser; } };
})();
