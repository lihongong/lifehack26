DROP TRIGGER IF EXISTS policy_versions_no_update;
DROP TRIGGER IF EXISTS policy_versions_no_delete;

UPDATE policy_versions
SET title = 'ShareNUS Terms'
WHERE title = 'NUS Community Exchange Terms';

UPDATE policy_versions
SET title = 'ShareNUS Privacy Notice'
WHERE title = 'NUS Community Exchange Privacy Notice';

CREATE TRIGGER policy_versions_no_update
BEFORE UPDATE ON policy_versions BEGIN SELECT RAISE(ABORT, 'policy_versions is immutable'); END;
CREATE TRIGGER policy_versions_no_delete
BEFORE DELETE ON policy_versions BEGIN SELECT RAISE(ABORT, 'policy_versions is immutable'); END;
