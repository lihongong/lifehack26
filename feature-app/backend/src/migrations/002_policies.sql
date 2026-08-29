CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('terms', 'privacy')),
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  material_change INTEGER NOT NULL CHECK (material_change IN (0, 1)),
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(policy_type, version)
);

CREATE TABLE IF NOT EXISTS policy_action_requirements (
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(id),
  action TEXT NOT NULL CHECK (action IN ('posting', 'comments', 'claims', 'alerts', 'redemptions')),
  PRIMARY KEY(policy_version_id, action)
);

CREATE TABLE IF NOT EXISTS active_policies (
  policy_type TEXT PRIMARY KEY CHECK (policy_type IN ('terms', 'privacy')),
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(id),
  activated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(id),
  accepted_at TEXT NOT NULL,
  session_source TEXT NOT NULL,
  UNIQUE(participant_id, policy_version_id)
);

CREATE TRIGGER IF NOT EXISTS policy_versions_no_update BEFORE UPDATE ON policy_versions BEGIN SELECT RAISE(ABORT, 'policy_versions is immutable'); END;
CREATE TRIGGER IF NOT EXISTS policy_versions_no_delete BEFORE DELETE ON policy_versions BEGIN SELECT RAISE(ABORT, 'policy_versions is immutable'); END;
CREATE TRIGGER IF NOT EXISTS policy_requirements_no_update BEFORE UPDATE ON policy_action_requirements BEGIN SELECT RAISE(ABORT, 'policy requirements are immutable'); END;
CREATE TRIGGER IF NOT EXISTS policy_requirements_no_delete BEFORE DELETE ON policy_action_requirements BEGIN SELECT RAISE(ABORT, 'policy requirements are immutable'); END;
CREATE TRIGGER IF NOT EXISTS policy_acceptances_no_update BEFORE UPDATE ON policy_acceptances BEGIN SELECT RAISE(ABORT, 'policy acceptances are immutable'); END;
CREATE TRIGGER IF NOT EXISTS policy_acceptances_no_delete BEFORE DELETE ON policy_acceptances BEGIN SELECT RAISE(ABORT, 'policy acceptances are immutable'); END;

INSERT OR IGNORE INTO policy_versions VALUES
('terms-v1', 'terms', '2026-08-29', 'NUS Community Exchange Terms', 'These demonstration Terms explain that Participants must use community features respectfully, submit accurate information, protect other people’s privacy, and follow Moderator directions. Gems have no cash value and protected actions may be restricted to keep the community safe.', 1, '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z'),
('privacy-v1', 'privacy', '2026-08-29', 'NUS Community Exchange Privacy Notice', 'This demonstration Privacy Notice explains that private profile fields, selected NUS Zone, Gem activity, claims, and other protected activity are not shown publicly. Operational records are retained only for community safety, audit, and defined operating needs.', 1, '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z'),
('terms-v2', 'terms', '2026-09-15', 'NUS Community Exchange Terms', 'Updated demonstration Terms add clearer responsibilities for Participant-created Posts and Comments. Participants must avoid misleading, unsafe, discriminatory, or privacy-invasive content and must cooperate with Moderator review.', 1, '2026-09-15T00:00:00Z', '2026-09-15T00:00:00Z'),
('privacy-v2', 'privacy', '2026-10-01', 'NUS Community Exchange Privacy Notice', 'Updated demonstration Privacy Notice explains how claim details and alert preferences are handled privately and used only to provide the requested protected community action.', 1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');

INSERT OR IGNORE INTO policy_action_requirements
SELECT id, action FROM policy_versions CROSS JOIN (
  SELECT 'posting' AS action UNION ALL SELECT 'comments' UNION ALL SELECT 'claims' UNION ALL SELECT 'alerts' UNION ALL SELECT 'redemptions'
) WHERE id IN ('terms-v1', 'privacy-v1');
INSERT OR IGNORE INTO policy_action_requirements VALUES ('terms-v2', 'posting'), ('terms-v2', 'comments'), ('privacy-v2', 'claims'), ('privacy-v2', 'alerts');
INSERT OR IGNORE INTO active_policies VALUES ('terms', 'terms-v1', '2026-08-29T00:00:00Z'), ('privacy', 'privacy-v1', '2026-08-29T00:00:00Z');
