"""Cart pricing, coupons, checkout, order history and tracking.

All prices, discounts and delivery fees are calculated here on the server.
The browser only sends product IDs and quantities.
"""
import re
import secrets
from decimal import Decimal

from flask import Blueprint, jsonify, request, session

from config import Config
from db import fetch_all, fetch_one, transaction
from routes.shop import PRODUCT_SELECT
from utils import (
    PINCODE_RE,
    PHONE_RE,
    UPI_RE,
    ValidationError,
    clean_str,
    error_response,
    login_required,
    serialize_order,
    to_money,
)

bp = Blueprint("orders", __name__)

CENT = Decimal("0.01")
STATUS_STEPS = ["Placed", "Packed", "Shipped", "Out for Delivery", "Delivered"]
ALL_STATUSES = STATUS_STEPS + ["Cancelled"]
CANCELLABLE = ("Placed", "Packed")

ORDER_SELECT = """
    SELECT o.id, o.user_id, o.order_code, o.status, o.payment_method, o.subtotal, o.discount,
           o.delivery_fee, o.total, o.coupon_code, o.full_name, o.address, o.pincode,
           o.created_at, u.name AS user_name, u.email AS user_email
    FROM orders o
    JOIN users u ON u.id = o.user_id
"""


@bp.errorhandler(ValidationError)
def handle_validation(exc):
    return error_response("Please check your details.", 400, exc.errors)


def money(value):
    return Decimal(str(value)).quantize(CENT)


def parse_items(raw):
    """Turn [{product_id, qty}, ...] into {product_id: qty}, checking the limits."""
    if not isinstance(raw, list) or not raw:
        raise ValidationError({"items": "Your cart is empty."})
    merged = {}
    for item in raw:
        try:
            pid = int(item.get("product_id"))
            qty = int(item.get("qty"))
        except (TypeError, ValueError, AttributeError):
            raise ValidationError({"items": "One of the cart items is invalid."})
        if qty < 1 or qty > Config.MAX_QTY_PER_ITEM:
            raise ValidationError({"items": f"Quantity must be between 1 and {Config.MAX_QTY_PER_ITEM}."})
        merged[pid] = merged.get(pid, 0) + qty
    for pid, qty in merged.items():
        if qty > Config.MAX_QTY_PER_ITEM:
            raise ValidationError({"items": f"You can order at most {Config.MAX_QTY_PER_ITEM} of one item."})
    return merged


def load_products(cur, ids, lock=False):
    placeholders = ",".join(["%s"] * len(ids))
    sql = PRODUCT_SELECT + f" WHERE p.id IN ({placeholders}) ORDER BY p.id"
    if lock:
        sql += " FOR UPDATE"  # locks rows so two orders can't oversell the same stock
    cur.execute(sql, ids)
    return {row["id"]: row for row in cur.fetchall()}


def apply_coupon(cur, code, subtotal):
    if not code:
        return Decimal("0.00"), None
    cur.execute("SELECT * FROM coupons WHERE code = %s AND is_active = 1", (code.upper(),))
    coupon = cur.fetchone()
    if not coupon:
        raise ValidationError({"coupon_code": "This coupon is invalid or expired."})
    if subtotal < coupon["min_order"]:
        raise ValidationError({
            "coupon_code": f"Add items worth ₹{coupon['min_order']} or more to use {coupon['code']}."
        })
    if coupon["discount_type"] == "percent":
        discount = subtotal * coupon["value"] / Decimal("100")
        if coupon["max_discount"] is not None:
            discount = min(discount, coupon["max_discount"])
    else:
        discount = coupon["value"]
    discount = min(money(discount), subtotal)
    return discount, coupon["code"]


def build_cart(cur, merged, coupon_code, lock=False):
    """Price the cart from the database. Returns totals and line details."""
    products = load_products(cur, sorted(merged), lock=lock)
    lines, subtotal = [], Decimal("0.00")
    for pid, qty in merged.items():
        product = products.get(pid)
        if not product:
            raise ValidationError({"items": "One of the items is no longer available."})
        unit = money(product["price"])
        line_total = unit * qty
        subtotal += line_total
        lines.append({
            "product_id": pid,
            "name": product["name"],
            "brand": product["brand"],
            "emoji": product["emoji"],
            "unit_price": unit,
            "qty": qty,
            "stock": product["stock"],
            "line_total": line_total,
        })

    discount, applied_code = apply_coupon(cur, coupon_code, subtotal)
    delivery = Decimal("0.00") if subtotal >= Config.FREE_DELIVERY_ABOVE else money(Config.DELIVERY_FEE)
    total = subtotal - discount + delivery
    return {
        "lines": lines,
        "subtotal": subtotal,
        "discount": discount,
        "delivery_fee": delivery,
        "total": total,
        "coupon_code": applied_code,
    }


def attach_items(rows):
    """Add an 'items' list and status fields to order rows."""
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    placeholders = ",".join(["%s"] * len(ids))
    items = fetch_all(
        f"""SELECT order_id, product_id, product_name, unit_price, qty, line_total
            FROM order_items WHERE order_id IN ({placeholders}) ORDER BY id""",
        ids,
    )
    by_order = {}
    for it in items:
        by_order.setdefault(it["order_id"], []).append({
            "product_id": it["product_id"],
            "name": it["product_name"],
            "unit_price": to_money(it["unit_price"]),
            "qty": it["qty"],
            "line_total": to_money(it["line_total"]),
        })
    result = []
    for row in rows:
        order = serialize_order(row)
        order["items"] = by_order.get(row["id"], [])
        result.append(order)
    return result


def restore_stock(cur, order_id):
    cur.execute("SELECT product_id, qty FROM order_items WHERE order_id = %s", (order_id,))
    for item in cur.fetchall():
        if item["product_id"] is not None:
            cur.execute(
                "UPDATE products SET stock = stock + %s WHERE id = %s",
                (item["qty"], item["product_id"]),
            )


def validate_checkout(data):
    errors, values = {}, {}
    values["full_name"] = clean_str(data, "full_name", 100)
    values["phone"] = re.sub(r"[\s-]", "", clean_str(data, "phone", 20))
    values["address"] = clean_str(data, "address", 500)
    values["pincode"] = clean_str(data, "pincode", 6)
    values["payment_method"] = clean_str(data, "payment_method", 10).upper()
    values["upi_id"] = clean_str(data, "upi_id", 100)

    if len(values["full_name"]) < 2:
        errors["full_name"] = "Enter the receiver's name."
    if not PHONE_RE.match(values["phone"]):
        errors["phone"] = "Enter a valid 10-digit mobile number."
    if len(values["address"]) < 10:
        errors["address"] = "Enter a complete address (at least 10 characters)."
    if not PINCODE_RE.match(values["pincode"]):
        errors["pincode"] = "Enter a valid 6-digit PIN code."
    if values["payment_method"] not in ("COD", "UPI"):
        errors["payment_method"] = "Choose a payment method."
    if values["payment_method"] == "UPI" and not UPI_RE.match(values["upi_id"]):
        errors["upi_id"] = "Enter a valid UPI ID, for example name@bank."
    if values["payment_method"] != "UPI":
        values["upi_id"] = None
    return errors, values


@bp.post("/cart/summary")
def cart_summary():
    """Price a cart for display. Nothing is saved."""
    data = request.get_json(silent=True) or {}
    merged = parse_items(data.get("items"))
    coupon = clean_str(data, "coupon_code", 30).upper() or None
    with transaction() as cur:
        cart = build_cart(cur, merged, coupon)
    return jsonify({
        "items": [
            {**line, "unit_price": float(line["unit_price"]), "line_total": float(line["line_total"])}
            for line in cart["lines"]
        ],
        "subtotal": float(cart["subtotal"]),
        "discount": float(cart["discount"]),
        "delivery_fee": float(cart["delivery_fee"]),
        "total": float(cart["total"]),
        "coupon_code": cart["coupon_code"],
        "free_delivery_above": Config.FREE_DELIVERY_ABOVE,
        "stock_issues": [
            f"Only {line['stock']} left of {line['name']}."
            for line in cart["lines"] if line["qty"] > line["stock"]
        ],
    })


@bp.post("/orders")
@login_required
def place_order():
    data = request.get_json(silent=True) or {}
    errors, form = validate_checkout(data)
    if errors:
        return error_response("Please fix the highlighted fields.", 400, errors)

    merged = parse_items(data.get("items"))
    coupon = clean_str(data, "coupon_code", 30).upper() or None

    order_code = "SC" + secrets.token_hex(4).upper()
    with transaction() as cur:
        cart = build_cart(cur, merged, coupon, lock=True)

        for line in cart["lines"]:
            if line["qty"] > line["stock"]:
                raise ValidationError({"items": f"Only {line['stock']} left of {line['name']}."})
            cur.execute(
                "UPDATE products SET stock = stock - %s WHERE id = %s AND stock >= %s",
                (line["qty"], line["product_id"], line["qty"]),
            )
            if cur.rowcount != 1:
                raise ValidationError({"items": f"{line['name']} just sold out. Please update your cart."})

        cur.execute(
            """INSERT INTO orders
               (order_code, user_id, full_name, phone, address, pincode, payment_method, upi_id,
                coupon_code, subtotal, discount, delivery_fee, total, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Placed')""",
            (
                order_code, session["user_id"], form["full_name"], form["phone"],
                form["address"], form["pincode"], form["payment_method"], form["upi_id"],
                cart["coupon_code"], cart["subtotal"], cart["discount"],
                cart["delivery_fee"], cart["total"],
            ),
        )
        order_id = cur.lastrowid

        for line in cart["lines"]:
            cur.execute(
                """INSERT INTO order_items
                   (order_id, product_id, product_name, unit_price, qty, line_total)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (order_id, line["product_id"], line["name"], line["unit_price"],
                 line["qty"], line["line_total"]),
            )

        cur.execute(
            "INSERT INTO order_status_log (order_id, status, note) VALUES (%s, 'Placed', 'Order placed')",
            (order_id,),
        )

    return jsonify(
        order_code=order_code,
        total=float(cart["total"]),
        message="Order placed successfully.",
    ), 201


@bp.get("/orders")
@login_required
def my_orders():
    rows = fetch_all(
        ORDER_SELECT + " WHERE o.user_id = %s ORDER BY o.created_at DESC, o.id DESC",
        (session["user_id"],),
    )
    return jsonify(orders=attach_items(rows))


@bp.get("/orders/<order_code>")
@login_required
def order_detail(order_code):
    row = fetch_one(
        ORDER_SELECT + " WHERE o.order_code = %s",
        (order_code.upper(),),
    )
    if not row:
        return error_response("Order not found.", 404)

    is_owner = row["user_id"] == session["user_id"]
    if not is_owner and session.get("role") != "admin":
        return error_response("Order not found.", 404)

    order = attach_items([row])[0]
    timeline = fetch_all(
        "SELECT status, note, created_at FROM order_status_log WHERE order_id = %s ORDER BY id",
        (row["id"],),
    )
    order["timeline"] = [
        {**entry, "created_at": entry["created_at"].isoformat(sep=" ") if entry["created_at"] else None}
        for entry in timeline
    ]
    order["steps"] = STATUS_STEPS
    order["can_cancel"] = is_owner and order["status"] in CANCELLABLE
    return jsonify(order=order)


@bp.post("/orders/<order_code>/cancel")
@login_required
def cancel_order(order_code):
    with transaction() as cur:
        cur.execute(
            "SELECT id, status, user_id FROM orders WHERE order_code = %s FOR UPDATE",
            (order_code.upper(),),
        )
        order = cur.fetchone()
        if not order or order["user_id"] != session["user_id"]:
            return error_response("Order not found.", 404)
        if order["status"] not in CANCELLABLE:
            return error_response("This order has already shipped and can't be cancelled.", 409)

        restore_stock(cur, order["id"])
        cur.execute("UPDATE orders SET status = 'Cancelled' WHERE id = %s", (order["id"],))
        cur.execute(
            "INSERT INTO order_status_log (order_id, status, note) VALUES (%s, 'Cancelled', 'Cancelled by customer')",
            (order["id"],),
        )
    return jsonify(message="Order cancelled and stock released.")


@bp.get("/coupons/<code>")
def check_coupon(code):
    """Let the cart show whether a coupon exists, without applying it."""
    row = fetch_one(
        "SELECT code, discount_type, value, max_discount, min_order FROM coupons WHERE code = %s AND is_active = 1",
        (code.upper(),),
    )
    if not row:
        return error_response("This coupon is invalid or expired.", 404)
    return jsonify(coupon={k: to_money(v) for k, v in row.items()})
