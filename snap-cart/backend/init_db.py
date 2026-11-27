"""Create the database, tables, admin account and sample catalogue.

Run once after installing requirements and creating backend/.env:
    python init_db.py
Safe to re-run: existing rows are left alone.
"""
import os

from werkzeug.security import generate_password_hash

from config import Config
from db import execute, fetch_one, get_raw_connection

HERE = os.path.dirname(os.path.abspath(__file__))

CATEGORIES = [
    ("Electronics", "electronics", "🔌"),
    ("Fashion", "fashion", "👗"),
    ("Home & Kitchen", "home", "🏠"),
    ("Beauty", "beauty", "💄"),
    ("Books", "books", "📚"),
    ("Sports", "sports", "⚽"),
    ("Grocery", "grocery", "🛒"),
]

# name, brand, category slug, description, price, original, rating, stock, emoji
PRODUCTS = [
    ("Noise-Cancelling Wireless Headphones", "SoundMax", "electronics", "Immersive sound, comfortable ear cushions and long battery life.", 2499, 3999, 4.6, 40, "🎧"),
    ("Smart Watch with Fitness Tracker", "FitPro", "electronics", "Track steps, heart rate and notifications on a bright touch display.", 1799, 2999, 4.4, 25, "⌚"),
    ("Portable Bluetooth Speaker", "SoundMax", "electronics", "Compact wireless speaker with punchy sound for desk or outings.", 1199, 1999, 4.5, 30, "🔊"),
    ("Wireless Gaming Mouse", "ClickEdge", "electronics", "Precise optical sensor with silent clicks and a rechargeable battery.", 999, 1699, 4.3, 18, "🖱️"),
    ("Classic Everyday Sneakers", "UrbanStep", "fashion", "Lightweight sneakers with a cushioned sole and versatile design.", 1299, 2199, 4.5, 50, "👟"),
    ("Minimalist Travel Backpack", "CarryOn", "fashion", "Roomy backpack with organised pockets for college and travel.", 899, 1499, 4.3, 35, "🎒"),
    ("Cotton Casual T-Shirt", "Everyday", "fashion", "Soft, breathable cotton tee for an easy everyday look.", 399, 699, 4.2, 120, "👕"),
    ("Ceramic Coffee Mug Set", "HomeNest", "home", "A set of durable ceramic mugs for coffee and tea.", 499, 799, 4.7, 60, "☕"),
    ("LED Desk Lamp", "GlowUp", "home", "Adjustable desk lamp for reading, studying and working late.", 699, 1099, 4.4, 22, "💡"),
    ("Stainless Steel Water Bottle", "HydroGo", "home", "Reusable bottle that keeps you hydrated at work or on the go.", 349, 599, 4.6, 80, "🥤"),
    ("Daily Skincare Essentials Kit", "GlowCare", "beauty", "A simple daily-care set for a refreshing skincare routine.", 749, 1199, 4.5, 28, "🧴"),
    ("Hydrating Face Wash", "GlowCare", "beauty", "Gentle gel cleanser that removes dirt without drying the skin.", 249, 399, 4.1, 70, "🧼"),
    ("Premium Notebook & Pen Combo", "PaperTrail", "books", "A clean notebook and smooth-writing pen for ideas and notes.", 299, 499, 4.8, 90, "📓"),
    ("Yoga Mat — Anti-Slip", "MoveWell", "sports", "Textured yoga mat for stretching and home workouts.", 599, 999, 4.6, 45, "🧘"),
    ("Adjustable Dumbbell Pair", "MoveWell", "sports", "Quick-change weights for strength training at home.", 1499, 2499, 4.4, 15, "🏋️"),
    ("Basmati Rice 5 kg", "FarmFresh", "grocery", "Long-grain aromatic basmati rice, sourced from farms.", 549, 650, 4.5, 100, "🍚"),
    ("Organic Honey 500 g", "FarmFresh", "grocery", "Pure, unprocessed honey with a natural floral taste.", 329, 420, 4.7, 60, "🍯"),
]


def create_database():
    conn = get_raw_connection()
    cur = conn.cursor()
    cur.execute(
        f"CREATE DATABASE IF NOT EXISTS `{Config.DB_NAME}` "
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    cur.close()
    conn.close()


def run_schema():
    """Execute schema.sql statement by statement (skipping the CREATE DATABASE/USE lines)."""
    with open(os.path.join(HERE, "schema.sql"), encoding="utf-8") as fh:
        script = fh.read()
    conn = get_raw_connection()
    conn.database = Config.DB_NAME
    cur = conn.cursor()
    for statement in script.split(";"):
        lines = [ln for ln in statement.splitlines() if not ln.strip().startswith("--")]
        sql = "\n".join(lines).strip()
        if not sql or sql.upper().startswith(("CREATE DATABASE", "USE ")):
            continue
        cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()


def seed():
    if not fetch_one("SELECT id FROM users WHERE role = 'admin' LIMIT 1"):
        execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, 'admin')",
            (Config.ADMIN_NAME, Config.ADMIN_EMAIL.lower(), generate_password_hash(Config.ADMIN_PASSWORD)),
        )
        print(f"Created admin account: {Config.ADMIN_EMAIL}")

    for name, slug, icon in CATEGORIES:
        if not fetch_one("SELECT id FROM categories WHERE slug = %s", (slug,)):
            execute("INSERT INTO categories (name, slug, icon) VALUES (%s, %s, %s)", (name, slug, icon))

    if not fetch_one("SELECT id FROM products LIMIT 1"):
        for name, brand, slug, desc, price, original, rating, stock, emoji in PRODUCTS:
            cat = fetch_one("SELECT id FROM categories WHERE slug = %s", (slug,))
            execute(
                """INSERT INTO products (name, brand, category_id, description, price,
                   original_price, rating, stock, emoji) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (name, brand, cat["id"], desc, price, original, rating, stock, emoji),
            )
        print(f"Inserted {len(PRODUCTS)} sample products.")

    if not fetch_one("SELECT id FROM coupons WHERE code = 'SNAP10'"):
        execute(
            "INSERT INTO coupons (code, discount_type, value, max_discount, min_order) VALUES ('SNAP10','percent',10,200,499)"
        )
        execute(
            "INSERT INTO coupons (code, discount_type, value, max_discount, min_order) VALUES ('FLAT100','flat',100,NULL,999)"
        )


if __name__ == "__main__":
    create_database()
    run_schema()
    seed()
    print("Database ready.")
