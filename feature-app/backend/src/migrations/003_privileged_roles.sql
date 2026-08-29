CREATE TABLE IF NOT EXISTS privileged_roles (
  participant_id TEXT PRIMARY KEY REFERENCES participants(id),
  role TEXT NOT NULL CHECK (role IN ('platform_operator', 'moderator')),
  granted_by_participant_id TEXT NOT NULL REFERENCES participants(id),
  granted_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS one_platform_operator
ON privileged_roles(role) WHERE role = 'platform_operator';

CREATE TABLE IF NOT EXISTS marketplace_moderation (
  listing_id TEXT PRIMARY KEY,
  hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
  reason TEXT NOT NULL,
  updated_by_participant_id TEXT NOT NULL REFERENCES participants(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_participant_id TEXT NOT NULL REFERENCES participants(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  self_directed INTEGER NOT NULL CHECK (self_directed IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;
