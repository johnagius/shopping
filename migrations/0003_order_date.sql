-- Store a normalised ISO purchase date so we can compute how often you buy
-- each item (restock cadence). Backfilled from created_at for existing rows.
ALTER TABLE orders ADD COLUMN ordered_on TEXT;
UPDATE orders SET ordered_on = substr(created_at, 1, 10) WHERE ordered_on IS NULL;
