# Snap Cart — E-commerce website

A Flipkart-style shopping site with a blue-and-white theme.

- **Frontend:** HTML5, CSS3, vanilla JavaScript (`frontend/`)
- **Backend:** Python Flask, JSON API (`backend/`)
- **Database:** MySQL 8 (schema in `backend/schema.sql`)
- **Charts:** Chart.js on the admin dashboard

## Features

| Area | What's included |
|---|---|
| Home | Hero + promo banners, category bar, search, brand / price / rating / discount filters, sorting |
| Product | Image or emoji, brand, original and selling price, discount %, rating, stock, description, quantity picker, Add to cart, Buy now, Wishlist |
| Cart | Add, remove, change quantity (max 10), live subtotal, coupon codes, delivery fee (free above ₹499), final total |
| Wishlist | Saved in the browser, shown with live product details |
| Accounts | Signup, login, logout, profile editing, order history |
| Checkout | Address form, Cash on Delivery or UPI, order summary, confirmation, order number |
| Orders | Tracking timeline with status steps, customer cancellation (restores stock) |
| Admin | Dashboard with stats and charts, add/edit/delete products, manage categories, view orders and update status, customer list |

All prices, discounts, delivery fees and stock checks are calculated on the server. The browser cannot change a price.

## Project layout

```
snap-cart/
├── backend/
│   ├── app.py            Flask app, serves the API and the frontend
│   ├── config.py         Settings read from .env
│   ├── db.py             MySQL connection pool and helpers
│   ├── utils.py          Auth decorators, validation regexes, serializers
│   ├── schema.sql        Database tables
│   ├── init_db.py        Creates the DB, admin account and sample data
│   ├── requirements.txt
│   ├── .env.example
│   └── routes/
│       ├── auth.py       /api/auth/*  (signup, login, logout, me, profile)
│       ├── shop.py       /api/products, /api/categories, /api/brands
│       ├── orders.py     /api/cart/summary, /api/orders, coupons
│       └── admin.py      /api/admin/*  (admin only)
└── frontend/
    ├── index.html        Home / product listing
    ├── product.html      Product details
    ├── cart.html         Cart
    ├── checkout.html     Checkout and order confirmation
    ├── login.html        Login and signup
    ├── profile.html      Profile and order history
    ├── order.html        Order tracking
    ├── wishlist.html     Wishlist
    ├── admin.html        Admin dashboard
    ├── css/style.css     Shared styles
    └── js/
        ├── api.js        fetch wrapper
        ├── store.js      Cart and wishlist (localStorage)
        ├── components.js Header, footer, product card, toast, route guards
        └── *.js          One script per page
```

## Setup in VS Code (step by step)

### 1. Install the tools

1. **Python 3.10+**: https://www.python.org/downloads/ (tick "Add Python to PATH" on Windows).
2. **MySQL 8**: https://dev.mysql.com/downloads/mysql/ (or XAMPP / MySQL Workbench).
   Note the root password you set during installation.
3. **VS Code**: https://code.visualstudio.com/ and install the **Python** extension.

### 2. Open the project

1. Unzip the project, then in VS Code choose **File → Open Folder…** and pick `snap-cart`.
2. Open the terminal with **Terminal → New Terminal** (`` Ctrl+` ``).

### 3. Create a virtual environment and install packages

Windows (PowerShell):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS / Linux:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

In VS Code, press `Ctrl+Shift+P` → **Python: Select Interpreter** → pick the `.venv` one.

### 4. Configure environment variables

Copy `.env.example` to `.env` in the `backend` folder and edit it:

```
SECRET_KEY=any-long-random-text
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-root-password
DB_NAME=snapcart
ADMIN_EMAIL=admin@snapcart.com
ADMIN_PASSWORD=Admin@12345
```

`.env` holds secrets, so don't commit it to Git.

### 5. Create the database and sample data

With the venv active, from the `backend` folder:
```bash
python init_db.py
```
You should see `Inserted 17 sample products.` and `Database ready.`
The script can be run again safely.

### 6. Run the server

```bash
python app.py
```

Open **http://localhost:5000** in your browser.

- Shop: http://localhost:5000
- Admin: log in with the admin email and password from `.env`, then open http://localhost:5000/admin.html

Admin accounts are created by `init_db.py`. Customers sign up from the site.

### 7. Try the coupon codes

- `SNAP10`: 10% off, capped at ₹200, for orders of ₹499 or more.
- `FLAT100`: ₹100 off, for orders of ₹999 or more.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Access denied for user 'root'` | Check `DB_PASSWORD` in `.env`. |
| `Can't connect to MySQL server` | Start the MySQL service (Windows: `services.msc`, MySQL80). |
| `ModuleNotFoundError` | Activate `.venv` and run `pip install -r requirements.txt`. |
| Charts don't appear | Chart.js loads from a CDN, so you need an internet connection. |
| Login works but cart resets | Keep the site on one address (localhost:5000). Browsers keep localStorage per origin. |

## Production notes

- Set `debug=False` and a strong `SECRET_KEY`, and serve behind gunicorn plus nginx.
- Real payments need a gateway such as Razorpay. The UPI screen here only records the UPI ID.
- Add email verification and password reset before going live.
