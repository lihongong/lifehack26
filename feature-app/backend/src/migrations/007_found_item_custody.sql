DROP TRIGGER IF EXISTS gem_ledger_no_update;
DROP TRIGGER IF EXISTS gem_ledger_no_delete;
DROP INDEX IF EXISTS gem_daily_login_once;
DROP INDEX IF EXISTS gem_source_reward_once;
ALTER TABLE gem_ledger RENAME TO gem_ledger_before_custody;

CREATE TABLE gem_ledger (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  singapore_date TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  CHECK ((source_type IS NULL) = (source_id IS NULL))
);

INSERT INTO gem_ledger (id, participant_id, amount, reason, singapore_date, created_at)
SELECT id, participant_id, amount, reason, singapore_date, created_at
FROM gem_ledger_before_custody;
DROP TABLE gem_ledger_before_custody;

CREATE UNIQUE INDEX IF NOT EXISTS gem_daily_login_once
ON gem_ledger(participant_id, reason, singapore_date)
WHERE reason = 'DAILY_LOGIN';
CREATE UNIQUE INDEX IF NOT EXISTS gem_source_reward_once
ON gem_ledger(reason, source_type, source_id)
WHERE source_id IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS gem_ledger_no_update
BEFORE UPDATE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END;
CREATE TRIGGER IF NOT EXISTS gem_ledger_no_delete
BEFORE DELETE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END;

DROP INDEX IF EXISTS content_reports_by_target;
ALTER TABLE content_reports RENAME TO content_reports_before_found_items;
CREATE TABLE content_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'marketplace_listing', 'lost_item_post', 'found_item_report', 'found_item', 'comment'
  )),
  target_id TEXT NOT NULL,
  target_post_id TEXT NOT NULL,
  reporter_participant_id TEXT NOT NULL REFERENCES participants(id),
  category TEXT NOT NULL CHECK (category IN ('fraud', 'safety', 'privacy', 'staleness')),
  evidence_label TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO content_reports SELECT * FROM content_reports_before_found_items;
DROP TABLE content_reports_before_found_items;
CREATE INDEX content_reports_by_target ON content_reports(target_type, target_id, created_at, id);

CREATE TABLE IF NOT EXISTS custody_settings (
  id TEXT PRIMARY KEY CHECK (id = 'custody'),
  procedure_approved INTEGER NOT NULL CHECK (procedure_approved IN (0, 1)),
  procedure_evidence_reference TEXT,
  custody_enabled INTEGER NOT NULL CHECK (custody_enabled IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_by_participant_id TEXT REFERENCES participants(id),
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO custody_settings VALUES ('custody', 0, NULL, 0, 1, NULL, '2026-08-29T00:00:00Z');

CREATE TABLE IF NOT EXISTS custody_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nus_zone_id TEXT NOT NULL,
  default_instructions TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  fictional INTEGER NOT NULL DEFAULT 0 CHECK (fictional IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_by_participant_id TEXT REFERENCES participants(id),
  updated_by_participant_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS custody_locations_active ON custody_locations(active, name, id);

CREATE TABLE IF NOT EXISTS found_item_reports (
  id TEXT PRIMARY KEY,
  author_participant_id TEXT NOT NULL REFERENCES participants(id),
  category TEXT NOT NULL CHECK (category IN (
    'Electronics', 'Wallets & Cards', 'Keys', 'Bags', 'Clothing', 'Accessories', 'Documents', 'Other'
  )),
  found_date TEXT NOT NULL,
  nus_zone_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending_review', 'rejected', 'approved', 'handover_arranged', 'withdrawn', 'closed', 'received'
  )),
  revision INTEGER NOT NULL CHECK (revision > 0),
  fictional INTEGER NOT NULL DEFAULT 0 CHECK (fictional IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  withdrawn_at TEXT
);
CREATE INDEX IF NOT EXISTS found_item_reports_by_status ON found_item_reports(status, updated_at, id);
CREATE INDEX IF NOT EXISTS found_item_reports_by_author ON found_item_reports(author_participant_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS found_item_report_private_payloads (
  report_id TEXT PRIMARY KEY REFERENCES found_item_reports(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  key_version TEXT NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  authentication_tag BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS found_item_report_photos (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES found_item_reports(id) ON DELETE CASCADE,
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
  UNIQUE(report_id, ordinal)
);

CREATE TABLE IF NOT EXISTS found_item_report_reviews (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES found_item_reports(id),
  revision INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  public_category TEXT,
  public_found_date TEXT,
  public_nus_zone_id TEXT,
  public_description TEXT,
  moderator_participant_id TEXT NOT NULL REFERENCES participants(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(report_id, revision)
);

CREATE TABLE IF NOT EXISTS found_item_report_review_photos (
  review_id TEXT NOT NULL REFERENCES found_item_report_reviews(id),
  photo_id TEXT NOT NULL REFERENCES found_item_report_photos(id),
  PRIMARY KEY(review_id, photo_id)
);

CREATE TABLE IF NOT EXISTS found_item_report_closures (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES found_item_reports(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('abandoned', 'otherwise_closed')),
  moderator_participant_id TEXT NOT NULL REFERENCES participants(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS found_item_handover_appointments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES found_item_reports(id),
  report_revision INTEGER NOT NULL,
  custody_location_id TEXT NOT NULL REFERENCES custody_locations(id),
  location_name_snapshot TEXT NOT NULL,
  nus_zone_id_snapshot TEXT NOT NULL,
  instructions_snapshot TEXT NOT NULL,
  appointment_at TEXT NOT NULL,
  moderator_participant_id TEXT NOT NULL REFERENCES participants(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(report_id, report_revision)
);
CREATE INDEX IF NOT EXISTS found_item_appointments_latest ON found_item_handover_appointments(report_id, report_revision DESC);

CREATE TABLE IF NOT EXISTS found_items (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES found_item_reports(id),
  category TEXT NOT NULL,
  found_date TEXT NOT NULL,
  nus_zone_id TEXT NOT NULL,
  public_description TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('good', 'fair', 'damaged', 'unknown')),
  custodian_participant_id TEXT NOT NULL REFERENCES participants(id),
  reason TEXT NOT NULL,
  fictional INTEGER NOT NULL DEFAULT 0 CHECK (fictional IN (0, 1)),
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS found_items_public ON found_items(received_at DESC, id);

CREATE TABLE IF NOT EXISTS found_item_private_evidence (
  found_item_id TEXT PRIMARY KEY REFERENCES found_items(id),
  source_report_revision INTEGER NOT NULL,
  key_version TEXT NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  authentication_tag BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS found_item_photos (
  found_item_id TEXT NOT NULL REFERENCES found_items(id),
  photo_id TEXT NOT NULL REFERENCES found_item_report_photos(id),
  ordinal INTEGER NOT NULL,
  PRIMARY KEY(found_item_id, photo_id)
);

CREATE TABLE IF NOT EXISTS found_property_moderation (
  target_type TEXT NOT NULL CHECK (target_type IN ('found_item_report', 'found_item')),
  target_id TEXT NOT NULL,
  hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
  reason TEXT NOT NULL,
  updated_by_participant_id TEXT NOT NULL REFERENCES participants(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(target_type, target_id)
);

CREATE TRIGGER IF NOT EXISTS found_item_reviews_no_update BEFORE UPDATE ON found_item_report_reviews BEGIN SELECT RAISE(ABORT, 'found item reviews are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_reviews_no_delete BEFORE DELETE ON found_item_report_reviews BEGIN SELECT RAISE(ABORT, 'found item reviews are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_review_photos_no_update BEFORE UPDATE ON found_item_report_review_photos BEGIN SELECT RAISE(ABORT, 'found item review photos are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_review_photos_no_delete BEFORE DELETE ON found_item_report_review_photos BEGIN SELECT RAISE(ABORT, 'found item review photos are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_closures_no_update BEFORE UPDATE ON found_item_report_closures BEGIN SELECT RAISE(ABORT, 'found item closures are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_closures_no_delete BEFORE DELETE ON found_item_report_closures BEGIN SELECT RAISE(ABORT, 'found item closures are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_appointments_no_update BEFORE UPDATE ON found_item_handover_appointments BEGIN SELECT RAISE(ABORT, 'found item appointments are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_appointments_no_delete BEFORE DELETE ON found_item_handover_appointments BEGIN SELECT RAISE(ABORT, 'found item appointments are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_items_no_update BEFORE UPDATE ON found_items BEGIN SELECT RAISE(ABORT, 'found items are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_items_no_delete BEFORE DELETE ON found_items BEGIN SELECT RAISE(ABORT, 'found items are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_private_evidence_no_update BEFORE UPDATE ON found_item_private_evidence BEGIN SELECT RAISE(ABORT, 'found item private evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_private_evidence_no_delete BEFORE DELETE ON found_item_private_evidence BEGIN SELECT RAISE(ABORT, 'found item private evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_photos_no_update BEFORE UPDATE ON found_item_photos BEGIN SELECT RAISE(ABORT, 'found item photos are immutable'); END;
CREATE TRIGGER IF NOT EXISTS found_item_photos_no_delete BEFORE DELETE ON found_item_photos BEGIN SELECT RAISE(ABORT, 'found item photos are immutable'); END;
