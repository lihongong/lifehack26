import { createDatabase } from "../db/database.js";
import { replaySourceFixture, sourceFixtureSnapshot, fixtureNames } from "./telegramFixtureAdapter.js";

const name = process.argv[2] || "marketplace-baseline";
if (!fixtureNames().includes(name)) {
  console.error(`Unknown fixture. Available fixtures: ${fixtureNames().join(", ")}`);
  process.exitCode = 1;
} else {
  const database = createDatabase(":memory:");
  const fixtureModeratorId = "fixture-moderator-participant";
  database.prepare(`
    INSERT INTO participants
      (id, public_id, external_subject, email, display_name, display_name_key, created_at, updated_at)
    VALUES (?, 'fixture-moderator', 'fixture-moderator-subject', 'fixture-moderator@example.invalid',
      'Fixture Moderator', 'fixture moderator', '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z')
  `).run(fixtureModeratorId);
  database.prepare(`
    INSERT INTO privileged_roles (participant_id, role, granted_by_participant_id, granted_at)
    VALUES (?, 'moderator', ?, '2026-08-29T00:00:00Z')
  `).run(fixtureModeratorId, fixtureModeratorId);
  const replay = replaySourceFixture(database, name, {
    identitySecret: "deterministic-cli-fixture-secret",
    moderatorActorId: fixtureModeratorId,
  });
  console.log(JSON.stringify({ replay, snapshot: sourceFixtureSnapshot(database) }, null, 2));
  database.close();
}
