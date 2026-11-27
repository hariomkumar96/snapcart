"""Public catalogue: categories, products, brands, search and filters."""
from flask import Blueprint, jsonify, request

from db import fetch_all, fetch_one
from utils import clean_str, error_response, serialize_product

bp = Blueprint("shop", __name__)

PRODUCT_SELECT = """
    SELECT p.id, p.name, p.brand, p.description, p.price, p.original_price,
           p.rating, p.stock, p.emoji, p.image_url, p.category_id,
           c.name AS category, c.slug AS category_slug
    FROM products p
    JOIN categories c ON c.id = p.category_id
"""

SORT_OPTIONS = {
    "featured": "p.id ASC",
    "price_asc": "p.price ASC, p.id ASC",
    "price_desc": "p.price DESC, p.id ASC",
    "rating": "p.rating DESC, p.id ASC",
    "discount": "(p.original_price - p.price) / p.original_price DESC, p.id ASC",
    "newest": "p.created_at DESC, p.id DESC",
}


def parse_number(value, name):
    """Return a float, or raise ValueError with a readable message."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number.")
    if number < 0:
        raise ValueError(f"{name} cannot be negative.")
    return number


@bp.get("/categories")
def categories():
    rows = fetch_all(
        """
        SELECT c.id, c.name, c.slug, c.icon, COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id, c.name, c.slug, c.icon
        ORDER BY c.name
        """
    )
    return jsonify(categories=rows)


@bp.get("/brands")
def brands():
    rows = fetch_all("SELECT DISTINCT brand FROM products ORDER BY brand")
    return jsonify(brands=[r["brand"] for r in rows])


@bp.get("/products")
def list_products():
    args = request.args
    where, params = [], []

    q = clean_str(args, "q", 100)
    if q:
        like = f"%{q}%"
        where.append("(p.name LIKE %s OR p.brand LIKE %s OR c.name LIKE %s)")
        params += [like, like, like]

    category = clean_str(args, "category", 60)
    if category and category != "all":
        where.append("c.slug = %s")
        params.append(category)

    brand = clean_str(args, "brand", 100)
    if brand:
        where.append("p.brand = %s")
        params.append(brand)

    try:
        min_price = parse_number(args["min_price"], "Minimum price") if args.get("min_price") else None
        max_price = parse_number(args["max_price"], "Maximum price") if args.get("max_price") else None
        min_rating = parse_number(args["min_rating"], "Minimum rating") if args.get("min_rating") else None
        min_discount = parse_number(args["min_discount"], "Minimum discount") if args.get("min_discount") else None
    except ValueError as exc:
        return error_response(str(exc), 400)

    if min_price is not None and max_price is not None and min_price > max_price:
        return error_response("Minimum price cannot be more than maximum price.", 400)
    if min_price is not None:
        where.append("p.price >= %s")
        params.append(min_price)
    if max_price is not None:
        where.append("p.price <= %s")
        params.append(max_price)
    if min_rating is not None:
        where.append("p.rating >= %s")
        params.append(min_rating)
    if min_discount is not None:
        where.append("(p.original_price - p.price) * 100 / p.original_price >= %s")
        params.append(min_discount)

    sort = args.get("sort", "featured")
    order_by = SORT_OPTIONS.get(sort, SORT_OPTIONS["featured"])

    sql = PRODUCT_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {order_by}"

    rows = fetch_all(sql, params)
    products = [serialize_product(r) for r in rows]
    return jsonify(products=products, count=len(products))


@bp.get("/products/<int:product_id>")
def product_detail(product_id):
    row = fetch_one(PRODUCT_SELECT + " WHERE p.id = %s", (product_id,))
    if not row:
        return error_response("Product not found.", 404)
    return jsonify(product=serialize_product(row))
