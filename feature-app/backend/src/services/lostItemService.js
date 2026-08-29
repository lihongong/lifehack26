import { randomUUID } from "node:crypto";
import { nusZones } from "../data/nusZones.js";
import { withImmediateTransaction } from "../db/database.js";
import { recordAudit, validateReason } from "./privilegeService.js";

export const LOST_ITEM_CATEGORIES = Object.freeze([
  "Electronics", "Wallets & Cards", "Keys", "Bags", "Clothing", "Accessories", "Documents", "Other",
]);

const categories = new Set(LOST_ITEM_CATEGORIES);
const zones = new Map(nusZones.map((zone) => [zone.id, zone]));
const statuses = new Set(["pending_review", "rejected", "published", "withdrawn"]);

function fail(message, status = 422, code) {
  throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function text(value, label, minimum, maximum) {
  const result = String(value ?? "").normalize("NFKC").trim();
  if (result.length < minimum || result.length > maximum) fail(`${label} must be ${minimum}-${maximum} characters.`);
  return result;
}

function singaporeDate(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function date(value, now) {
  const result = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(new Date(`${result}T00:00:00Z`).getTime()) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) {
    fail("Lost date must use YYYY-MM-DD.");
  }
  if (result > singaporeDate(now)) fail("Lost date cannot be in the future.");
  return result;
}

function submission(input, now) {
  const category = String(input?.category || "");
  if (!categories.has(category)) fail("Lost-Item category is invalid.");
  const nusZoneId = String(input?.nusZoneId || "");
  if (!zones.has(nusZoneId)) fail("NUS Zone is invalid.");
  return {
    category,
    lostDate: date(input?.lostDate, now),
    nusZoneId,
    originalDescription: text(input?.description, "Original description", 10, 2000),
    privateIdentifyingDetails: text(input?.privateIdentifyingDetails, "Private Identifying Details", 3, 2000),
  };
}

const privateAad = (postId, revision) => `lost-item-private:${postId}:${revision}`;
const photoAad = (postId, photoId) => `lost-item-photo:${postId}:${photoId}`;

function encryptedArgs(encrypted) {
  return [encrypted.keyVersion, encrypted.nonce, encrypted.ciphertext, encrypted.authenticationTag];
}

function insertPrivatePayload(database, cipher, postId, revision, value) {
  const encrypted = cipher.encrypt(value, privateAad(postId, revision));
  database.prepare(`
    INSERT INTO lost_item_private_payloads
      (post_id, revision, key_version, nonce, ciphertext, authentication_tag)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET revision = excluded.revision, key_version = excluded.key_version,
      nonce = excluded.nonce, ciphertext = excluded.ciphertext, authentication_tag = excluded.authentication_tag
  `).run(postId, revision, ...encryptedArgs(encrypted));
}

function insertPhoto(database, cipher, postId, revision, ordinal, photo) {
  const id = randomUUID();
  const encrypted = cipher.encrypt(photo.bytes, photoAad(postId, id));
  database.prepare(`
    INSERT INTO lost_item_photos
      (id, post_id, revision, ordinal, mime_type, width, height, byte_size,
       key_version, nonce, ciphertext, authentication_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, postId, revision, ordinal, photo.mimeType, photo.width, photo.height, photo.byteSize,
    ...encryptedArgs(encrypted),
  );
  return id;
}

function privatePayload(database, cipher, postId, revision) {
  const row = database.prepare("SELECT * FROM lost_item_private_payloads WHERE post_id = ? AND revision = ?").get(postId, revision);
  if (!row) fail("Lost-Item private payload is unavailable.", 500);
  return cipher.decrypt(row, privateAad(postId, revision), { json: true });
}

function photoSummary(row, prefix) {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    mimeType: row.mime_type,
    url: `${prefix}/${row.id}`,
  };
}

function participantPost(database, cipher, row) {
  const payload = privatePayload(database, cipher, row.id, row.revision);
  const photos = database.prepare("SELECT * FROM lost_item_photos WHERE post_id = ? AND revision = ? ORDER BY ordinal, id").all(row.id, row.revision)
    .map((photo) => photoSummary(photo, `/api/me/lost-item-posts/${row.id}/photos`));
  const rejection = row.status === "rejected"
    ? database.prepare("SELECT reason FROM lost_item_reviews WHERE post_id = ? AND revision = ? AND decision = 'reject'").get(row.id, row.revision)?.reason || null
    : null;
  return {
    id: row.id,
    category: row.category,
    lostDate: row.lost_date,
    nusZone: zones.get(row.nus_zone_id),
    description: payload.originalDescription,
    privateIdentifyingDetails: payload.privateIdentifyingDetails,
    photos,
    status: row.status,
    revision: row.revision,
    rejectionReason: rejection,
    fictional: Boolean(row.fictional),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    withdrawnAt: row.withdrawn_at || null,
  };
}

function visibleRows(database) {
  return database.prepare(`
    SELECT p.*, r.id AS review_id, r.public_description, r.created_at AS published_at
    FROM lost_item_posts p
    JOIN lost_item_reviews r ON r.post_id = p.id AND r.revision = p.revision AND r.decision = 'publish'
    LEFT JOIN lost_item_moderation m ON m.post_id = p.id
    WHERE p.status = 'published' AND COALESCE(m.hidden, 0) = 0
  `).all();
}

function publicPost(database, row) {
  const zone = zones.get(row.nus_zone_id);
  const photos = database.prepare(`
    SELECT photo.* FROM lost_item_review_photos approved
    JOIN lost_item_photos photo ON photo.id = approved.photo_id
    WHERE approved.review_id = ? ORDER BY photo.ordinal, photo.id
  `).all(row.review_id).map((photo, index) => ({
    ...photoSummary(photo, "/api/lost-item-photos"),
    alt: `Photo ${index + 1} of a lost ${row.category.toLowerCase()} item`,
  }));
  return {
    id: row.id,
    category: row.category,
    lostDate: row.lost_date,
    nusZone: { id: zone.id, name: zone.name },
    description: row.public_description,
    photos,
    publishedAt: row.published_at,
    fictional: Boolean(row.fictional),
  };
}

export function listPublicLostItemPosts(database, filters = {}) {
  const query = String(filters.query || "").normalize("NFKC").trim().toLowerCase();
  const category = categories.has(filters.category) ? filters.category : "";
  const zone = zones.has(filters.zone) ? filters.zone : "";
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom || "") ? filters.dateFrom : "";
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo || "") ? filters.dateTo : "";
  const sort = filters.sort === "lost_date" ? "lost_date" : "recent";
  return visibleRows(database).map((row) => publicPost(database, row))
    .filter((post) => !query || `${post.category} ${post.nusZone.name} ${post.description}`.toLowerCase().includes(query))
    .filter((post) => !category || post.category === category)
    .filter((post) => !zone || post.nusZone.id === zone)
    .filter((post) => !dateFrom || post.lostDate >= dateFrom)
    .filter((post) => !dateTo || post.lostDate <= dateTo)
    .sort((left, right) => sort === "lost_date"
      ? right.lostDate.localeCompare(left.lostDate) || left.id.localeCompare(right.id)
      : right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id));
}

export function getPublicLostItemPost(database, postId) {
  const row = visibleRows(database).find(({ id }) => id === postId);
  return row ? publicPost(database, row) : null;
}

export function createLostItemPost(database, cipher, participant, input, sanitizedPhotos, now, { fictional = false, id = randomUUID() } = {}) {
  if (!participant.display_name) fail("Complete your public profile before posting.");
  const value = submission(input, now);
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    database.prepare(`
      INSERT INTO lost_item_posts
        (id, author_participant_id, category, lost_date, nus_zone_id, status, revision, fictional, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending_review', 1, ?, ?, ?)
    `).run(id, participant.participant_id, value.category, value.lostDate, value.nusZoneId, fictional ? 1 : 0, timestamp, timestamp);
    insertPrivatePayload(database, cipher, id, 1, value);
    sanitizedPhotos.forEach((photo, ordinal) => insertPhoto(database, cipher, id, 1, ordinal, photo));
  });
  return participantPost(database, cipher, database.prepare("SELECT * FROM lost_item_posts WHERE id = ?").get(id));
}

export function listParticipantLostItemPosts(database, cipher, participantId) {
  return database.prepare("SELECT * FROM lost_item_posts WHERE author_participant_id = ? ORDER BY updated_at DESC, id").all(participantId)
    .map((row) => participantPost(database, cipher, row));
}

export function replaceLostItemPost(database, cipher, participantId, postId, input, retainedPhotoIds, sanitizedPhotos, now) {
  const current = database.prepare("SELECT * FROM lost_item_posts WHERE id = ? AND author_participant_id = ?").get(postId, participantId);
  if (!current) fail("Lost-Item Post not found.", 404);
  if (!["pending_review", "rejected"].includes(current.status)) fail("Only pending or rejected Lost-Item Posts can be edited.", 409);
  const expectedRevision = Number(input?.revision);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) fail("Lost-Item Post revision is stale.", 409);
  const value = submission(input, now);
  const retained = [...new Set(retainedPhotoIds)];
  const currentPhotos = database.prepare("SELECT id FROM lost_item_photos WHERE post_id = ? AND revision = ?").all(postId, current.revision).map(({ id }) => id);
  if (retained.some((id) => !currentPhotos.includes(id))) fail("A retained Lost-Item photo is invalid.");
  if (retained.length + sanitizedPhotos.length > 3) fail("A Lost-Item Post accepts at most three photos.");
  const revision = current.revision + 1;
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    database.prepare(`
      UPDATE lost_item_posts SET category = ?, lost_date = ?, nus_zone_id = ?, status = 'pending_review',
        revision = ?, updated_at = ?, withdrawn_at = NULL WHERE id = ?
    `).run(value.category, value.lostDate, value.nusZoneId, revision, timestamp, postId);
    insertPrivatePayload(database, cipher, postId, revision, value);
    for (const photoId of currentPhotos.filter((id) => !retained.includes(id))) database.prepare("DELETE FROM lost_item_photos WHERE id = ?").run(photoId);
    retained.forEach((photoId, ordinal) => database.prepare("UPDATE lost_item_photos SET revision = ?, ordinal = ? WHERE id = ?").run(revision, ordinal, photoId));
    sanitizedPhotos.forEach((photo, index) => insertPhoto(database, cipher, postId, revision, retained.length + index, photo));
  });
  return participantPost(database, cipher, database.prepare("SELECT * FROM lost_item_posts WHERE id = ?").get(postId));
}

export function withdrawLostItemPost(database, participantId, postId, now) {
  const post = database.prepare("SELECT status FROM lost_item_posts WHERE id = ? AND author_participant_id = ?").get(postId, participantId);
  if (!post) fail("Lost-Item Post not found.", 404);
  if (post.status === "withdrawn") fail("Lost-Item Post is already withdrawn.", 409);
  database.prepare("UPDATE lost_item_posts SET status = 'withdrawn', withdrawn_at = ?, updated_at = ? WHERE id = ?")
    .run(now.toISOString(), now.toISOString(), postId);
}

function validatePublicDescription(value) {
  const result = text(value, "Public description", 10, 1200);
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(result)
    || /(?:^|\D)\+?\d(?:[\s().-]*\d){7,14}(?:\D|$)/.test(result)
    || /(?:https?:\/\/|www\.)\S+/i.test(result)
    || /@[a-z0-9_]{4,}/i.test(result)) {
    fail("Public description must not contain contact details.");
  }
  return result;
}

export function listModeratorLostItemPosts(database, cipher, status = "pending_review") {
  if (!statuses.has(status)) fail("Lost-Item Post status is invalid.");
  return database.prepare("SELECT * FROM lost_item_posts WHERE status = ? ORDER BY created_at, id").all(status)
    .map((row) => ({
      ...participantPost(database, cipher, row),
      photos: database.prepare("SELECT * FROM lost_item_photos WHERE post_id = ? AND revision = ? ORDER BY ordinal, id").all(row.id, row.revision)
        .map((photo) => photoSummary(photo, "/api/moderation/lost-item-photos")),
    }));
}

export function reviewLostItemPost(database, actorId, postId, input, now) {
  const post = database.prepare("SELECT * FROM lost_item_posts WHERE id = ?").get(postId);
  if (!post) fail("Lost-Item Post not found.", 404);
  if (post.status !== "pending_review") fail("Only pending Lost-Item Posts can be reviewed.", 409);
  if (!Number.isInteger(input?.revision) || input.revision !== post.revision) fail("Lost-Item Post revision is stale.", 409);
  if (!new Set(["publish", "reject"]).has(input?.decision)) fail("Review decision must be publish or reject.");
  const reason = validateReason(input?.reason);
  const publicDescription = input.decision === "publish" ? validatePublicDescription(input.publicDescription) : null;
  const approvedPhotoIds = input.decision === "publish" && Array.isArray(input.approvedPhotoIds) ? [...new Set(input.approvedPhotoIds.map(String))] : [];
  const availablePhotoIds = database.prepare("SELECT id FROM lost_item_photos WHERE post_id = ? AND revision = ?").all(postId, post.revision).map(({ id }) => id);
  if (approvedPhotoIds.some((id) => !availablePhotoIds.includes(id))) fail("An approved Lost-Item photo is invalid.");
  const reviewId = randomUUID();
  withImmediateTransaction(database, () => {
    database.prepare(`
      INSERT INTO lost_item_reviews
        (id, post_id, revision, decision, public_description, moderator_participant_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(reviewId, postId, post.revision, input.decision, publicDescription, actorId, reason, now.toISOString());
    for (const photoId of approvedPhotoIds) database.prepare("INSERT INTO lost_item_review_photos (review_id, photo_id) VALUES (?, ?)").run(reviewId, photoId);
    database.prepare("UPDATE lost_item_posts SET status = ?, updated_at = ? WHERE id = ?")
      .run(input.decision === "publish" ? "published" : "rejected", now.toISOString(), postId);
    recordAudit(database, {
      eventType: input.decision === "publish" ? "lost_item_post_published" : "lost_item_post_rejected",
      actorId,
      targetType: "lost_item_post",
      targetId: postId,
      reason,
      selfDirected: actorId === post.author_participant_id,
    }, now);
  });
  return { id: postId, status: input.decision === "publish" ? "published" : "rejected", revision: post.revision };
}

function encryptedPhoto(database, cipher, photoId, condition, parameters) {
  const row = database.prepare(`SELECT photo.* FROM lost_item_photos photo ${condition}`).get(...parameters, photoId);
  if (!row) fail("Lost-Item photo not found.", 404);
  return { ...photoSummary(row, ""), bytes: cipher.decrypt(row, photoAad(row.post_id, row.id)) };
}

export function getPublicLostItemPhoto(database, cipher, photoId) {
  return encryptedPhoto(database, cipher, photoId, `
    JOIN lost_item_review_photos approved ON approved.photo_id = photo.id
    JOIN lost_item_reviews review ON review.id = approved.review_id AND review.decision = 'publish'
    JOIN lost_item_posts post ON post.id = photo.post_id AND post.status = 'published' AND post.revision = review.revision
    LEFT JOIN lost_item_moderation moderation ON moderation.post_id = post.id
    WHERE COALESCE(moderation.hidden, 0) = 0 AND photo.id = ?
  `, []);
}

export function getParticipantLostItemPhoto(database, cipher, participantId, postId, photoId) {
  return encryptedPhoto(database, cipher, photoId, `
    JOIN lost_item_posts post ON post.id = photo.post_id
    WHERE post.author_participant_id = ? AND post.id = ? AND photo.id = ?
  `, [participantId, postId]);
}

export function getModeratorLostItemPhoto(database, cipher, photoId) {
  return encryptedPhoto(database, cipher, photoId, "WHERE photo.id = ?", []);
}

export function setLostItemVisibility(database, actorId, postId, hidden, reason, now) {
  database.prepare(`
    INSERT INTO lost_item_moderation (post_id, hidden, reason, updated_by_participant_id, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET hidden = excluded.hidden, reason = excluded.reason,
      updated_by_participant_id = excluded.updated_by_participant_id, updated_at = excluded.updated_at
  `).run(postId, hidden ? 1 : 0, reason, actorId, now.toISOString());
}

export function hideReportedLostItemPost(database, actorId, postId, reason, now) {
  const post = database.prepare(`
    SELECT p.author_participant_id, p.status, COALESCE(m.hidden, 0) AS hidden
    FROM lost_item_posts p LEFT JOIN lost_item_moderation m ON m.post_id = p.id WHERE p.id = ?
  `).get(postId);
  if (!post || post.status !== "published" || post.hidden) return { outcome: "already_unavailable", authorParticipantId: post?.author_participant_id || null };
  setLostItemVisibility(database, actorId, postId, true, reason, now);
  return { outcome: "hidden", authorParticipantId: post.author_participant_id };
}

export function lostItemEvidence(database, postId) {
  const post = getPublicLostItemPost(database, postId);
  if (!post) fail("Reported content not found.", 404);
  return { postId: post.id, label: `${post.category} lost in ${post.nusZone.name}`, text: post.description };
}
