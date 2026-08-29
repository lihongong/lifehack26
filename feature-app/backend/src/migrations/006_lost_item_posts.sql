DROP INDEX IF EXISTS content_reports_by_target;
ALTER TABLE content_reports RENAME TO content_reports_before_lost_items;

CREATE TABLE content_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('marketplace_listing', 'lost_item_post', 'comment')),
  target_id TEXT NOT NULL,
  target_post_id TEXT NOT NULL,
  reporter_participant_id TEXT NOT NULL REFERENCES participants(id),
  category TEXT NOT NULL CHECK (category IN ('fraud', 'safety', 'privacy', 'staleness')),
  evidence_label TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO content_reports
SELECT * FROM content_reports_before_lost_items;

DROP TABLE content_reports_before_lost_items;

CREATE INDEX content_reports_by_target
ON content_reports(target_type, target_id, created_at, id);

CREATE TABLE IF NOT EXISTS lost_item_posts (
  id TEXT PRIMARY KEY,
  author_participant_id TEXT NOT NULL REFERENCES participants(id),
  category TEXT NOT NULL CHECK (category IN (
    'Electronics', 'Wallets & Cards', 'Keys', 'Bags', 'Clothing', 'Accessories', 'Documents', 'Other'
  )),
  lost_date TEXT NOT NULL,
  nus_zone_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'rejected', 'published', 'withdrawn')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  fictional INTEGER NOT NULL DEFAULT 0 CHECK (fictional IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  withdrawn_at TEXT
);

CREATE INDEX IF NOT EXISTS lost_item_posts_public
ON lost_item_posts(status, lost_date DESC, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS lost_item_posts_by_author
ON lost_item_posts(author_participant_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS lost_item_private_payloads (
  post_id TEXT PRIMARY KEY REFERENCES lost_item_posts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  key_version TEXT NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  authentication_tag BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS lost_item_photos (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES lost_item_posts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  key_version TEXT NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  authentication_tag BLOB NOT NULL,
  UNIQUE(post_id, ordinal)
);

CREATE TABLE IF NOT EXISTS lost_item_reviews (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES lost_item_posts(id),
  revision INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('publish', 'reject')),
  public_description TEXT,
  moderator_participant_id TEXT NOT NULL REFERENCES participants(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(post_id, revision)
);

CREATE TABLE IF NOT EXISTS lost_item_review_photos (
  review_id TEXT NOT NULL REFERENCES lost_item_reviews(id),
  photo_id TEXT NOT NULL REFERENCES lost_item_photos(id),
  PRIMARY KEY(review_id, photo_id)
);

CREATE TABLE IF NOT EXISTS lost_item_moderation (
  post_id TEXT PRIMARY KEY REFERENCES lost_item_posts(id),
  hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
  reason TEXT NOT NULL,
  updated_by_participant_id TEXT NOT NULL REFERENCES participants(id),
  updated_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS lost_item_reviews_no_update
BEFORE UPDATE ON lost_item_reviews BEGIN SELECT RAISE(ABORT, 'lost item reviews are immutable'); END;
CREATE TRIGGER IF NOT EXISTS lost_item_reviews_no_delete
BEFORE DELETE ON lost_item_reviews BEGIN SELECT RAISE(ABORT, 'lost item reviews are immutable'); END;
CREATE TRIGGER IF NOT EXISTS lost_item_review_photos_no_update
BEFORE UPDATE ON lost_item_review_photos BEGIN SELECT RAISE(ABORT, 'lost item review photos are immutable'); END;
CREATE TRIGGER IF NOT EXISTS lost_item_review_photos_no_delete
BEFORE DELETE ON lost_item_review_photos BEGIN SELECT RAISE(ABORT, 'lost item review photos are immutable'); END;
