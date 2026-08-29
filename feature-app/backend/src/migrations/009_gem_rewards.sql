DROP INDEX IF EXISTS gem_source_reward_once;

CREATE UNIQUE INDEX IF NOT EXISTS gem_participant_source_reward_once
ON gem_ledger(participant_id, reason, source_type, source_id)
WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketplace_sales (
  listing_id TEXT PRIMARY KEY REFERENCES marketplace_listings(id),
  buyer_participant_id TEXT NOT NULL REFERENCES participants(id),
  seller_participant_id TEXT NOT NULL REFERENCES participants(id),
  sold_at TEXT NOT NULL
);
