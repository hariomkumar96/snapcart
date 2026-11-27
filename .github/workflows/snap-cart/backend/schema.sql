-- Snap Cart database schema (MySQL 8.0+ / MariaDB 10.5+)
-- init_db.py runs this file and then seeds the sample data.

CREATE DATABASE IF NOT EXISTS snapcart
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE snapcart;

CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  email           VARCHAR(150)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255)  NOT NULL,
  phone           VARCHAR(15)   NULL,
  role            ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60)  NOT NULL UNIQUE,
  slug        VARCHAR(60)  NOT NULL UNIQUE,
  icon        VARCHAR(10)  NOT NULL DEFAULT '🛍️'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200)  NOT NULL,
  brand           VARCHAR(100)  NOT NULL,
  category_id     INT           NOT NULL,
  description     TEXT          NULL,
  price           DECIMAL(10,2) NOT NULL,
  original_price  DECIMAL(10,2) NOT NULL,
  rating          DECIMAL(2,1)  NOT NULL DEFAULT 0.0,
  stock           INT           NOT NULL DEFAULT 0,
  emoji           VARCHAR(10)   NOT NULL DEFAULT '📦',
  image_url       VARCHAR(500)  NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_price CHECK (price > 0),
  CONSTRAINT chk_stock CHECK (stock >= 0),
  INDEX idx_products_brand (brand),
  INDEX idx_products_price (price)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupons (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(30)   NOT NULL UNIQUE,
  discount_type ENUM('percent','flat') NOT NULL,
  value         DECIMAL(10,2) NOT NULL,
  max_discount  DECIMAL(10,2) NULL,
  min_order     DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  order_code      VARCHAR(20)   NOT NULL UNIQUE,
  user_id         INT           NOT NULL,
  full_name       VARCHAR(100)  NOT NULL,
  phone           VARCHAR(15)   NOT NULL,
  address         VARCHAR(500)  NOT NULL,
  pincode         VARCHAR(6)    NOT NULL,
  payment_method  ENUM('COD','UPI') NOT NULL,
  upi_id          VARCHAR(100)  NULL,
  coupon_code     VARCHAR(30)   NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  discount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL,
  status          ENUM('Placed','Packed','Shipped','Out for Delivery','Delivered','Cancelled')
                  NOT NULL DEFAULT 'Placed',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_orders_created (created_at),
  INDEX idx_orders_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT           NOT NULL,
  product_id    INT           NULL,
  product_name  VARCHAR(200)  NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,
  qty           INT           NOT NULL,
  line_total    DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_status_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT          NOT NULL,
  status      VARCHAR(30)  NOT NULL,
  note        VARCHAR(255) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
