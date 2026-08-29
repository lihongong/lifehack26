CREATE TABLE IF NOT EXISTS manual_marketplace_listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Study', 'Room & Living', 'Transport', 'Electronics')),
  price INTEGER NOT NULL CHECK (price >= 0 AND price <= 100000),
  description TEXT NOT NULL,
  image_url TEXT,
  image_alt TEXT,
  created_by_participant_id TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_by_participant_id TEXT REFERENCES participants(id),
  deleted_at TEXT,
  deletion_reason TEXT,
  CHECK ((image_url IS NULL AND image_alt IS NULL) OR (image_url IS NOT NULL AND image_alt IS NOT NULL)),
  CHECK (
    (deleted_at IS NULL AND deleted_by_participant_id IS NULL AND deletion_reason IS NULL) OR
    (deleted_at IS NOT NULL AND deleted_by_participant_id IS NOT NULL AND deletion_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS manual_marketplace_listings_visible
ON manual_marketplace_listings(deleted_at, expires_at, created_at);
