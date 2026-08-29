import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion, resolveSession } from "../backend/src/services/authService.js";
import { createClock } from "../backend/src/services/clock.js";
import { replaySourceFixture } from "../backend/src/sourceFeeds/telegramFixtureAdapter.js";

const now = new Date("2026-08-29T10:00:00Z");
const operatorIdentity = { subject: "operator-subject", email: "operator@example.nus.edu.sg" };
const moderatorIdentity = { subject: "mock-univus-moderator-001", email: "moderator@example.nus.edu.sg" };

function login(database, identity, platformOperatorSubject = "") {
  return completeLaunch(database, createLaunchAssertion(database, identity, now), now, platformOperatorSubject);
}

test("only the configured stable subject bootstraps the first Platform Operator", () => {
  const database = createDatabase(":memory:");
  const ordinary = login(database, { subject: "wrong-subject", email: "ordinary@example.nus.edu.sg" }, operatorIdentity.subject);
  assert.equal(resolveSession(database, ordinary.session.rawToken, now).role, "participant");

  const operator = login(database, operatorIdentity, operatorIdentity.subject);
  assert.equal(resolveSession(database, operator.session.rawToken, now).role, "platform_operator");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM privileged_roles WHERE role = 'platform_operator'").get().count, 1);
  assert.throws(() => database.prepare("UPDATE audit_log SET reason = 'rewritten'").run(), /immutable/);
  assert.throws(() => database.prepare("DELETE FROM audit_log").run(), /immutable/);
  database.close();
});

test("Operator enrollment, self-directed moderation, reversal, audit access, and removal are enforced end to end", async () => {
  const database = createDatabase(":memory:");
  replaySourceFixture(database, "marketplace-baseline", { identitySecret: "fictional-source-fixture-secret" });
  const clock = createClock(now);
  const operator = login(database, operatorIdentity, operatorIdentity.subject);
  const moderator = login(database, moderatorIdentity);
  const api = request(createApp({ database, clock, environment: "test", platformOperatorSubject: operatorIdentity.subject }));
  const operatorCookie = `univus_session=${operator.session.rawToken}`;
  const moderatorCookie = `univus_session=${moderator.session.rawToken}`;

  assert.equal((await api.get("/api/operator/audit").set("Cookie", moderatorCookie)).status, 403);
  const enrolled = await api.post("/api/operator/moderators").set("Cookie", operatorCookie).send({ email: moderatorIdentity.email, reason: "Trusted campus operations volunteer" });
  assert.equal(enrolled.status, 201);
  const moderationListings = await api.get("/api/moderation/marketplace").set("Cookie", moderatorCookie);
  assert.equal(moderationListings.status, 200);
  const calculatorId = moderationListings.body.listings.find(({ title }) => title === "TI-84 Plus calculator").id;

  const hidden = await api.patch(`/api/moderation/marketplace/${calculatorId}`).set("Cookie", moderatorCookie).send({ hidden: true, reason: "Reviewing my own outdated source post" });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.listing.hidden, true);
  const publicListings = await api.get("/api/listings");
  assert.equal(publicListings.body.listings.some(({ id }) => id === calculatorId), false);
  assert.equal(JSON.stringify(publicListings.body).includes("ownerSubject"), false);

  const restored = await api.patch(`/api/moderation/marketplace/${calculatorId}`).set("Cookie", moderatorCookie).send({ hidden: false, reason: "Review complete and listing is current" });
  assert.equal(restored.status, 200);
  const audit = await api.get("/api/operator/audit").set("Cookie", operatorCookie);
  assert.equal(audit.status, 200);
  assert.equal(audit.body.entries.find(({ eventType }) => eventType === "marketplace_listing_hidden").selfDirected, true);

  const removed = await api.delete(`/api/operator/moderators/${moderator.participant.id}`).set("Cookie", operatorCookie).send({ reason: "Moderator rotation completed" });
  assert.equal(removed.status, 204);
  assert.equal((await api.get("/api/moderation/marketplace").set("Cookie", moderatorCookie)).status, 401);
  database.close();
});
