import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import { createClock } from "../backend/src/services/clock.js";
import { createManualBuffetPost, deleteManualBuffetPost } from "../backend/src/services/manualBuffetService.js";

const now = new Date("2026-08-30T04:00:00Z");
const operatorIdentity = { subject: "buffet-operator", email: "operator@example.nus.edu.sg" };
const moderatorIdentity = { subject: "buffet-moderator", email: "moderator@example.nus.edu.sg" };

function login(database, identity, platformOperatorSubject = "") {
  return completeLaunch(database, createLaunchAssertion(database, identity, now), now, platformOperatorSubject);
}

async function setup() {
  const database = createDatabase(":memory:");
  const operator = login(database, operatorIdentity, operatorIdentity.subject);
  const moderator = login(database, moderatorIdentity);
  const participant = login(database, { subject: "buffet-participant", email: "participant@example.nus.edu.sg" });
  const cookie = (session) => `univus_session=${session.session.rawToken}`;
  const clock = createClock(now);
  const api = request(createApp({
    database,
    clock,
    environment: "test",
    platformOperatorSubject: operatorIdentity.subject,
  }));
  const enrolled = await api.post("/api/operator/moderators").set("Cookie", cookie(operator)).send({
    email: moderatorIdentity.email,
    reason: "Trusted Buffet operations volunteer",
  });
  assert.equal(enrolled.status, 201);
  database.prepare("UPDATE participants SET display_name = 'Buffet Pat', public_id = 'buffet-pat' WHERE external_subject = ?")
    .run("buffet-participant");
  return {
    api,
    database,
    clock,
    operatorCookie: cookie(operator),
    moderatorCookie: cookie(moderator),
    participantCookie: cookie(participant),
  };
}

const manualPost = {
  title: "Late seminar bentos",
  description: "Twelve sealed vegetarian bentos remain after the evening seminar.",
  reportedLocation: "LT27 foyer",
  zoneId: "science",
  collectionDeadline: "2026-08-30T05:30:00.000Z",
  reason: "Verified by the event organizer",
};

test("only a Moderator can create a validated manual Buffet Post without changing Source Feed provenance", async () => {
  const { api, database, operatorCookie, moderatorCookie, participantCookie } = await setup();
  try {
    assert.equal((await api.post("/api/moderation/buffets").send(manualPost)).status, 401);
    assert.equal((await api.post("/api/moderation/buffets").set("Cookie", participantCookie).send(manualPost)).status, 403);
    assert.equal((await api.post("/api/moderation/buffets").set("Cookie", operatorCookie).send(manualPost)).status, 403);
    assert.equal((await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send({ ...manualPost, zoneId: "not-a-zone" })).status, 422);
    assert.equal((await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send({ ...manualPost, collectionDeadline: now.toISOString() })).status, 422);

    const created = await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send(manualPost);
    assert.equal(created.status, 201);
    assert.equal(created.body.post.origin, "manual");
    assert.notEqual(created.body.post.referenceId, created.body.post.id);

    const publicFeed = await api.get("/api/buffets");
    const publicPost = publicFeed.body.posts.find(({ id }) => id === created.body.post.id);
    assert.equal(publicPost.title, manualPost.title);
    assert.equal(publicPost.origin, "manual");
    assert.equal(publicPost.fictional, false);
    assert.equal("createdByParticipantId" in publicPost, false);
    assert.equal(publicFeed.body.posts.some(({ id, origin }) => id === "science-bentos" && origin === "source_feed"), true);

    const audit = await api.get("/api/operator/audit").set("Cookie", operatorCookie);
    const creation = audit.body.entries.find(({ targetId }) => targetId === created.body.post.id);
    assert.equal(creation.eventType, "buffet_post_created");
    assert.equal(creation.reason, manualPost.reason);
    assert.equal(database.prepare("SELECT 1 FROM schema_migrations WHERE name = '009_manual_buffet_posts.sql'").get() != null, true);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count FROM buffet_posts post
      LEFT JOIN buffet_post_refs ref ON ref.id = post.id WHERE ref.id IS NULL
    `).get().count, 0);
    const moderatorId = database.prepare("SELECT id FROM participants WHERE external_subject = ?").get(moderatorIdentity.subject).id;
    database.prepare("INSERT INTO buffet_post_refs (id, public_id, origin) VALUES ('wrong-origin', 'wrong-origin-public', 'source_feed')").run();
    assert.throws(() => database.prepare(`
      INSERT INTO manual_buffet_posts (
        id, title, description, reported_location, zone_id, collection_deadline,
        created_by_participant_id, created_at
      ) VALUES ('wrong-origin', 'Wrong origin', 'Should fail the origin invariant.', 'LT27', 'science', ?, ?, ?)
    `).run(manualPost.collectionDeadline, moderatorId, now.toISOString()), /manual canonical reference/i);
    database.prepare("INSERT INTO buffet_post_refs (id, public_id, origin) VALUES ('wrong-source-origin', 'wrong-source-public', 'manual')").run();
    assert.throws(() => database.prepare(`
      INSERT INTO buffet_posts (
        id, source_feed_id, source_post_id, title, description, source_name, source_time,
        reported_location, zone_id, collection_deadline, fictional, updated_at
      ) VALUES ('wrong-source-origin', 'external-feed', 'post-1', 'Wrong source', 'Wrong origin source row',
        'External', ?, 'CLB', 'central', ?, 0, ?)
    `).run(now.toISOString(), manualPost.collectionDeadline, now.toISOString()), /origin does not match/i);
    assert.throws(() => database.prepare("DELETE FROM buffet_post_refs WHERE id = ?").run(created.body.post.id), /still in use/i);
    assert.throws(() => database.prepare("UPDATE buffet_post_refs SET origin = 'source_feed' WHERE id = ?").run(created.body.post.id), /immutable/i);
    assert.throws(() => database.prepare("UPDATE manual_buffet_posts SET id = 'changed-manual-id' WHERE id = ?").run(created.body.post.id), /identity is immutable/i);
    assert.throws(() => database.prepare("DELETE FROM buffet_posts WHERE id = ?").run(created.body.post.id), /compatibility record is still in use/i);
    const sourceInternalId = database.prepare("SELECT id FROM buffet_posts WHERE source_feed_id = 'demo-buffet-v1' LIMIT 1").get().id;
    assert.throws(() => database.prepare("DELETE FROM buffet_post_refs WHERE id = ?").run(sourceInternalId), /still in use/i);
  } finally {
    database.close();
  }
});

test("a Moderator soft-deletes only a manual Buffet Post with an immutable transactional audit reason", async () => {
  const { api, database, operatorCookie, moderatorCookie, participantCookie } = await setup();
  try {
    const created = await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send(manualPost);
    const postId = created.body.post.id;
    assert.equal((await api.delete(`/api/moderation/buffets/${postId}`).send({ reason: "Unauthorized" })).status, 401);
    assert.equal((await api.delete(`/api/moderation/buffets/${postId}`).set("Cookie", participantCookie).send({ reason: "Unauthorized" })).status, 403);
    assert.equal((await api.delete(`/api/moderation/buffets/${postId}`).set("Cookie", operatorCookie).send({ reason: "Unauthorized" })).status, 403);
    assert.equal((await api.delete(`/api/moderation/buffets/${postId}`).set("Cookie", moderatorCookie).send({ reason: "x" })).status, 422);
    assert.equal((await api.delete("/api/moderation/buffets/science-bentos").set("Cookie", moderatorCookie).send({ reason: "Source Feed governed" })).status, 404);

    const deleted = await api.delete(`/api/moderation/buffets/${postId}`).set("Cookie", moderatorCookie).send({ reason: "Collection has ended" });
    assert.equal(deleted.status, 204);
    assert.equal((await api.get("/api/buffets")).body.posts.some(({ id }) => id === postId), false);
    const stored = database.prepare("SELECT deleted_at AS deletedAt, deletion_reason AS reason FROM manual_buffet_posts WHERE id = ?").get(postId);
    assert.equal(Boolean(stored.deletedAt), true);
    assert.equal(stored.reason, "Collection has ended");

    const audit = await api.get("/api/operator/audit").set("Cookie", operatorCookie);
    const deletion = audit.body.entries.find(({ eventType }) => eventType === "buffet_post_deleted");
    assert.equal(deletion.targetId, postId);
    assert.equal(deletion.reason, "Collection has ended");
    assert.throws(() => database.prepare("UPDATE audit_log SET reason = 'rewritten' WHERE id = ?").run(deletion.id), /immutable/);
  } finally {
    database.close();
  }
});

test("manual Buffet Posts share public filters, Comments, Helpful Alerts, and review lifecycle", async () => {
  const { api, database, clock, moderatorCookie, participantCookie } = await setup();
  try {
    const activePolicies = await api.get("/api/policies/active").set("Cookie", participantCookie);
    await api.post("/api/me/policy-acceptances").set("Cookie", participantCookie).send({
      versionIds: activePolicies.body.policies.map(({ id }) => id),
    });
    assert.equal((await api.put("/api/buffet-alerts/preference").set("Cookie", participantCookie).send({ nusZone: "science", enabled: true })).status, 200);

    const created = await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send(manualPost);
    const postId = created.body.post.id;
    const postReference = created.body.post.referenceId;
    const alerts = await api.get("/api/buffet-alerts").set("Cookie", participantCookie);
    const alert = alerts.body.alerts.find(({ postId: alertedPostId }) => alertedPostId === postId);
    assert.equal(alert.matchType, "selected_zone");

    assert.equal((await api.post(`/api/buffets/${postReference}/comments`).set("Cookie", participantCookie).send({ body: "Are the vegetarian sets still available?" })).status, 201);
    assert.equal((await api.get(`/api/buffets/${postReference}/comments`)).body.comments.length, 1);
    const sourcePost = (await api.get("/api/buffets")).body.posts.find(({ id }) => id === "science-bentos");
    assert.equal((await api.post(`/api/buffets/${sourcePost.referenceId}/comments`).set("Cookie", participantCookie).send({ body: "Is the LT27 source post still current?" })).status, 201);
    const moderatedComments = await api.get("/api/moderation/comments").set("Cookie", moderatorCookie);
    assert.equal(moderatedComments.body.comments.find(({ postId: id }) => id === postReference).listingTitle, manualPost.title);
    assert.equal(moderatedComments.body.comments.find(({ postId: id }) => id === sourcePost.referenceId).listingTitle, sourcePost.title);

    await api.post(`/api/buffet-alerts/${alert.id}/feedback`).set("Cookie", participantCookie).send({ outcome: "food_gone" });
    assert.equal((await api.get("/api/buffets")).body.posts.find(({ id }) => id === postId).possiblyGone, true);
    const reviews = await api.get("/api/moderation/buffet-reviews").set("Cookie", moderatorCookie);
    const review = reviews.body.reviews.find(({ title }) => title === manualPost.title);
    const restored = await api.patch(`/api/moderation/buffet-reviews/${review.id}`).set("Cookie", moderatorCookie).send({
      outcome: "restored",
      reason: "Food remains after an in-person check",
    });
    assert.equal(restored.body.resolution.outcome, "restored");
    assert.equal((await api.get("/api/buffets")).body.posts.find(({ id }) => id === postId).possiblyGone, false);

    assert.deepEqual((await api.get("/api/buffets?query=vegetarian")).body.posts.filter(({ origin }) => origin === "manual").map(({ id }) => id), [postId]);
    assert.deepEqual((await api.get("/api/buffets?zone=science")).body.posts.filter(({ origin }) => origin === "manual").map(({ id }) => id), [postId]);
    assert.equal((await api.get("/api/buffets?zone=central")).body.posts.some(({ id }) => id === postId), false);
    const publicReadPlan = database.prepare(`
      EXPLAIN QUERY PLAN SELECT id FROM manual_buffet_posts
      WHERE deleted_at IS NULL AND collection_deadline > ? ORDER BY created_at DESC, id
    `).all(now.toISOString()).map(({ detail }) => detail).join(" ");
    assert.match(publicReadPlan, /manual_buffet_posts_visible/);
    clock.set(new Date("2026-08-30T05:01:00Z"));
    assert.equal((await api.get("/api/buffets?freshness=60")).body.posts.some(({ id }) => id === postId), false);
    assert.equal((await api.get("/api/buffets?freshness=active")).body.posts.some(({ id }) => id === postId), true);
    clock.set(new Date(manualPost.collectionDeadline));
    assert.equal((await api.get("/api/buffets")).body.posts.some(({ id }) => id === postId), false);
    assert.equal((await api.get(`/api/buffets/${postReference}/comments`)).status, 404);
    assert.equal(database.prepare("SELECT origin FROM buffet_post_refs WHERE id = ?").get(postId).origin, "manual");
    assert.doesNotMatch(sourcePost.referenceId, /demo-buffet|science-bentos/);
  } finally {
    database.close();
  }
});

test("deletion fences an open food-gone review and rejects stale alert feedback", async () => {
  const { api, database, moderatorCookie, participantCookie } = await setup();
  try {
    const activePolicies = await api.get("/api/policies/active").set("Cookie", participantCookie);
    await api.post("/api/me/policy-acceptances").set("Cookie", participantCookie).send({
      versionIds: activePolicies.body.policies.map(({ id }) => id),
    });
    await api.put("/api/buffet-alerts/preference").set("Cookie", participantCookie).send({ nusZone: "science", enabled: true });
    const first = await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send(manualPost);
    const firstAlert = (await api.get("/api/buffet-alerts").set("Cookie", participantCookie)).body.alerts.find(({ postId }) => postId === first.body.post.id);
    await api.post(`/api/buffet-alerts/${firstAlert.id}/feedback`).set("Cookie", participantCookie).send({ outcome: "food_gone" });
    const review = (await api.get("/api/moderation/buffet-reviews").set("Cookie", moderatorCookie)).body.reviews.find(({ title }) => title === manualPost.title);
    assert.equal((await api.delete(`/api/moderation/buffets/${first.body.post.id}`).set("Cookie", moderatorCookie).send({ reason: "Organizer ended collection" })).status, 204);
    const staleRestore = await api.patch(`/api/moderation/buffet-reviews/${review.id}`).set("Cookie", moderatorCookie).send({ outcome: "restored", reason: "Stale review attempt" });
    assert.equal(staleRestore.status, 404);

    const second = await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send({ ...manualPost, title: "Second late seminar bentos" });
    const secondAlert = (await api.get("/api/buffet-alerts").set("Cookie", participantCookie)).body.alerts.find(({ postId }) => postId === second.body.post.id);
    await api.delete(`/api/moderation/buffets/${second.body.post.id}`).set("Cookie", moderatorCookie).send({ reason: "Collection withdrawn" });
    const staleFeedback = await api.post(`/api/buffet-alerts/${secondAlert.id}/feedback`).set("Cookie", participantCookie).send({ outcome: "helpful" });
    assert.equal(staleFeedback.status, 409);
  } finally {
    database.close();
  }
});

test("manual publication rolls back when synchronous alert persistence fails", async () => {
  const { api, database, moderatorCookie, participantCookie } = await setup();
  try {
    const activePolicies = await api.get("/api/policies/active").set("Cookie", participantCookie);
    await api.post("/api/me/policy-acceptances").set("Cookie", participantCookie).send({ versionIds: activePolicies.body.policies.map(({ id }) => id) });
    await api.put("/api/buffet-alerts/preference").set("Cookie", participantCookie).send({ nusZone: "science", enabled: true });
    database.exec("CREATE TRIGGER reject_manual_alert BEFORE INSERT ON buffet_alerts WHEN NEW.buffet_post_id IN (SELECT id FROM buffet_post_refs WHERE origin = 'manual') BEGIN SELECT RAISE(ABORT, 'alert rejected'); END;");
    const failed = await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send(manualPost);
    assert.equal(failed.status, 500);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM manual_buffet_posts WHERE title = ?").get(manualPost.title).count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE event_type = 'buffet_post_created' AND reason = ?").get(manualPost.reason).count, 0);
    database.exec("DROP TRIGGER reject_manual_alert");
    assert.equal((await api.post("/api/moderation/buffets").set("Cookie", moderatorCookie).send(manualPost)).status, 201);
  } finally {
    database.close();
  }
});

test("manual Buffet Post changes roll back when their audit write fails", async () => {
  const { database } = await setup();
  try {
    const moderator = database.prepare("SELECT id AS participant_id FROM participants WHERE external_subject = ?").get(moderatorIdentity.subject);
    database.exec("CREATE TRIGGER reject_manual_buffet_create BEFORE INSERT ON audit_log WHEN NEW.event_type = 'buffet_post_created' BEGIN SELECT RAISE(ABORT, 'audit rejected'); END;");
    assert.throws(() => createManualBuffetPost(database, moderator, manualPost, now), /audit rejected/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM manual_buffet_posts").get().count, 0);
    database.exec("DROP TRIGGER reject_manual_buffet_create");

    const created = createManualBuffetPost(database, moderator, manualPost, now);
    database.exec("CREATE TRIGGER reject_manual_buffet_delete BEFORE INSERT ON audit_log WHEN NEW.event_type = 'buffet_post_deleted' BEGIN SELECT RAISE(ABORT, 'audit rejected'); END;");
    assert.throws(() => deleteManualBuffetPost(database, moderator, created.id, "Collection has ended", now), /audit rejected/);
    assert.equal(database.prepare("SELECT deleted_at FROM manual_buffet_posts WHERE id = ?").get(created.id).deleted_at, null);
  } finally {
    database.close();
  }
});
