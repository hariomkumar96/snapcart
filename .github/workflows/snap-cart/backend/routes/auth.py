"""Signup, login, logout, current user and profile."""
import re

from flask import Blueprint, jsonify, request, session
from mysql.connector.errors import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from db import execute, fetch_one
from utils import EMAIL_RE, PHONE_RE, clean_str, error_response, login_required

bp = Blueprint("auth", __name__)


def public_user(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"] or "",
        "role": row["role"],
    }


def start_session(user):
    session.clear()
    session["user_id"] = user["id"]
    session["role"] = user["role"]
    session["name"] = user["name"]


def password_problem(password):
    if len(password) < 8:
        return "Use at least 8 characters."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Use at least one letter and one number."
    return None


@bp.post("/signup")
def signup():
    data = request.get_json(silent=True) or {}
    name = clean_str(data, "name", 100)
    email = clean_str(data, "email", 150).lower()
    phone = re.sub(r"[\s-]", "", clean_str(data, "phone", 20))
    password = str(data.get("password") or "")
    confirm = str(data.get("confirm_password") or "")

    errors = {}
    if len(name) < 2:
        errors["name"] = "Enter your full name (at least 2 characters)."
    if not EMAIL_RE.match(email):
        errors["email"] = "Enter a valid email address."
    if phone and not PHONE_RE.match(phone):
        errors["phone"] = "Enter a valid 10-digit mobile number."
    if problem := password_problem(password):
        errors["password"] = problem
    if password != confirm:
        errors["confirm_password"] = "Passwords do not match."
    if errors:
        return error_response("Please fix the highlighted fields.", 400, errors)

    if fetch_one("SELECT id FROM users WHERE email = %s", (email,)):
        return error_response(
            "An account with this email already exists.",
            409,
            {"email": "This email is already registered. Try logging in."},
        )
    try:
        user_id = execute(
            "INSERT INTO users (name, email, password_hash, phone) VALUES (%s, %s, %s, %s)",
            (name, email, generate_password_hash(password), phone or None),
        )
    except IntegrityError:
        return error_response("An account with this email already exists.", 409)

    user = fetch_one("SELECT id, name, email, phone, role FROM users WHERE id = %s", (user_id,))
    start_session(user)
    return jsonify(user=public_user(user)), 201


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = clean_str(data, "email", 150).lower()
    password = str(data.get("password") or "")

    errors = {}
    if not EMAIL_RE.match(email):
        errors["email"] = "Enter a valid email address."
    if not password:
        errors["password"] = "Enter your password."
    if errors:
        return error_response("Please fix the highlighted fields.", 400, errors)

    user = fetch_one(
        "SELECT id, name, email, phone, role, password_hash FROM users WHERE email = %s",
        (email,),
    )
    # Same message for "no such user" and "wrong password" so emails can't be probed.
    if not user or not check_password_hash(user["password_hash"], password):
        return error_response("Incorrect email or password.", 401)

    start_session(user)
    return jsonify(user=public_user(user))


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify(message="Signed out.")


@bp.get("/me")
def me():
    if "user_id" not in session:
        return jsonify(user=None)
    user = fetch_one("SELECT id, name, email, phone, role FROM users WHERE id = %s", (session["user_id"],))
    if not user:
        session.clear()
        return jsonify(user=None)
    return jsonify(user=public_user(user))


@bp.put("/profile")
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    name = clean_str(data, "name", 100)
    phone = re.sub(r"[\s-]", "", clean_str(data, "phone", 20))

    errors = {}
    if len(name) < 2:
        errors["name"] = "Enter your full name (at least 2 characters)."
    if phone and not PHONE_RE.match(phone):
        errors["phone"] = "Enter a valid 10-digit mobile number."
    if errors:
        return error_response("Please fix the highlighted fields.", 400, errors)

    execute(
        "UPDATE users SET name = %s, phone = %s WHERE id = %s",
        (name, phone or None, session["user_id"]),
    )
    session["name"] = name
    user = fetch_one("SELECT id, name, email, phone, role FROM users WHERE id = %s", (session["user_id"],))
    return jsonify(user=public_user(user))
