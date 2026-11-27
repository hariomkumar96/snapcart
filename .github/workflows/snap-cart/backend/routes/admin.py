"""Admin API: products, categories, orders, customers and sales stats.

Every route here requires an admin session.
"""
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from flask import session

from db import execute, fetch_all, fetch_one, transaction
from routes.orders import ALL_STATUSES, ORDER_SELECT, STATUS_STEPS, attach_items, restore_stock
from routes.shop import PRODUCT_SELECT
from utils import clean_str, error_response, serialize_product, slugify, to_money

bp = Blueprint("admin", __name__)

@bp.before_request
def _require_admin():
    # Every route in this blueprint is admin-only.
    if session.get("role") != "admin":
        return error_response("Admin access only.", 403)
    return None


def parse_price(value, field, errors):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        errors[field] = "Enter a valid amount."
        return None
    if number <= 0 or number > 10_000_000:
        errors[field] = "Amount must be greater than 0 and below ₹1 crore."
        return None
    return number.quantize(Decimal("0.01"))


def validate_product(data, creating=True):
    errors = {}
    values = {
        "name": clean_str(data, "name", 200),
        "brand": clean_str(data, "brand", 100),
        "description": clean_str(data, "description", 2000),
        "emoji": clean_str(data, "emoji", 10) or "📦",
        "image_url": clean_str(data, "image_url", 500) or None,
    }
    if len(values["name"]) < 3:
        errors["name"] = "Product name must be at least 3 characters."
    if len(values["brand"]) < 2:
        errors["brand"] = "Enter the brand name."

    try:
        values["category_id"] = int(data.get("category_id"))
    except (TypeError, ValueError):
        errors["category_id"] = "Choose a category."

    price = parse_price(data.get("price"), "price", errors)
    original = parse_price(data.get("original_price"), "original_price", errors)
    if price and original and price > original:
        errors["price"] = "Selling price cannot be higher than the original price."

    try:
        stock = int(data.get("stock", 0))
        if stock < 0 or stock > 1_000_000:
            raise ValueError
        values["stock"] = stock
    except (TypeError, ValueError):
        errors["stock"] = "Stock must be a whole number from 0 to 1,000,000."

    try:
        rating = float(data.get("rating", 0))
        if not 0 <= rating <= 5:
            raise ValueError
        values["rating"] = round(rating, 1)
    except (TypeError, ValueError):
        errors["rating"] = "Rating must be between 0 and 5."

    values["price"] = price
    values["original_price"] = original
    return errors, values


@bp.get("/dashboard")
def dashboard():
    totals = fetch_one(
        """SELECT COUNT(*) AS orders,
                  COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN total ELSE 0 END), 0) AS sales,
                  COALESCE(SUM(CASE WHEN status = 'Placed' THEN 1 ELSE 0 END), 0) AS pending
           FROM orders"""
    )
    customers = fetch_one("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'")
    products = fetch_one("SELECT COUNT(*) AS n FROM products")

    daily = fetch_all(
        """SELECT DATE(created_at) AS day, COALESCE(SUM(total), 0) AS sales, COUNT(*) AS orders
           FROM orders
           WHERE status <> 'Cancelled' AND created_at >= (CURDATE() - INTERVAL 13 DAY)
           GROUP BY DATE(created_at) ORDER BY day"""
    )
    by_category = fetch_all(
        """SELECT c.name AS category, COALESCE(SUM(oi.line_total), 0) AS sales
           FROM categories c
           LEFT JOIN products p ON p.category_id = c.id
           LEFT JOIN order_items oi ON oi.product_id = p.id
           LEFT JOIN orders o ON o.id = oi.order_id AND o.status <> 'Cancelled'
           GROUP BY c.id, c.name ORDER BY sales DESC"""
    )
    by_status = fetch_all("SELECT status, COUNT(*) AS n FROM orders GROUP BY status")

    return jsonify(
        stats={
            "total_sales": to_money(totals["sales"]),
            "total_orders": int(totals["orders"]),
            "pending_orders": int(totals["pending"]),
            "customers": customers["n"],
            "products": products["n"],
        },
        daily_sales=[
            {"day": r["day"].isoformat(), "sales": to_money(r["sales"]), "orders": r["orders"]}
            for r in daily
        ],
        sales_by_category=[
            {"category": r["category"], "sales": to_money(r["sales"])} for r in by_category
        ],
        orders_by_status=[{"status": r["status"], "count": r["n"]} for r in by_status],
    )


# ---------- Categories ----------

@bp.get("/categories")
def admin_categories():
    rows = fetch_all(
        """SELECT c.id, c.name, c.slug, c.icon, COUNT(p.id) AS product_count
           FROM categories c LEFT JOIN products p ON p.category_id = c.id
           GROUP BY c.id, c.name, c.slug, c.icon ORDER BY c.name"""
    )
    return jsonify(categories=rows)


@bp.post("/categories")
def create_category():
    data = request.get_json(silent=True) or {}
    name = clean_str(data, "name", 60)
    icon = clean_str(data, "icon", 10) or "🛍️"
    if len(name) < 2:
        return error_response("Category name must be at least 2 characters.", 400, {"name": "Too short."})
    slug = slugify(name)
    if not slug:
        return error_response("Use letters or numbers in the category name.", 400, {"name": "Invalid name."})
    if fetch_one("SELECT id FROM categories WHERE name = %s OR slug = %s", (name, slug)):
        return error_response("A category with this name already exists.", 409)
    new_id = execute("INSERT INTO categories (name, slug, icon) VALUES (%s, %s, %s)", (name, slug, icon))
    return jsonify(id=new_id, message="Category added."), 201


@bp.delete("/categories/<int:category_id>")
def delete_category(category_id):
    in_use = fetch_one("SELECT COUNT(*) AS n FROM products WHERE category_id = %s", (category_id,))
    if in_use["n"]:
        return error_response(
            f"This category has {in_use['n']} product(s). Move or delete them first.", 409
        )
    execute("DELETE FROM categories WHERE id = %s", (category_id,))
    return jsonify(message="Category deleted.")


# ---------- Products ----------

@bp.get("/products")
def admin_products():
    rows = fetch_all(PRODUCT_SELECT + " ORDER BY p.id DESC")
    return jsonify(products=[serialize_product(r) for r in rows])


@bp.post("/products")
def create_product():
    data = request.get_json(silent=True) or {}
    errors, v = validate_product(data)
    if errors:
        return error_response("Please fix the highlighted fields.", 400, errors)
    if not fetch_one("SELECT id FROM categories WHERE id = %s", (v["category_id"],)):
        return error_response("Choose a valid category.", 400, {"category_id": "Category not found."})
    new_id = execute(
        """INSERT INTO products
           (name, brand, category_id, description, price, original_price, rating, stock, emoji, image_url)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (v["name"], v["brand"], v["category_id"], v["description"], v["price"],
         v["original_price"], v["rating"], v["stock"], v["emoji"], v["image_url"]),
    )
    return jsonify(id=new_id, message="Product added."), 201


@bp.put("/products/<int:product_id>")
def update_product(product_id):
    if not fetch_one("SELECT id FROM products WHERE id = %s", (product_id,)):
        return error_response("Product not found.", 404)
    data = request.get_json(silent=True) or {}
    errors, v = validate_product(data, creating=False)
    if errors:
        return error_response("Please fix the highlighted fields.", 400, errors)
    execute(
        """UPDATE products SET name=%s, brand=%s, category_id=%s, description=%s, price=%s,
           original_price=%s, rating=%s, stock=%s, emoji=%s, image_url=%s WHERE id=%s""",
        (v["name"], v["brand"], v["category_id"], v["description"], v["price"],
         v["original_price"], v["rating"], v["stock"], v["emoji"], v["image_url"], product_id),
    )
    return jsonify(message="Product updated.")


@bp.delete("/products/<int:product_id>")
def delete_product(product_id):
    if not fetch_one("SELECT id FROM products WHERE id = %s", (product_id,)):
        return error_response("Product not found.", 404)
    # Past orders keep their item rows (product_id becomes NULL via ON DELETE SET NULL).
    execute("DELETE FROM products WHERE id = %s", (product_id,))
    return jsonify(message="Product deleted.")


# ---------- Orders ----------

@bp.get("/orders")
def admin_orders():
    status = clean_str(request.args, "status", 30)
    sql = ORDER_SELECT
    params = []
    if status and status in ALL_STATUSES:
        sql += " WHERE o.status = %s"
        params.append(status)
    sql += " ORDER BY o.created_at DESC, o.id DESC"
    rows = fetch_all(sql, params)
    return jsonify(orders=attach_items(rows))


@bp.put("/orders/<order_code>/status")
def update_order_status(order_code):
    data = request.get_json(silent=True) or {}
    new_status = clean_str(data, "status", 30)
    if new_status not in ALL_STATUSES:
        return error_response("Invalid status.", 400, {"status": "Choose a valid status."})

    order = fetch_one("SELECT id, status FROM orders WHERE order_code = %s", (order_code.upper(),))
    if not order:
        return error_response("Order not found.", 404)
    if order["status"] == "Cancelled":
        return error_response("A cancelled order can't be updated.", 409)
    if new_status == order["status"]:
        return jsonify(message="Status unchanged.")
    if new_status != "Cancelled" and new_status in STATUS_STEPS:
        # Statuses only move forward. Cancelling is the only backward-safe action.
        if STATUS_STEPS.index(new_status) < STATUS_STEPS.index(order["status"]):
            return error_response("Status can't move backwards.", 409)

    with transaction() as cur:
        # Re-read under a row lock so two admins can't race on the same order.
        cur.execute("SELECT id, status FROM orders WHERE id = %s FOR UPDATE", (order["id"],))
        locked = cur.fetchone()
        if locked["status"] == "Cancelled":
            return error_response("A cancelled order can't be updated.", 409)
        if new_status == "Cancelled":
            restore_stock(cur, order["id"])
        cur.execute("UPDATE orders SET status = %s WHERE id = %s", (new_status, order["id"]))
        cur.execute(
            "INSERT INTO order_status_log (order_id, status, note) VALUES (%s, %s, %s)",
            (order["id"], new_status, "Updated by admin"),
        )
    return jsonify(message=f"Order status set to {new_status}.")


# ---------- Customers ----------

@bp.get("/customers")
def customers():
    rows = fetch_all(
        """SELECT u.id, u.name, u.email, u.phone, u.created_at,
                  COUNT(o.id) AS orders,
                  COALESCE(SUM(CASE WHEN o.status <> 'Cancelled' THEN o.total ELSE 0 END), 0) AS spent
           FROM users u LEFT JOIN orders o ON o.user_id = u.id
           WHERE u.role = 'customer'
           GROUP BY u.id, u.name, u.email, u.phone, u.created_at
           ORDER BY u.created_at DESC"""
    )
    return jsonify(customers=[
        {
            "id": r["id"],
            "name": r["name"],
            "email": r["email"],
            "phone": r["phone"] or "",
            "joined": r["created_at"].isoformat(sep=" ") if r["created_at"] else None,
            "orders": r["orders"],
            "spent": to_money(r["spent"]),
        }
        for r in rows
    ])
