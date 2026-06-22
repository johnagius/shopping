-- "Added to cart" marks for the Order board (the current shopping run).
-- Separate from catalog_items so Reset is a simple wipe.
CREATE TABLE IF NOT EXISTS board_marks (
  catalog_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
