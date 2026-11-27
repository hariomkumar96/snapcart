"""Shared helpers: auth decorators, validation and JSON serialisation."""
import re
from decimal import Decimal
from functools import wraps

from flask import jsonify, session

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^[6-9]\d{9}$")          # 10-digit Indian mobile number
PINCODE_RE = re.compile(r"^\d{6}$")
UPI_RE = re.compile(r"^[\w.\-]{2,256}@[A-Za-z]{2,64}$")
SLUG_RE = re.compile(r"[^a-z0-9]+")


class ValidationError(Exception):
    """Raised with a dict of {field: message} when input is invalid."""

    def __init__(self, errors):
        super().__init__("validation failed")
        self.errors = errors


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify(error="Please sign in to continue."), 401
        return view(*args, **kwargs)
    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if session.get("role") != "admin":
            return jsonify(error="Admin access only."), 403
        return view(*args, **kwargs)
    return wrapper


def to_money(value):
    """Convert DB Decimal values to float for JSON."""
    if isinstance(value, Decimal):
        return float(value)
    return value


def slugify(text):
    return SLUG_RE.sub("-", text.lower()).strip("-")


def clean_str(data, key, max_len):
    value = data.get(key)
    if value is None:
        return ""
    return str(value).strip()[:max_len]


def discount_percent(price, original):
    if not original or original <= 0:
        return 0
    return round((float(original) - float(price)) / float(original) * 100)


def serialize_product(row):
    price = to_money(row["price"])
    original = to_money(row["original_price"])
    return {
        "id": row["id"],
        "name": row["name"],
        "brand": row["brand"],
        "description": row.get("description") or "",
        "price": price,
        "original_price": original,
        "discount_percent": discount_percent(price, original),
        "rating": to_money(row["rating"]),
        "stock": row["stock"],
        "emoji": row["emoji"],
        "image_url": row.get("image_url"),
        "category_id": row["category_id"],
        "category": row["category"],
        "category_slug": row["category_slug"],
    }


def serialize_order(row):
    out = {
        "order_code": row["order_code"],
        "status": row["status"],
        "payment_method": row["payment_method"],
        "subtotal": to_money(row["subtotal"]),
        "discount": to_money(row["discount"]),
        "delivery_fee": to_money(row["delivery_fee"]),
        "total": to_money(row["total"]),
        "coupon_code": row.get("coupon_code"),
        "full_name": row["full_name"],
        "address": row["address"],
        "pincode": row["pincode"],
        "created_at": row["created_at"].isoformat(sep=" ") if row.get("created_at") else None,
    }
    if "user_name" in row:
        out["customer_name"] = row["user_name"]
        out["customer_email"] = row["user_email"]
    return out


def error_response(message, status=400, errors=None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status
