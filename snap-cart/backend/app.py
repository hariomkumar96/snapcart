"""Snap Cart Flask application.

- JSON API lives under /api/...
- The frontend (HTML/CSS/JS) is served from ../frontend, so the browser
  talks to the same origin and no CORS setup is needed.
"""
import os

from flask import Flask, jsonify, request, send_from_directory

from config import Config

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))


def create_app():
    app = Flask(__name__, static_folder=None)
    app.config.from_object(Config)
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )

    from routes.auth import bp as auth_bp
    from routes.shop import bp as shop_bp
    from routes.orders import bp as orders_bp
    from routes.admin import bp as admin_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(shop_bp, url_prefix="/api")
    app.register_blueprint(orders_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")

    @app.errorhandler(404)
    def not_found(_):
        if request.path.startswith("/api/"):
            return jsonify(error="Not found."), 404
        return "Not found", 404

    @app.errorhandler(405)
    def not_allowed(_):
        return jsonify(error="Method not allowed."), 405

    @app.errorhandler(500)
    def server_error(_):
        return jsonify(error="Something went wrong on the server."), 500

    @app.route("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.route("/<path:filename>")
    def frontend(filename):
        return send_from_directory(FRONTEND_DIR, filename)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
