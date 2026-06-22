-- Personalised Web layout: remembered, normalised [0,1] node positions per item.
CREATE TABLE IF NOT EXISTS node_positions (
  catalog_id INTEGER PRIMARY KEY,
  nx REAL NOT NULL,
  ny REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
