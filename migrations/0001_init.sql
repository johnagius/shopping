-- Catalog of every distinct product ever seen (from imports or manual adds).
-- Powers reorder / reselect and remembers last price & shop.
CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  norm_name TEXT NOT NULL UNIQUE,
  category TEXT,
  last_price REAL,
  last_shop TEXT,
  last_ordered_at TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The current shopping list.
CREATE TABLE IF NOT EXISTS shopping_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  norm_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  checked INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  catalog_id INTEGER REFERENCES catalog_items(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Imported orders (e.g. from a pasted Wolt receipt).
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_name TEXT,
  shop_address TEXT,
  order_number TEXT,
  wolt_order_id TEXT,
  placed_at TEXT,
  delivered_at TEXT,
  delivery_address TEXT,
  subtotal REAL,
  service_fee REAL,
  delivery_fee REAL,
  bag_charge REAL,
  total REAL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  raw_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  norm_name TEXT NOT NULL,
  unit_price REAL,
  quantity INTEGER NOT NULL DEFAULT 1,
  line_total REAL,
  substitution_for TEXT,
  is_fee INTEGER NOT NULL DEFAULT 0,
  catalog_id INTEGER REFERENCES catalog_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_shopping_checked ON shopping_list(checked);
CREATE INDEX IF NOT EXISTS idx_catalog_count ON catalog_items(order_count DESC);
