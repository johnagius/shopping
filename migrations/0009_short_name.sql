-- Optional short/generic alias for an item (e.g. "Greek Yoghurt" for
-- "Kolios Greek Yoghurt"), for copying a generic search term into Wolt.
ALTER TABLE catalog_items ADD COLUMN short_name TEXT;
