CREATE TABLE buffet_post_refs (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL CHECK (origin IN ('source_feed', 'manual'))
);

INSERT INTO buffet_post_refs (id, public_id, origin)
SELECT id, lower(hex(randomblob(16))), 'source_feed' FROM buffet_posts;

CREATE TRIGGER buffet_posts_require_matching_reference
BEFORE INSERT ON buffet_posts
WHEN EXISTS (SELECT 1 FROM buffet_post_refs WHERE id = NEW.id) AND NOT EXISTS (
  SELECT 1 FROM buffet_post_refs
  WHERE id = NEW.id AND origin = CASE WHEN NEW.source_feed_id = 'sharenus-manual-v1' THEN 'manual' ELSE 'source_feed' END
)
BEGIN SELECT RAISE(ABORT, 'Buffet Post origin does not match its canonical reference'); END;

CREATE TRIGGER buffet_posts_ensure_reference
AFTER INSERT ON buffet_posts
BEGIN
  INSERT OR IGNORE INTO buffet_post_refs (id, public_id, origin)
  VALUES (
    NEW.id,
    lower(hex(randomblob(16))),
    CASE WHEN NEW.source_feed_id = 'sharenus-manual-v1' THEN 'manual' ELSE 'source_feed' END
  );
END;

CREATE TRIGGER buffet_posts_identity_no_update
BEFORE UPDATE OF id, source_feed_id ON buffet_posts
BEGIN SELECT RAISE(ABORT, 'Buffet Post identity is immutable'); END;

CREATE TRIGGER buffet_post_refs_no_update
BEFORE UPDATE ON buffet_post_refs
BEGIN SELECT RAISE(ABORT, 'Buffet Post references are immutable'); END;

CREATE TABLE manual_buffet_posts (
  id TEXT PRIMARY KEY REFERENCES buffet_post_refs(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reported_location TEXT NOT NULL,
  zone_id TEXT,
  collection_deadline TEXT NOT NULL,
  created_by_participant_id TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT NOT NULL,
  deleted_by_participant_id TEXT REFERENCES participants(id),
  deleted_at TEXT,
  deletion_reason TEXT,
  CHECK (zone_id IS NULL OR zone_id IN (
    'utown', 'museum-ucc', 'cde', 'central', 'fass', 'business', 'computing', 'pgp', 'science', 'medicine-kent-ridge'
  )),
  CHECK (
    (deleted_at IS NULL AND deleted_by_participant_id IS NULL AND deletion_reason IS NULL) OR
    (deleted_at IS NOT NULL AND deleted_by_participant_id IS NOT NULL AND deletion_reason IS NOT NULL)
  )
);

CREATE INDEX manual_buffet_posts_visible
ON manual_buffet_posts(deleted_at, collection_deadline, created_at);

CREATE TRIGGER manual_buffet_posts_require_manual_origin
BEFORE INSERT ON manual_buffet_posts
WHEN (SELECT origin FROM buffet_post_refs WHERE id = NEW.id) IS NOT 'manual'
BEGIN SELECT RAISE(ABORT, 'Manual Buffet Post requires a manual canonical reference'); END;

CREATE TRIGGER manual_buffet_posts_id_no_update
BEFORE UPDATE OF id ON manual_buffet_posts
BEGIN SELECT RAISE(ABORT, 'Manual Buffet Post identity is immutable'); END;

CREATE TRIGGER manual_buffet_compatibility_no_delete
BEFORE DELETE ON buffet_posts
WHEN OLD.source_feed_id = 'sharenus-manual-v1'
  AND EXISTS (SELECT 1 FROM manual_buffet_posts WHERE id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Manual Buffet compatibility record is still in use'); END;

CREATE TRIGGER buffet_post_refs_protect_children
BEFORE DELETE ON buffet_post_refs
WHEN EXISTS (SELECT 1 FROM buffet_posts WHERE id = OLD.id)
  OR EXISTS (SELECT 1 FROM manual_buffet_posts WHERE id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Buffet Post reference is still in use'); END;
