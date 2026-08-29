CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_type TEXT NOT NULL,
  post_id TEXT NOT NULL,
  parent_comment_id TEXT REFERENCES comments(id),
  author_participant_id TEXT NOT NULL REFERENCES participants(id),
  body TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (parent_comment_id IS NULL OR parent_comment_id <> id)
);

CREATE INDEX IF NOT EXISTS comments_by_post
ON comments(post_type, post_id, created_at, id);

CREATE TRIGGER IF NOT EXISTS comments_one_reply_level_insert
BEFORE INSERT ON comments
WHEN NEW.parent_comment_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM comments parent
  WHERE parent.id = NEW.parent_comment_id
    AND parent.parent_comment_id IS NULL
    AND parent.post_type = NEW.post_type
    AND parent.post_id = NEW.post_id
)
BEGIN
  SELECT RAISE(ABORT, 'Comments support one reply level');
END;

CREATE TRIGGER IF NOT EXISTS comments_one_reply_level_update
BEFORE UPDATE OF parent_comment_id, post_type, post_id ON comments
WHEN NEW.parent_comment_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM comments parent
  WHERE parent.id = NEW.parent_comment_id
    AND parent.parent_comment_id IS NULL
    AND parent.post_type = NEW.post_type
    AND parent.post_id = NEW.post_id
)
BEGIN
  SELECT RAISE(ABORT, 'Comments support one reply level');
END;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  type TEXT NOT NULL CHECK (type IN ('reply_received', 'comment_moderated', 'report_resolved')),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_by_participant
ON notifications(participant_id, created_at DESC, id DESC);
