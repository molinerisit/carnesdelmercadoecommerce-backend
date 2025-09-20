CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'ADMIN',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  price       INTEGER NOT NULL,
  unit        TEXT NOT NULL,
  image_url   TEXT,
  stock       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING',
  customer    TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  total_cents INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at     TEXT,
  user_id     TEXT,
  mp_id       TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id          TEXT PRIMARY KEY,
  quantity    INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  product_id  TEXT NOT NULL,
  order_id    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
