-- Track whether an item has been classified, so freshly imported items can be
-- surfaced for review. Existing items are treated as already handled.
ALTER TABLE catalog_items ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0;
UPDATE catalog_items SET reviewed = 1;
