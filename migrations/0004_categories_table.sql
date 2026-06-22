-- User-manageable categories (aisles), so custom ones persist in the DB.
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed with the built-in aisles. "Other" stays last (high sort_order) so
-- custom categories slot in before it.
INSERT OR IGNORE INTO categories (name, sort_order) VALUES
  ('Fruit & Veg', 10),
  ('Bakery', 20),
  ('Dairy & Eggs', 30),
  ('Meat & Fish', 40),
  ('Frozen', 50),
  ('Pantry', 60),
  ('Snacks & Sweets', 70),
  ('Drinks', 80),
  ('Household & Cleaning', 90),
  ('Other', 999);
