-- Star flag: mark an item as the cheapest place/option found to buy it.
ALTER TABLE catalog_items ADD COLUMN is_cheapest INTEGER NOT NULL DEFAULT 0;
