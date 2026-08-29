import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import {
  acceptActivePolicies,
  activatePolicyVersion,
  getAcceptanceHistory,
  getActivePolicies,
  getPolicyStatus,
} from "../backend/src/services/policyService.js";

const now = new Date("2026-08-29T10:00:00Z");
const identity = { subject: "policy-test-user", email: "policy-test@example.nus.edu.sg" };

function participantFixture() {
  const database = createDatabase(":memory:");
  const participant = completeLaunch(database, createLaunchAssertion(database, identity, now), now).participant;
  return { database, participant };
}

test("initial active policies resolve action-specific requirements", () => {
  const { database, participant } = participantFixture();
  const active = getActivePolicies(database, participant.id);
  assert.deepEqual(active.map(({ type, version }) => ({ type, version })), [
    { type: "privacy", version: "2026-08-29" },
    { type: "terms", version: "2026-08-29" },
  ]);
  const status = getPolicyStatus(database, participant.id, "comments");
  assert.equal(status.allowed, false);
  assert.deepEqual(status.missingPolicies.map(({ type }) => type).sort(), ["privacy", "terms"]);
  database.close();
});

test("current policies are accepted atomically with server-controlled timestamps", () => {
  const { database, participant } = participantFixture();
  const ids = getActivePolicies(database, participant.id).map(({ id }) => id);
  assert.throws(() => acceptActivePolicies(database, participant.id, [ids[0]], now), /every currently unaccepted/);
  const history = acceptActivePolicies(database, participant.id, ids, now);
  assert.equal(history.length, 2);
  assert.ok(history.every(({ acceptedAt }) => acceptedAt === now.toISOString()));
  assert.equal(getPolicyStatus(database, participant.id, "comments").allowed, true);
  assert.throws(() => acceptActivePolicies(database, participant.id, ids, now), /currently unaccepted/);
  assert.throws(() => acceptActivePolicies(database, participant.id, ["terms-v2"], now), /active policy/);
  database.close();
});

test("policy versions, requirements, and acceptance history are immutable", () => {
  const { database, participant } = participantFixture();
  acceptActivePolicies(database, participant.id, getActivePolicies(database, participant.id).map(({ id }) => id), now);
  assert.throws(() => database.prepare("UPDATE policy_versions SET title = 'Changed' WHERE id = 'terms-v1'").run(), /immutable/);
  assert.throws(() => database.prepare("DELETE FROM policy_action_requirements WHERE policy_version_id = 'terms-v1'").run(), /immutable/);
  assert.throws(() => database.prepare("UPDATE policy_acceptances SET accepted_at = '2099-01-01' WHERE participant_id = ?").run(participant.id), /immutable/);
  assert.throws(() => database.prepare("DELETE FROM policy_acceptances WHERE participant_id = ?").run(participant.id), /immutable/);
  database.close();
});

test("material renewal re-gates only mapped actions and preserves history", () => {
  const { database, participant } = participantFixture();
  acceptActivePolicies(database, participant.id, getActivePolicies(database, participant.id).map(({ id }) => id), now);
  activatePolicyVersion(database, "terms", "2026-09-15", new Date("2026-09-15T00:00:00Z"));

  assert.deepEqual(getPolicyStatus(database, participant.id, "comments").missingPolicies.map(({ version }) => version), ["2026-09-15"]);
  assert.equal(getPolicyStatus(database, participant.id, "claims").allowed, true);

  const currentTerms = getActivePolicies(database, participant.id).find(({ type }) => type === "terms");
  acceptActivePolicies(database, participant.id, [currentTerms.id], new Date("2026-09-15T01:00:00Z"));
  assert.equal(getPolicyStatus(database, participant.id, "comments").allowed, true);
  assert.deepEqual(getAcceptanceHistory(database, participant.id).map(({ version }) => version).sort(), ["2026-08-29", "2026-08-29", "2026-09-15"]);
  database.close();
});
