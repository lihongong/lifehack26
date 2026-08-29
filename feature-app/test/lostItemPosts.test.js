import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import { createClock } from "../backend/src/services/clock.js";
import { createLostItemCipher, DEMO_LOST_ITEM_PRIVATE_DATA_KEY } from "../backend/src/services/lostItemCrypto.js";
import { sanitizeLostItemPhoto, sanitizeLostItemPhotos } from "../backend/src/services/lostItemImageService.js";
import { seedLostItemFixtures } from "../backend/src/services/lostItemFixture.js";
import { updateParticipantProfile } from "../backend/src/services/participantService.js";
import { acceptActivePolicies, getActivePolicies } from "../backend/src/services/policyService.js";

const sharp = createRequire(new URL("../backend/package.json", import.meta.url))("sharp");

const now = new Date("2026-08-30T10:00:00.000Z");

function participant(database, subject, displayName) {
  const launched = completeLaunch(database, createLaunchAssertion(database, {
    subject,
    email: `${subject}@example.nus.edu.sg`,
  }, now), now);
  updateParticipantProfile(database, launched.participant.id, { displayName, nusZone: "Kent Ridge" }, now);
  return { ...launched, cookie: `univus_session=${launched.session.rawToken}` };
}

function acceptPolicies(database, participantId) {
  acceptActivePolicies(database, participantId, getActivePolicies(database, participantId).map(({ id }) => id), now);
}

function moderator(database, subject = "lost-item-moderator") {
  const value = participant(database, subject, "Moderator Morgan");
  database.prepare("INSERT INTO privileged_roles (participant_id, role, granted_by_participant_id, granted_at) VALUES (?, 'moderator', ?, ?)")
    .run(value.participant.id, value.participant.id, now.toISOString());
  return value;
}

const submission = Object.freeze({
  category: "Electronics",
  lostDate: "2026-08-29",
  nusZoneId: "computing",
  description: "ORIGINAL-CANARY A dark electronic accessory was lost after class.",
  privateIdentifyingDetails: "PRIVATE-CANARY serial mark under the protective cover.",
});

async function jpeg() {
  return sharp({ create: { width: 80, height: 50, channels: 3, background: "#334477" } })
    .withMetadata({ orientation: 6, density: 72 })
    .jpeg()
    .toBuffer();
}

test("Lost-Item image sanitization verifies content and removes metadata", async () => {
  const source = await jpeg();
  const sanitized = await sanitizeLostItemPhoto({ buffer: source, size: source.length, mimetype: "image/jpeg" });
  assert.equal(sanitized.mimeType, "image/webp");
  assert.equal(sanitized.width, 50);
  assert.equal(sanitized.height, 80);
  const metadata = await sharp(sanitized.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  for (const [format, mimetype] of [["png", "image/png"], ["webp", "image/webp"]]) {
    const bytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: "#557799" } })[format]().toBuffer();
    assert.equal((await sanitizeLostItemPhoto({ buffer: bytes, size: bytes.length, mimetype })).mimeType, "image/webp");
  }

  await assert.rejects(
    sanitizeLostItemPhoto({ buffer: source, size: source.length, mimetype: "image/png" }),
    (error) => error.status === 422 && error.code === "UNSAFE_LOST_ITEM_PHOTO",
  );
  await assert.rejects(
    sanitizeLostItemPhotos([
      { buffer: source, size: source.length, mimetype: "image/jpeg" },
      { buffer: Buffer.from("<svg><script>bad()</script></svg>"), size: 33, mimetype: "image/jpeg" },
    ]),
    (error) => error.status === 422,
  );
  await assert.rejects(
    sanitizeLostItemPhoto({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), size: 5 * 1024 * 1024 + 1, mimetype: "image/jpeg" }),
    (error) => error.status === 422,
  );
  const excessivePixels = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#111111" } }).png().toBuffer();
  await assert.rejects(
    sanitizeLostItemPhoto({ buffer: excessivePixels, size: excessivePixels.length, mimetype: "image/png" }),
    (error) => error.status === 422,
  );
});

test("private data stays encrypted while Moderator sanitization controls the public projection", async () => {
  const database = createDatabase(":memory:");
  const clock = createClock(now);
  const author = participant(database, "lost-author", "Lost Author");
  const reviewer = moderator(database);
  const commenter = participant(database, "lost-commenter", "Public Commenter");
  acceptPolicies(database, author.participant.id);
  acceptPolicies(database, commenter.participant.id);
  const api = request(createApp({ database, clock, environment: "test" }));
  const sourcePhoto = await jpeg();
  try {
    const created = await api.post("/api/lost-item-posts").set("Cookie", author.cookie)
      .field(submission)
      .attach("photos", sourcePhoto, { filename: "FILENAME-CANARY.jpg", contentType: "image/jpeg" });
    assert.equal(created.status, 201);
    assert.equal(created.body.post.status, "pending_review");
    const postId = created.body.post.id;
    const photoId = created.body.post.photos[0].id;

    const storedPrivate = database.prepare("SELECT * FROM lost_item_private_payloads WHERE post_id = ?").get(postId);
    assert.equal(storedPrivate.ciphertext.toString("utf8").includes("PRIVATE-CANARY"), false);
    const schema = JSON.stringify(database.prepare("SELECT sql FROM sqlite_master WHERE name IN ('lost_item_posts', 'lost_item_photos')").all());
    assert.equal(schema.includes("filename"), false);
    assert.equal(JSON.stringify(database.prepare("SELECT * FROM lost_item_posts WHERE id = ?").get(postId)).includes("ORIGINAL-CANARY"), false);

    const anonymousPending = await api.get("/api/lost-item-posts");
    assert.equal(anonymousPending.body.posts.length, 0);
    assert.equal((await api.get(`/api/lost-item-photos/${photoId}`)).status, 404);

    const queue = await api.get("/api/moderation/lost-item-posts").set("Cookie", reviewer.cookie);
    assert.equal(queue.status, 200);
    assert.match(queue.body.posts[0].description, /ORIGINAL-CANARY/);
    assert.match(queue.body.posts[0].privateIdentifyingDetails, /PRIVATE-CANARY/);

    const published = await api.post(`/api/moderation/lost-item-posts/${postId}/review`).set("Cookie", reviewer.cookie).send({
      revision: 1,
      decision: "publish",
      publicDescription: "Dark electronic accessory reported lost after class in Computing.",
      approvedPhotoIds: [photoId],
      reason: "Sanitized description and visually reviewed photo are safe for publication.",
    });
    assert.equal(published.status, 200);

    const publicResponse = await api.get("/api/lost-item-posts");
    assert.equal(publicResponse.status, 200);
    assert.deepEqual(Object.keys(publicResponse.body.posts[0]).sort(), ["category", "description", "fictional", "id", "lostDate", "nusZone", "photos", "publishedAt"].sort());
    const serialized = JSON.stringify(publicResponse.body);
    for (const canary of ["ORIGINAL-CANARY", "PRIVATE-CANARY", "FILENAME-CANARY", "Lost Author", "lost-author@example.nus.edu.sg", "ciphertext", "nonce", "authentication"]) {
      assert.equal(serialized.includes(canary), false, `${canary} leaked publicly`);
    }
    assert.match(publicResponse.body.posts[0].description, /Dark electronic accessory/);
    const publicPhoto = await api.get(`/api/lost-item-photos/${photoId}`);
    assert.equal(publicPhoto.status, 200);
    assert.equal(publicPhoto.headers["content-type"], "image/webp");
    const publicMetadata = await sharp(publicPhoto.body).metadata();
    assert.equal(publicMetadata.exif, undefined);

    const comment = await api.post(`/api/lost-item-posts/${postId}/comments`).set("Cookie", commenter.cookie).send({ body: "I may have seen this near COM2." });
    assert.equal(comment.status, 201);
    const report = await api.post("/api/content-reports").set("Cookie", commenter.cookie).send({ targetType: "lost_item_post", targetId: postId, category: "staleness" });
    assert.equal(report.status, 201);
    assert.equal(JSON.stringify(database.prepare("SELECT evidence_text FROM content_reports WHERE id = ?").get(report.body.report.id)).includes("PRIVATE-CANARY"), false);

    assert.equal((await api.post(`/api/me/lost-item-posts/${postId}/withdraw`).set("Cookie", author.cookie)).status, 204);
    assert.equal((await api.get("/api/lost-item-posts")).body.posts.length, 0);
    assert.equal((await api.get(`/api/lost-item-photos/${photoId}`)).status, 404);
    assert.equal((await api.get(`/api/lost-item-posts/${postId}/comments`)).status, 404);
    const resolved = await api.patch(`/api/moderation/reports/${report.body.report.id}`).set("Cookie", reviewer.cookie).send({ outcome: "hidden", reason: "Resolve after Participant withdrawal." });
    assert.equal(resolved.body.resolution.outcome, "already_unavailable");
  } finally { database.close(); }
});

test("submission replacement, rejection, concurrency, and publication locking are enforced", async () => {
  const database = createDatabase(":memory:");
  const author = participant(database, "lost-editor", "Lost Editor");
  const reviewer = moderator(database, "lost-editor-reviewer");
  acceptPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));
  try {
    const created = await api.post("/api/lost-item-posts").set("Cookie", author.cookie).field(submission);
    const postId = created.body.post.id;
    assert.equal((await api.post(`/api/moderation/lost-item-posts/${postId}/review`).set("Cookie", reviewer.cookie).send({ revision: 1, decision: "reject", reason: "Please clarify where it was last seen." })).status, 200);
    const mine = await api.get("/api/me/lost-item-posts").set("Cookie", author.cookie);
    assert.match(mine.body.posts[0].rejectionReason, /clarify/);

    const stale = await api.put(`/api/me/lost-item-posts/${postId}`).set("Cookie", author.cookie).field({ ...submission, revision: 0, retainedPhotoIds: "[]" });
    assert.equal(stale.status, 409);
    const replaced = await api.put(`/api/me/lost-item-posts/${postId}`).set("Cookie", author.cookie).field({ ...submission, description: "A revised complete description with a clearer location near COM2.", revision: 1, retainedPhotoIds: "[]" });
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body.post.revision, 2);
    assert.equal(replaced.body.post.status, "pending_review");

    const contactLeak = await api.post(`/api/moderation/lost-item-posts/${postId}/review`).set("Cookie", reviewer.cookie).send({ revision: 2, decision: "publish", publicDescription: "Contact me at owner@example.com about the item.", approvedPhotoIds: [], reason: "Unsafe attempted text." });
    assert.equal(contactLeak.status, 422);
    const publish = await api.post(`/api/moderation/lost-item-posts/${postId}/review`).set("Cookie", reviewer.cookie).send({ revision: 2, decision: "publish", publicDescription: "Dark electronic accessory reported lost near COM2 after class.", approvedPhotoIds: [], reason: "Safe corrected public description." });
    assert.equal(publish.status, 200);
    const locked = await api.put(`/api/me/lost-item-posts/${postId}`).set("Cookie", author.cookie).field({ ...submission, revision: 2, retainedPhotoIds: "[]" });
    assert.equal(locked.status, 409);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM lost_item_reviews WHERE post_id = ?").get(postId).count, 2);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE target_id = ?").get(postId).count, 2);
    assert.throws(() => database.prepare("UPDATE lost_item_reviews SET reason = 'mutated' WHERE post_id = ?").run(postId), /immutable/);
  } finally { database.close(); }
});

test("an invalid photo atomically rejects the multipart submission", async () => {
  const database = createDatabase(":memory:");
  const author = participant(database, "lost-image-author", "Image Author");
  acceptPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));
  try {
    const response = await api.post("/api/lost-item-posts").set("Cookie", author.cookie).field(submission)
      .attach("photos", await jpeg(), { filename: "safe.jpg", contentType: "image/jpeg" })
      .attach("photos", Buffer.from("not an image"), { filename: "spoofed.jpg", contentType: "image/jpeg" });
    assert.equal(response.status, 422);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM lost_item_posts").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM lost_item_photos").get().count, 0);
  } finally { database.close(); }
});

test("public Lost-Item queries cover the controlled taxonomy, exact zones, inclusive dates, sorting, and moderation hiding", async () => {
  const database = createDatabase(":memory:");
  const author = participant(database, "lost-query-author", "Query Author");
  const reviewer = moderator(database, "lost-query-reviewer");
  acceptPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));
  const categories = ["Electronics", "Wallets & Cards", "Keys", "Bags", "Clothing", "Accessories", "Documents", "Other"];
  try {
    const ids = [];
    for (const [index, category] of categories.entries()) {
      const created = await api.post("/api/lost-item-posts").set("Cookie", author.cookie).field({
        ...submission,
        category,
        lostDate: index % 2 ? "2026-08-28" : "2026-08-29",
        nusZoneId: index % 2 ? "central" : "science",
        description: `Unique query item ${index} with searchable indigo detail.`,
      });
      assert.equal(created.status, 201);
      ids.push(created.body.post.id);
      const reviewed = await api.post(`/api/moderation/lost-item-posts/${created.body.post.id}/review`).set("Cookie", reviewer.cookie).send({
        revision: 1,
        decision: "publish",
        publicDescription: `Sanitized ${category} item number ${index} with indigo detail.`,
        approvedPhotoIds: [],
        reason: "Validated controlled taxonomy fixture.",
      });
      assert.equal(reviewed.status, 200);
    }

    assert.equal((await api.get("/api/lost-item-posts?query=INDIGO")).body.posts.length, 8);
    const bags = (await api.get("/api/lost-item-posts?category=Bags")).body.posts;
    assert.deepEqual(bags.map(({ category }) => category), ["Bags"]);
    const science = (await api.get("/api/lost-item-posts?zone=science")).body.posts;
    assert.equal(science.length, 4);
    assert.ok(science.every(({ nusZone }) => nusZone.id === "science"));
    const boundary = (await api.get("/api/lost-item-posts?dateFrom=2026-08-28&dateTo=2026-08-28&sort=lost_date")).body.posts;
    assert.equal(boundary.length, 4);
    assert.ok(boundary.every(({ lostDate }) => lostDate === "2026-08-28"));
    const recent = (await api.get("/api/lost-item-posts?sort=recent")).body.posts;
    assert.deepEqual(recent.map(({ id }) => id), [...ids].sort());

    const report = await api.post("/api/content-reports").set("Cookie", author.cookie).send({ targetType: "lost_item_post", targetId: ids[0], category: "privacy" });
    assert.equal(report.status, 201);
    const hidden = await api.patch(`/api/moderation/reports/${report.body.report.id}`).set("Cookie", reviewer.cookie).send({ outcome: "hidden", reason: "Hide the sanitized Lost-Item Post after review." });
    assert.equal(hidden.body.resolution.outcome, "hidden");
    assert.equal((await api.get("/api/lost-item-posts")).body.posts.some(({ id }) => id === ids[0]), false);
  } finally { database.close(); }
});

test("encryption fails closed and deterministic fixtures seed one public and one private post", () => {
  assert.throws(() => createLostItemCipher(""), (error) => error.status === 503);
  const productionDatabase = createDatabase(":memory:");
  assert.throws(() => createApp({ database: productionDatabase, environment: "production", lostItemPrivateDataKey: "" }), (error) => error.status === 503);
  productionDatabase.close();
  const database = createDatabase(":memory:");
  const cipher = createLostItemCipher(DEMO_LOST_ITEM_PRIVATE_DATA_KEY);
  try {
    seedLostItemFixtures(database, cipher);
    seedLostItemFixtures(database, cipher);
    assert.deepEqual(database.prepare("SELECT status, COUNT(*) AS count FROM lost_item_posts GROUP BY status ORDER BY status").all().map((row) => ({ ...row })), [
      { status: "pending_review", count: 1 },
      { status: "published", count: 1 },
    ]);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM privileged_roles WHERE participant_id LIKE 'fixture-lost-%'").get().count, 0);
    const publicJson = JSON.stringify((awaitablePublicPosts(database)));
    assert.equal(publicJson.includes("FICTIONAL PRIVATE FIXTURE"), false);

    const row = database.prepare("SELECT * FROM lost_item_private_payloads WHERE post_id = 'fixture-lost-item-pending'").get();
    const wrongCipher = createLostItemCipher(Buffer.alloc(32, 7).toString("base64"));
    assert.throws(() => wrongCipher.decrypt(row, "lost-item-private:fixture-lost-item-pending:1", { json: true }), /failed authentication/);
    row.ciphertext[0] ^= 1;
    assert.throws(() => cipher.decrypt(row, "lost-item-private:fixture-lost-item-pending:1", { json: true }), /failed authentication/);
  } finally { database.close(); }
});

function awaitablePublicPosts(database) {
  return database.prepare(`
    SELECT p.id, p.category, p.lost_date, r.public_description
    FROM lost_item_posts p JOIN lost_item_reviews r ON r.post_id = p.id AND r.revision = p.revision
    WHERE p.status = 'published'
  `).all();
}
