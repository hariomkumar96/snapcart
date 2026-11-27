"""MySQL connection pool and small query helpers."""

from contextlib import contextmanager
import threading

import mysql.connector
from mysql.connector import pooling

from config import Config

_pool = None
_pool_lock = threading.Lock()


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = pooling.MySQLConnectionPool(
                    pool_name="snapcart_pool",
                    pool_size=5,
                    pool_reset_session=True,
                    host=Config.DB_HOST,
                    port=Config.DB_PORT,
                    user=Config.DB_USER,
                    password=Config.DB_PASSWORD,
                    database=Config.DB_NAME,
                    charset="utf8mb4",
                )
    return _pool


def _get_connection():
    """Fetch a pooled connection and ensure it is still alive."""
    conn = _get_pool().get_connection()
    conn.ping(reconnect=True, attempts=3, delay=1)
    return conn


def get_raw_connection():
    """Used by init_db.py, which may need to create the database first."""
    return mysql.connector.connect(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        charset="utf8mb4",
    )


def fetch_all(sql, params=()):
    conn = _get_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


def fetch_one(sql, params=()):
    conn = _get_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(sql, params)
        return cur.fetchone()
    finally:
        cur.close()
        conn.close()


def execute(sql, params=()):
    """Run a single write statement and return the new row id."""
    conn = _get_connection()
    cur = conn.cursor()
    try:
        cur.execute(sql, params)
        conn.commit()
        return cur.lastrowid
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@contextmanager
def transaction():
    """Yield a dictionary cursor inside one transaction."""
    conn = _get_connection()
    cur = conn.cursor(dictionary=True)
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
