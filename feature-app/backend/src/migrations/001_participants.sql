PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'univus',
  external_subject TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  display_name_key TEXT UNIQUE,
  nus_zone TEXT,
  verification_state TEXT NOT NULL DEFAULT 'verified' CHECK (verification_state IN ('unverified', 'pending', 'verified')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, external_subject)
);

CREATE TABLE IF NOT EXISTS launch_assertions (
  token_hash TEXT PRIMARY KEY,
  external_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gem_ledger (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  singapore_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(participant_id, reason, singapore_date)
);

CREATE TRIGGER IF NOT EXISTS gem_ledger_no_update
BEFORE UPDATE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END;
CREATE TRIGGER IF NOT EXISTS gem_ledger_no_delete
BEFORE DELETE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END;
