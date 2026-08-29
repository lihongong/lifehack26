ALTER TABLE participants ADD COLUMN buffet_alerts_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (buffet_alerts_enabled IN (0, 1));

UPDATE participants SET nus_zone = CASE nus_zone
  WHEN 'Kent Ridge' THEN 'medicine-kent-ridge'
  WHEN 'Bukit Timah' THEN NULL
  WHEN 'Outram' THEN NULL
  ELSE nus_zone
END, buffet_alerts_enabled = 0;

CREATE TRIGGER participant_alert_zone_insert
BEFORE INSERT ON participants
WHEN NEW.buffet_alerts_enabled = 1 AND (NEW.nus_zone IS NULL OR NEW.nus_zone NOT IN (
  'utown', 'museum-ucc', 'cde', 'central', 'fass', 'business', 'computing', 'pgp', 'science', 'medicine-kent-ridge'
))
BEGIN SELECT RAISE(ABORT, 'enabled Buffet Alerts require a canonical NUS Zone'); END;

CREATE TRIGGER participant_alert_zone_update
BEFORE UPDATE OF buffet_alerts_enabled, nus_zone ON participants
WHEN NEW.buffet_alerts_enabled = 1 AND (NEW.nus_zone IS NULL OR NEW.nus_zone NOT IN (
  'utown', 'museum-ucc', 'cde', 'central', 'fass', 'business', 'computing', 'pgp', 'science', 'medicine-kent-ridge'
))
BEGIN SELECT RAISE(ABORT, 'enabled Buffet Alerts require a canonical NUS Zone'); END;

ALTER TABLE notifications RENAME TO notifications_legacy;

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  type TEXT NOT NULL CHECK (type IN ('reply_received', 'comment_moderated', 'report_resolved', 'buffet_alert')),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO notifications SELECT * FROM notifications_legacy;
DROP TABLE notifications_legacy;
CREATE INDEX notifications_by_participant ON notifications(participant_id, created_at DESC, id DESC);

CREATE TABLE buffet_posts (
  id TEXT PRIMARY KEY,
  source_feed_id TEXT NOT NULL,
  source_post_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_time TEXT NOT NULL,
  reported_location TEXT NOT NULL,
  zone_id TEXT,
  collection_deadline TEXT,
  fictional INTEGER NOT NULL DEFAULT 0 CHECK (fictional IN (0, 1)),
  updated_at TEXT NOT NULL,
  UNIQUE(source_feed_id, source_post_id)
);

CREATE TABLE buffet_post_states (
  buffet_post_id TEXT PRIMARY KEY REFERENCES buffet_posts(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'possibly_gone', 'confirmed_expired')),
  updated_at TEXT NOT NULL
);

CREATE TABLE buffet_alerts (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  buffet_post_id TEXT NOT NULL REFERENCES buffet_posts(id),
  notification_id TEXT NOT NULL UNIQUE REFERENCES notifications(id) DEFERRABLE INITIALLY DEFERRED,
  match_type TEXT NOT NULL CHECK (match_type IN ('selected_zone', 'nearby_zone')),
  created_at TEXT NOT NULL,
  UNIQUE(participant_id, buffet_post_id)
);

CREATE INDEX buffet_alerts_by_participant ON buffet_alerts(participant_id, created_at DESC, id DESC);

CREATE TABLE buffet_food_gone_reviews (
  id TEXT PRIMARY KEY,
  buffet_post_id TEXT NOT NULL REFERENCES buffet_posts(id),
  cycle INTEGER NOT NULL CHECK (cycle > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  snapshot_title TEXT NOT NULL,
  snapshot_description TEXT NOT NULL,
  snapshot_location TEXT NOT NULL,
  snapshot_zone_id TEXT,
  snapshot_source_time TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(buffet_post_id, cycle)
);

CREATE UNIQUE INDEX one_open_buffet_review ON buffet_food_gone_reviews(buffet_post_id) WHERE status = 'open';

CREATE TABLE helpful_alert_outcomes (
  alert_id TEXT PRIMARY KEY REFERENCES buffet_alerts(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('helpful', 'food_gone')),
  review_id TEXT REFERENCES buffet_food_gone_reviews(id),
  created_at TEXT NOT NULL,
  CHECK ((outcome = 'food_gone' AND review_id IS NOT NULL) OR (outcome = 'helpful' AND review_id IS NULL))
);

CREATE TRIGGER helpful_alert_outcomes_no_update
BEFORE UPDATE ON helpful_alert_outcomes BEGIN SELECT RAISE(ABORT, 'Helpful Alert outcomes are immutable'); END;
CREATE TRIGGER helpful_alert_outcomes_no_delete
BEFORE DELETE ON helpful_alert_outcomes BEGIN SELECT RAISE(ABORT, 'Helpful Alert outcomes are immutable'); END;

CREATE TABLE buffet_review_resolutions (
  review_id TEXT PRIMARY KEY REFERENCES buffet_food_gone_reviews(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('restored', 'expired')),
  moderator_participant_id TEXT NOT NULL REFERENCES participants(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER buffet_review_resolutions_no_update
BEFORE UPDATE ON buffet_review_resolutions BEGIN SELECT RAISE(ABORT, 'Buffet review resolutions are immutable'); END;
CREATE TRIGGER buffet_review_resolutions_no_delete
BEFORE DELETE ON buffet_review_resolutions BEGIN SELECT RAISE(ABORT, 'Buffet review resolutions are immutable'); END;
