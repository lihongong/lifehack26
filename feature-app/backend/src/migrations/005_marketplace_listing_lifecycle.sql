CREATE TABLE IF NOT EXISTS marketplace_listing_lifecycle (
  listing_id TEXT PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  expiry_basis TEXT NOT NULL CHECK (expiry_basis IN ('default_30_days')),
  source_revision_at TEXT NOT NULL
);

INSERT OR IGNORE INTO marketplace_listing_lifecycle (listing_id, expires_at, expiry_basis, source_revision_at)
SELECT id, strftime('%Y-%m-%dT%H:%M:%fZ', source_updated_at, '+30 days'), 'default_30_days', source_updated_at
FROM marketplace_listings;
