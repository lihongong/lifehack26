CREATE TABLE IF NOT EXISTS source_feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('telegram')),
  content_type TEXT NOT NULL CHECK (content_type IN ('marketplace')),
  permission_approved INTEGER NOT NULL DEFAULT 0 CHECK (permission_approved IN (0, 1)),
  permission_evidence_reference TEXT,
  privacy_approved INTEGER NOT NULL DEFAULT 0 CHECK (privacy_approved IN (0, 1)),
  privacy_evidence_reference TEXT,
  live_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_enabled IN (0, 1)),
  rate_limit_max INTEGER NOT NULL DEFAULT 30 CHECK (rate_limit_max > 0),
  rate_limit_window_seconds INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_window_seconds > 0),
  max_update_age_seconds INTEGER NOT NULL DEFAULT 86400 CHECK (max_update_age_seconds > 0),
  last_update_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_author_consents (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES source_feeds(id),
  author_key_hash TEXT NOT NULL,
  display_name_allowed INTEGER NOT NULL CHECK (display_name_allowed IN (0, 1)),
  contact_allowed INTEGER NOT NULL CHECK (contact_allowed IN (0, 1)),
  display_name TEXT,
  contact_url TEXT,
  evidence_reference TEXT,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  granted_by_participant_id TEXT REFERENCES participants(id),
  granted_at TEXT NOT NULL,
  withdrawn_by_participant_id TEXT REFERENCES participants(id),
  withdrawn_at TEXT,
  UNIQUE(feed_id, author_key_hash)
);

CREATE TABLE IF NOT EXISTS source_posts (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES source_feeds(id),
  source_post_key TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  author_key_hash TEXT NOT NULL,
  revision_at TEXT NOT NULL,
  source_hash TEXT,
  normalized_payload TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  divergent INTEGER NOT NULL DEFAULT 0 CHECK (divergent IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(feed_id, source_post_key)
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY,
  source_post_id TEXT NOT NULL UNIQUE REFERENCES source_posts(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  image_url TEXT,
  image_alt TEXT,
  fictional INTEGER NOT NULL DEFAULT 0 CHECK (fictional IN (0, 1)),
  source_updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_source_updates (
  feed_id TEXT NOT NULL REFERENCES source_feeds(id),
  update_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('create', 'edit', 'delete')),
  source_post_key TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'duplicate_content', 'discrepancy')),
  processed_at TEXT NOT NULL,
  PRIMARY KEY(feed_id, update_id)
);

CREATE TABLE IF NOT EXISTS source_feed_rate_windows (
  feed_id TEXT NOT NULL REFERENCES source_feeds(id),
  window_started_at TEXT NOT NULL,
  update_count INTEGER NOT NULL CHECK (update_count >= 0),
  PRIMARY KEY(feed_id, window_started_at)
);

CREATE TABLE IF NOT EXISTS source_discrepancies (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES source_feeds(id),
  source_post_key TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  discrepancy_type TEXT NOT NULL,
  incoming_event TEXT,
  redacted INTEGER NOT NULL DEFAULT 0 CHECK (redacted IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  decision TEXT CHECK (decision IN ('apply_source', 'retain_current')),
  resolution_reason TEXT,
  resolved_by_participant_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(feed_id, update_id)
);

CREATE TABLE IF NOT EXISTS source_deletion_tombstones (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES source_feeds(id),
  source_post_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  UNIQUE(feed_id, source_post_key, reason, deleted_at)
);

CREATE TRIGGER IF NOT EXISTS processed_source_updates_no_update
BEFORE UPDATE ON processed_source_updates BEGIN SELECT RAISE(ABORT, 'processed source updates are immutable'); END;
CREATE TRIGGER IF NOT EXISTS processed_source_updates_no_delete
BEFORE DELETE ON processed_source_updates BEGIN SELECT RAISE(ABORT, 'processed source updates are immutable'); END;
CREATE TRIGGER IF NOT EXISTS source_deletion_tombstones_no_update
BEFORE UPDATE ON source_deletion_tombstones BEGIN SELECT RAISE(ABORT, 'source deletion tombstones are immutable'); END;
CREATE TRIGGER IF NOT EXISTS source_deletion_tombstones_no_delete
BEFORE DELETE ON source_deletion_tombstones BEGIN SELECT RAISE(ABORT, 'source deletion tombstones are immutable'); END;

INSERT OR IGNORE INTO source_feeds (
  id, name, provider, content_type, permission_approved, privacy_approved, live_enabled,
  rate_limit_max, rate_limit_window_seconds, max_update_age_seconds, created_at, updated_at
) VALUES (
  'telegram-marketplace-demo', 'NUS Marketplace demonstration feed', 'telegram', 'marketplace', 0, 0, 0,
  30, 60, 86400, '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z'
);
