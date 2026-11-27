import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "snapcart")

    ADMIN_NAME = os.getenv("ADMIN_NAME", "Snap Admin")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@snapcart.com")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@12345")

    # Business rules (kept on the server so the browser cannot change them)
    FREE_DELIVERY_ABOVE = 499
    DELIVERY_FEE = 49
    MAX_QTY_PER_ITEM = 10
