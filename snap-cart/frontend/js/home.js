/* Home page: catalogue listing, search, category, brand, price, rating and sort filters. */
(async function () {
  const grid = document.getElementById("productGrid");
  const $ = (id) => document.getElementById(id);
  const state = { category: Components.param("cat") || "all", q: Components.param("q") || "" };

  await Components.init();
  Components.bindProductActions(grid);

  // Fill the brand dropdown from the database.
  try {
    const { brands } = await API.get("/brands");
    $("brandSelect").insertAdjacentHTML("beforeend",
      brands.map((b) => `<option value="${Components.esc(b)}">${Components.esc(b)}</option>`).join(""));
  } catch (_) { /* filter still works without the list */ }

  // Carry search text / category from the URL into the search box and filters.
  $("searchInput") && ($("searchInput").value = state.q);

  function readFilters() {
    return {
      category: state.category,
      q: state.q,
      brand: $("brandSelect").value,
      min_price: $("minPrice").value,
      max_price: $("maxPrice").value,
      min_rating: $("minRating").value,
      min_discount: $("minDiscount").value,
      sort: $("sortSelect").value,
    };
  }

  function validatePrices(f) {
    const min = Number(f.min_price), max = Number(f.max_price);
    if (f.min_price && (isNaN(min) || min < 0)) return "Minimum price must be a positive number.";
    if (f.max_price && (isNaN(max) || max < 0)) return "Maximum price must be a positive number.";
    if (f.min_price && f.max_price && min > max) return "Minimum price cannot be more than maximum price.";
    return "";
  }

  async function load() {
    const f = readFilters();
    const err = validatePrices(f);
    $("priceError").textContent = err;
    if (err) return;

    grid.innerHTML = `<div class="spinner">Loading products…</div>`;
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v !== "" && v !== "all") params.set(k, v); });

    try {
      const { products, count } = await API.get("/products?" + params.toString());
      const titles = { electronics: "Electronics", fashion: "Fashion", home: "Home & Kitchen", beauty: "Beauty", books: "Books", sports: "Sports", grocery: "Grocery" };
      $("listingTitle").textContent = state.q ? `Search results for “${state.q}”`
        : titles[state.category] ? `${titles[state.category]} picks` : "Trending products";
      $("resultCount").textContent = `Showing ${count} product${count === 1 ? "" : "s"}`;
      grid.innerHTML = products.length
        ? products.map(Components.productCard).join("")
        : `<div class="empty"><div style="font-size:35px">🔎</div><h3>No products found</h3><p>Try another keyword or clear your filters.</p><button class="btn btn-light" id="clearBtn">Clear filters</button></div>`;
    } catch (e) {
      grid.innerHTML = `<div class="empty">Could not load products: ${Components.esc(e.message)}</div>`;
    }
  }

  // Category links and search are page navigations; filters are applied in place.
  $("applyFilters").onclick = load;
  $("sortSelect").onchange = load;
  $("resetFilters").onclick = () => {
    ["brandSelect", "minRating", "minDiscount", "sortSelect"].forEach((id) => ($(id).value = id === "sortSelect" ? "featured" : ""));
    $("minPrice").value = ""; $("maxPrice").value = "";
    load();
  };
  grid.addEventListener("click", (e) => {
    if (e.target.id === "clearBtn") { location.href = "index.html"; }
  });
  $("minPrice").addEventListener("keydown", (e) => e.key === "Enter" && load());
  $("maxPrice").addEventListener("keydown", (e) => e.key === "Enter" && load());

  load();
})();
