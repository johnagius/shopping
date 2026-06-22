-- Item tier for building orders: Essential / Nice to have / One off.
ALTER TABLE catalog_items ADD COLUMN tier TEXT NOT NULL DEFAULT 'One off';
