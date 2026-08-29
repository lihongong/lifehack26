import { Router } from "express";
import { activatePolicyVersion } from "../services/policyService.js";
import { replaySourceFixture, sourceFixtureSnapshot } from "../sourceFeeds/telegramFixtureAdapter.js";

export function devRoutes({ database, clock, environment, sourceIdentitySecret }) {
  const router = Router();
  if (environment === "production") return router;
  router.post("/clock", (request, response) => { clock.set(request.body.now); response.json({ now: clock.now().toISOString() }); });
  router.post("/policies/activate", (request, response) => {
    const policy = activatePolicyVersion(database, request.body?.type, request.body?.version, clock.now());
    response.json({ policy: { type: policy.policy_type, version: policy.version } });
  });
  router.post("/source-feeds/replay", (request, response) => {
    const replay = replaySourceFixture(database, request.body?.fixture, {
      identitySecret: sourceIdentitySecret,
      moderatorActorId: request.participant?.role === "moderator" ? request.participant.participant_id : null,
    });
    response.json({ replay, snapshot: sourceFixtureSnapshot(database) });
  });
  router.post("/reset", (_request, response) => {
    database.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER policy_acceptances_no_update;
      DROP TRIGGER policy_acceptances_no_delete;
      DROP TRIGGER audit_log_no_update;
      DROP TRIGGER audit_log_no_delete;
      DROP TRIGGER gem_ledger_no_update;
      DROP TRIGGER gem_ledger_no_delete;
      DROP TRIGGER processed_source_updates_no_update;
      DROP TRIGGER processed_source_updates_no_delete;
      DROP TRIGGER source_deletion_tombstones_no_update;
      DROP TRIGGER source_deletion_tombstones_no_delete;
      DELETE FROM audit_log;
      DELETE FROM marketplace_moderation;
      DELETE FROM privileged_roles;
      DELETE FROM marketplace_listings;
      DELETE FROM source_discrepancies;
      DELETE FROM source_deletion_tombstones;
      DELETE FROM processed_source_updates;
      DELETE FROM source_feed_rate_windows;
      DELETE FROM source_posts;
      DELETE FROM source_author_consents;
      DELETE FROM policy_acceptances;
      DELETE FROM sessions;
      DELETE FROM launch_assertions;
      DELETE FROM gem_ledger;
      DELETE FROM participants;
      UPDATE active_policies SET policy_version_id = CASE policy_type WHEN 'terms' THEN 'terms-v1' ELSE 'privacy-v1' END,
        activated_at = '2026-08-29T00:00:00Z';
      UPDATE source_feeds SET permission_approved = 0, permission_evidence_reference = NULL,
        privacy_approved = 0, privacy_evidence_reference = NULL, live_enabled = 0,
        last_update_id = NULL, updated_at = '2026-08-29T00:00:00Z';
      CREATE TRIGGER policy_acceptances_no_update BEFORE UPDATE ON policy_acceptances BEGIN SELECT RAISE(ABORT, 'policy acceptances are immutable'); END;
      CREATE TRIGGER policy_acceptances_no_delete BEFORE DELETE ON policy_acceptances BEGIN SELECT RAISE(ABORT, 'policy acceptances are immutable'); END;
      CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;
      CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;
      CREATE TRIGGER gem_ledger_no_update BEFORE UPDATE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END;
      CREATE TRIGGER gem_ledger_no_delete BEFORE DELETE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END;
      CREATE TRIGGER processed_source_updates_no_update BEFORE UPDATE ON processed_source_updates BEGIN SELECT RAISE(ABORT, 'processed source updates are immutable'); END;
      CREATE TRIGGER processed_source_updates_no_delete BEFORE DELETE ON processed_source_updates BEGIN SELECT RAISE(ABORT, 'processed source updates are immutable'); END;
      CREATE TRIGGER source_deletion_tombstones_no_update BEFORE UPDATE ON source_deletion_tombstones BEGIN SELECT RAISE(ABORT, 'source deletion tombstones are immutable'); END;
      CREATE TRIGGER source_deletion_tombstones_no_delete BEFORE DELETE ON source_deletion_tombstones BEGIN SELECT RAISE(ABORT, 'source deletion tombstones are immutable'); END;
      COMMIT;
    `);
    clock.set(null);
    replaySourceFixture(database, "marketplace-baseline", { identitySecret: sourceIdentitySecret });
    response.status(204).end();
  });
  return router;
}
