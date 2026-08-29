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

function grantModerator(database, participantId) {
  database.prepare(`
    INSERT INTO privileged_roles (participant_id, role, granted_by_participant_id, granted_at)
    VALUES (?, 'moderator', ?, ?)
  `).run(participantId, participantId, now.toISOString());
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

test("Content Reports preserve submission evidence through later edits and deletion without awarding Gems", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "reported-author", "Reported Avery");
  const reporter = createParticipant(database, "content-reporter", "Reporter River");
  const moderator = createParticipant(database, "report-moderator", "Reviewer Reese");
  grantModerator(database, moderator.participant.id);
  acceptCommentPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    const comment = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Original private-looking evidence" });
    const gemBefore = await api.get("/api/me/gems").set("Cookie", reporter.cookie);
    const report = await api
      .post("/api/content-reports")
      .set("Cookie", reporter.cookie)
      .send({ targetType: "comment", targetId: comment.body.comment.id, category: "privacy" });
    assert.equal(report.status, 201);
    assert.equal(report.body.report.category, "privacy");

    await api
      .patch(`/api/comments/${comment.body.comment.id}`)
      .set("Cookie", author.cookie)
      .send({ body: "Edited after reporting" });
    assert.equal(
      (await api.delete(`/api/comments/${comment.body.comment.id}`).set("Cookie", author.cookie)).status,
      204,
    );

    const queue = await api.get("/api/moderation/reports").set("Cookie", moderator.cookie);
    assert.equal(queue.status, 200);
    assert.equal(queue.body.reports.length, 1);
    assert.equal(queue.body.reports[0].evidence.text, "Original private-looking evidence");
    assert.equal(queue.body.reports[0].reporter.displayName, "Reporter River");
    assert.equal(JSON.stringify(queue.body).includes("content-reporter@example.nus.edu.sg"), false);
    assert.equal(database.prepare("SELECT deleted_at IS NOT NULL AS deleted FROM comments WHERE id = ?").get(comment.body.comment.id).deleted, 1);

    const gemAfter = await api.get("/api/me/gems").set("Cookie", reporter.cookie);
    assert.deepEqual(gemAfter.body, gemBefore.body);
    const resolution = await api
      .patch(`/api/moderation/reports/${report.body.report.id}`)
      .set("Cookie", moderator.cookie)
      .send({ outcome: "hidden", reason: "Author already removed the reported content" });
    assert.equal(resolution.body.resolution.outcome, "already_unavailable");
    assert.equal(database.prepare("SELECT id FROM comments WHERE id = ?").get(comment.body.comment.id), undefined);
  } finally {
    database.close();
  }
});

test("Moderator resolution hides a reported Comment and independently closes duplicate reports", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "moderated-author", "Moderated Morgan");
  const firstReporter = createParticipant(database, "first-reporter", "First Finley");
  const secondReporter = createParticipant(database, "second-reporter", "Second Sage");
  const moderator = createParticipant(database, "content-moderator", "Moderator Micah");
  grantModerator(database, moderator.participant.id);
  acceptCommentPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    const comment = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "Content that needs review" });
    const firstReport = await api
      .post("/api/content-reports")
      .set("Cookie", firstReporter.cookie)
      .send({ targetType: "comment", targetId: comment.body.comment.id, category: "safety" });
    const secondReport = await api
      .post("/api/content-reports")
      .set("Cookie", secondReporter.cookie)
      .send({ targetType: "comment", targetId: comment.body.comment.id, category: "fraud" });

    const firstResolution = await api
      .patch(`/api/moderation/reports/${firstReport.body.report.id}`)
      .set("Cookie", moderator.cookie)
      .send({ outcome: "hidden", reason: "Unsafe public guidance" });
    assert.equal(firstResolution.status, 200);
    assert.equal(firstResolution.body.resolution.outcome, "hidden");

    const duplicateResolution = await api
      .patch(`/api/moderation/reports/${secondReport.body.report.id}`)
      .set("Cookie", moderator.cookie)
      .send({ outcome: "hidden", reason: "Duplicate report for hidden content" });
    assert.equal(duplicateResolution.status, 200);
    assert.equal(duplicateResolution.body.resolution.outcome, "already_unavailable");
    assert.equal((await api.get("/api/moderation/reports").set("Cookie", moderator.cookie)).body.reports.length, 0);

    const publicComment = (await api.get("/api/listings/calculator/comments")).body.comments[0];
    assert.equal(publicComment.body, null);
    assert.equal(publicComment.hidden, true);
    assert.equal(publicComment.replies.length, 0);

    const authorNotifications = (await api.get("/api/me/notifications").set("Cookie", author.cookie)).body.notifications;
    assert.equal(authorNotifications.some(({ type }) => type === "comment_moderated"), true);
    assert.equal((await api.get("/api/me/notifications").set("Cookie", firstReporter.cookie)).body.notifications[0].type, "report_resolved");
    assert.equal((await api.get("/api/me/notifications").set("Cookie", secondReporter.cookie)).body.notifications[0].type, "report_resolved");

    assert.throws(() => database.prepare("UPDATE report_resolutions SET reason = 'rewritten'").run(), /immutable/);
    assert.throws(() => database.prepare("DELETE FROM report_resolutions").run(), /immutable/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE target_type = 'content_report'").get().count, 2);
  } finally {
    database.close();
  }
});

test("Moderators can directly hide any Comment with an immutable audit reason", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "direct-author", "Direct Drew");
  const moderator = createParticipant(database, "direct-moderator", "Moderator Marlow");
  grantModerator(database, moderator.participant.id);
  acceptCommentPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    const comment = await api
      .post("/api/listings/calculator/comments")
      .set("Cookie", author.cookie)
      .send({ body: "A directly moderated Comment" });
    const hidden = await api
      .patch(`/api/moderation/comments/${comment.body.comment.id}`)
      .set("Cookie", moderator.cookie)
      .send({ hidden: true, reason: "Contains unsafe instructions" });
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.comment.hidden, true);
    assert.equal((await api.get("/api/listings/calculator/comments")).body.comments[0].body, null);

    const restorationRejected = await api
      .patch(`/api/moderation/comments/${comment.body.comment.id}`)
      .set("Cookie", moderator.cookie)
      .send({ hidden: false, reason: "Safety review completed" });
    assert.equal(restorationRejected.status, 422);
    assert.deepEqual(
      database.prepare("SELECT event_type, reason FROM audit_log WHERE target_type = 'comment' ORDER BY created_at, event_type").all().map((entry) => ({ ...entry })),
      [
        { event_type: "comment_hidden", reason: "Contains unsafe instructions" },
      ],
    );
  } finally {
    database.close();
  }
});

test("a resolved Marketplace Listing report hides the public listing", async () => {
  const database = createDatabase(":memory:");
  const reporter = createParticipant(database, "listing-reporter", "Listing Lane");
  const moderator = createParticipant(database, "listing-moderator", "Moderator Lou");
  grantModerator(database, moderator.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));

  try {
    const report = await api
      .post("/api/content-reports")
      .set("Cookie", reporter.cookie)
      .send({ targetType: "marketplace_listing", targetId: "calculator", category: "staleness" });
    assert.equal(report.status, 201);
    const resolution = await api
      .patch(`/api/moderation/reports/${report.body.report.id}`)
      .set("Cookie", moderator.cookie)
      .send({ outcome: "hidden", reason: "Source post is no longer current" });
    assert.equal(resolution.status, 200);
    assert.equal(resolution.body.resolution.outcome, "hidden");
    assert.equal((await api.get("/api/listings")).body.listings.some(({ id }) => id === "calculator"), false);
    assert.equal((await api.get("/api/listings/calculator/comments")).status, 404);
  } finally {
    database.close();
  }
});
