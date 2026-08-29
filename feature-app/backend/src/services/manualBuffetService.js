import { randomUUID } from "node:crypto";
import { nusZones, publicZones } from "../data/nusZones.js";
import { withImmediateTransaction } from "../db/database.js";
import { recordAudit, validateReason } from "./privilegeService.js";
import { deliverEligibleAlerts, MANUAL_BUFFET_FEED_ID } from "./buffetAlertService.js";

const zoneIds = new Set(nusZones.map(({ id }) => id));

function validationError(message) {
  return Object.assign(new Error(message), { status: 422 });
}

function requiredText(value, field, minimum, maximum) {
  const text = String(value || "").normalize("NFKC").trim();
  if (text.length < minimum || text.length > maximum) {
    throw validationError(`${field} must be ${minimum}-${maximum} characters.`);
  }
  return text;
}

function collectionDeadline(value, now) {
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime()) || deadline <= now) {
    throw validationError("Collection deadline must be a valid future time.");
  }
  return deadline.toISOString();
}

function persistedPost(row) {
  return {
    id: row.id,
    internalId: row.id,
    referenceId: row.referenceId,
    title: row.title,
    description: row.description,
    source: "ShareNUS",
    sourceTime: row.createdAt,
    reportedLocation: row.reportedLocation,
    zoneId: row.zoneId,
    collectionDeadline: row.collectionDeadline,
    fictional: false,
    origin: "manual",
  };
}

export function listManualBuffetPosts(database, now = new Date(), { includeExpired = false } = {}) {
  const expiryClause = includeExpired ? "" : "AND collection_deadline > ?";
  return database.prepare(`
    SELECT post.id, ref.public_id AS referenceId, post.title, post.description,
      post.reported_location AS reportedLocation, post.zone_id AS zoneId,
      post.collection_deadline AS collectionDeadline, post.created_at AS createdAt
    FROM manual_buffet_posts post
    JOIN buffet_post_refs ref ON ref.id = post.id
    WHERE deleted_at IS NULL ${expiryClause}
    ORDER BY created_at DESC, post.id
  `).all(...(includeExpired ? [] : [now.toISOString()])).map(persistedPost);
}

export function getManualBuffetManagement(database, now = new Date()) {
  return {
    posts: listManualBuffetPosts(database, now, { includeExpired: true }).map((post) => ({
      id: post.id,
      title: post.title,
      description: post.description,
      reportedLocation: post.reportedLocation,
      zoneId: post.zoneId,
      collectionDeadline: post.collectionDeadline,
      expired: post.collectionDeadline <= now.toISOString(),
    })),
    zones: publicZones(),
  };
}

export function createManualBuffetPost(database, actor, input, now) {
  const title = requiredText(input?.title, "Title", 3, 160);
  const description = requiredText(input?.description, "Description", 10, 2000);
  const reportedLocation = requiredText(input?.reportedLocation, "Reported location", 3, 300);
  const zoneId = input?.zoneId || null;
  if (zoneId && !zoneIds.has(zoneId)) throw validationError("NUS Zone is invalid.");
  const deadline = collectionDeadline(input?.collectionDeadline, now);
  const reason = validateReason(input?.reason);
  const id = randomUUID();
  const publicId = randomUUID();

  withImmediateTransaction(database, () => {
    database.prepare("INSERT INTO buffet_post_refs (id, public_id, origin) VALUES (?, ?, 'manual')").run(id, publicId);
    database.prepare(`
      INSERT INTO manual_buffet_posts (
        id, title, description, reported_location, zone_id, collection_deadline,
        created_by_participant_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description, reportedLocation, zoneId, deadline, actor.participant_id, now.toISOString());
    database.prepare(`
      INSERT INTO buffet_posts (
        id, source_feed_id, source_post_id, title, description, source_name, source_time,
        reported_location, zone_id, collection_deadline, fictional, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'ShareNUS', ?, ?, ?, ?, 0, ?)
    `).run(id, MANUAL_BUFFET_FEED_ID, id, title, description, now.toISOString(), reportedLocation, zoneId, deadline, now.toISOString());
    database.prepare("INSERT INTO buffet_post_states (buffet_post_id, state, updated_at) VALUES (?, 'active', ?)")
      .run(id, now.toISOString());
    recordAudit(database, {
      eventType: "buffet_post_created",
      actorId: actor.participant_id,
      targetType: "buffet_post",
      targetId: id,
      reason,
      selfDirected: true,
    }, now);
    deliverEligibleAlerts(database, now, MANUAL_BUFFET_FEED_ID, null, { withinTransaction: true });
  });
  return persistedPost({
    id,
    referenceId: publicId,
    title,
    description,
    reportedLocation,
    zoneId,
    collectionDeadline: deadline,
    createdAt: now.toISOString(),
  });
}

export function deleteManualBuffetPost(database, actor, postId, reasonInput, now) {
  const reason = validateReason(reasonInput);
  return withImmediateTransaction(database, () => {
    const post = database.prepare(`
      SELECT id, created_by_participant_id AS createdByParticipantId
      FROM manual_buffet_posts
      WHERE id = ? AND deleted_at IS NULL
    `).get(postId);
    if (!post) throw Object.assign(new Error("Manual Buffet Post not found."), { status: 404 });
    database.prepare(`
      UPDATE manual_buffet_posts
      SET deleted_by_participant_id = ?, deleted_at = ?, deletion_reason = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(actor.participant_id, now.toISOString(), reason, postId);
    database.prepare("UPDATE buffet_post_states SET state = 'confirmed_expired', updated_at = ? WHERE buffet_post_id = ?")
      .run(now.toISOString(), postId);
    const openReview = database.prepare("SELECT id FROM buffet_food_gone_reviews WHERE buffet_post_id = ? AND status = 'open'").get(postId);
    if (openReview) {
      database.prepare("INSERT INTO buffet_review_resolutions (review_id, outcome, moderator_participant_id, reason, created_at) VALUES (?, 'expired', ?, ?, ?)")
        .run(openReview.id, actor.participant_id, reason, now.toISOString());
      database.prepare("UPDATE buffet_food_gone_reviews SET status = 'resolved', resolved_at = ? WHERE id = ?")
        .run(now.toISOString(), openReview.id);
      recordAudit(database, {
        eventType: "buffet_post_expired",
        actorId: actor.participant_id,
        targetType: "buffet_post",
        targetId: postId,
        reason,
        selfDirected: false,
      }, now);
    }
    recordAudit(database, {
      eventType: "buffet_post_deleted",
      actorId: actor.participant_id,
      targetType: "buffet_post",
      targetId: postId,
      reason,
      selfDirected: actor.participant_id === post.createdByParticipantId,
    }, now);
  });
}
