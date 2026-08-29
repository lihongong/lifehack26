import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import { createClock } from "../backend/src/services/clock.js";
import { updateParticipantProfile } from "../backend/src/services/participantService.js";
import { acceptActivePolicies, activatePolicyVersion, getActivePolicies } from "../backend/src/services/policyService.js";

const now = new Date("2026-08-29T10:00:00Z");

function createParticipant(database, subject, displayName) {
  const launched = completeLaunch(
    database,
    createLaunchAssertion(database, { subject, email: `${subject}@example.nus.edu.sg` }, now),
    now,
  );
  updateParticipantProfile(database, launched.participant.id, { displayName, nusZone: null }, now);
  return { ...launched, cookie: `univus_session=${launched.session.rawToken}` };
}

function acceptCommentPolicies(database, participantId) {
  acceptActivePolicies(
    database,
    participantId,
    getActivePolicies(database, participantId).map(({ id }) => id),
    now,
  );
}

test("public Marketplace Comment threads allow one authenticated reply level without leaking private identity", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "comment-author", "Comment Casey");
  const replier = createParticipant(database, "comment-replier", "Reply Riley");
  acceptCommentPolicies(database, author.participant.id);
  acceptCommentPolicies(database, replier.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    assert.equal((await api.post("/api/listings/calculator/comments").send({ body: "Anonymous" })).status, 401);

    const topLevel = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Is this still available?" });
    assert.equal(topLevel.status, 201);
    assert.equal(topLevel.body.comment.body, "Is this still available?");
    assert.equal(topLevel.body.comment.author.displayName, "Comment Casey");

    const reply = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", replier.cookie)
      .send({ body: "Yes, I saw the update today.", parentCommentId: topLevel.body.comment.id });
    assert.equal(reply.status, 201);

    const tooDeep = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Thanks!", parentCommentId: reply.body.comment.id });
    assert.equal(tooDeep.status, 422);

    const publicThread = await api.get("/api/listings/calculator/comments");
    assert.equal(publicThread.status, 200);
    assert.equal(publicThread.body.comments.length, 1);
    assert.equal(publicThread.body.comments[0].replies.length, 1);
    assert.equal(publicThread.body.comments[0].replies[0].body, "Yes, I saw the update today.");
    const serialized = JSON.stringify(publicThread.body);
    assert.equal(serialized.includes("comment-author@example.nus.edu.sg"), false);
    assert.equal(serialized.includes("comment-replier@example.nus.edu.sg"), false);
    assert.equal(serialized.includes("external_subject"), false);
    assert.equal(serialized.includes("participant_id"), false);
  } finally {
    database.close();
  }
});

test("obvious contact details require explicit confirmation before Comment submission", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "privacy-author", "Privacy Parker");
  acceptCommentPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    const warned = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Email me at parker@example.com" });
    assert.equal(warned.status, 409);
    assert.deepEqual(warned.body, {
      error: "Confirm before sharing contact details publicly.",
      code: "CONTACT_DETAILS_CONFIRMATION_REQUIRED",
      detectedContactTypes: ["email"],
    });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM comments").get().count, 0);

    const confirmed = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Email me at parker@example.com", confirmContactDetails: true });
    assert.equal(confirmed.status, 201);

    const phoneWarning = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "My number is +65 8123 4567" });
    assert.equal(phoneWarning.status, 409);
    assert.deepEqual(phoneWarning.body.detectedContactTypes, ["phone"]);
  } finally {
    database.close();
  }
});

test("Comment authors can edit and delete while removed parents preserve their replies", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "edit-author", "Editing Eden");
  const replier = createParticipant(database, "edit-replier", "Replying Remy");
  acceptCommentPolicies(database, author.participant.id);
  acceptCommentPolicies(database, replier.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    const topLevel = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Original wording" });
    const standalone = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Delete me completely" });
    await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", replier.cookie)
      .send({ body: "A reply that remains", parentCommentId: topLevel.body.comment.id });

    const forbidden = await api
      .patch(`/api/comments/${topLevel.body.comment.id}`)
      .set("Cookie", replier.cookie)
      .send({ body: "Not mine" });
    assert.equal(forbidden.status, 403);

    const edited = await api
      .patch(`/api/comments/${topLevel.body.comment.id}`)
      .set("Cookie", author.cookie)
      .send({ body: "Clearer wording" });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.comment.body, "Clearer wording");
    assert.equal(edited.body.comment.edited, true);

    activatePolicyVersion(database, "terms", "2026-09-15", new Date("2026-09-15T00:00:00Z"));
    assert.equal(
      (await api.delete(`/api/comments/${topLevel.body.comment.id}`).set("Cookie", author.cookie)).status,
      204,
    );
    assert.equal(
      (await api.delete(`/api/comments/${standalone.body.comment.id}`).set("Cookie", author.cookie)).status,
      204,
    );

    const thread = (await api.get("/api/listings/calculator/comments")).body.comments;
    assert.equal(thread.length, 1);
    assert.equal(thread[0].body, null);
    assert.equal(thread[0].deleted, true);
    assert.equal(thread[0].replies[0].body, "A reply that remains");
  } finally {
    database.close();
  }
});

test("reply creation atomically creates a private in-app notification for the parent author", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "notify-author", "Notified Noor");
  const replier = createParticipant(database, "notify-replier", "Reply Rowan");
  acceptCommentPolicies(database, author.participant.id);
  acceptCommentPolicies(database, replier.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    const topLevel = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Does the calculator include a cover?" });
    await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", replier.cookie)
      .send({ body: "The cover is shown in the source post.", parentCommentId: topLevel.body.comment.id });

    const authorNotifications = await api.get("/api/me/notifications").set("Cookie", author.cookie);
    assert.equal(authorNotifications.status, 200);
    assert.equal(authorNotifications.body.notifications.length, 1);
    assert.equal(authorNotifications.body.notifications[0].type, "reply_received");
    assert.equal(authorNotifications.body.notifications[0].message, "Reply Rowan replied to your Comment.");
    assert.equal(
      (await api.get("/api/me/notifications").set("Cookie", replier.cookie)).body.notifications.length,
      0,
    );

    assert.throws(
      () => database.prepare(`
        INSERT INTO comments (
          id, post_type, post_id, parent_comment_id, author_participant_id,
          body, created_at, updated_at
        ) VALUES ('too-deep', 'marketplace_listing', 'calculator', ?, ?, 'No', ?, ?)
      `).run(
        database.prepare("SELECT id FROM comments WHERE parent_comment_id = ?").get(topLevel.body.comment.id).id,
        author.participant.id,
        now.toISOString(),
        now.toISOString(),
      ),
      /one reply level/,
    );
  } finally {
    database.close();
  }
});
