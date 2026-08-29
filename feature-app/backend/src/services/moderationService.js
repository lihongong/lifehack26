import { demoListings } from "../data/demoListings.js";
import { recordAudit, validateReason } from "./privilegeService.js";
import { addNotification } from "./notificationService.js";
import { withImmediateTransaction } from "../db/database.js";

const publicListing = ({ ownerSubject: _ownerSubject, ...listing }) => listing;

export function hiddenListingIds(database) {
  return new Set(database.prepare("SELECT listing_id FROM marketplace_moderation WHERE hidden = 1").all().map(({ listing_id }) => listing_id));
}

export function moderatorListings(database) {
  const states = new Map(database.prepare("SELECT listing_id, hidden, reason, updated_at AS updatedAt FROM marketplace_moderation").all().map((row) => [row.listing_id, row]));
  return demoListings.map((listing) => {
    const state = states.get(listing.id);
    return { ...publicListing(listing), hidden: Boolean(state?.hidden), moderationReason: state?.reason || null, moderatedAt: state?.updatedAt || null };
  });
}

export function setListingVisibility(database, actorId, listingId, hidden, reason, now) {
  database.prepare(`
    INSERT INTO marketplace_moderation (listing_id, hidden, reason, updated_by_participant_id, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(listing_id) DO UPDATE SET hidden = excluded.hidden, reason = excluded.reason,
      updated_by_participant_id = excluded.updated_by_participant_id, updated_at = excluded.updated_at
  `).run(listingId, hidden ? 1 : 0, reason, actorId, now.toISOString());
}

export function setCommentVisibility(database, actorId, commentId, hidden, now) {
  database.prepare(`
    INSERT INTO comment_moderation (comment_id, hidden, updated_by_participant_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(comment_id) DO UPDATE SET hidden = excluded.hidden,
      updated_by_participant_id = excluded.updated_by_participant_id,
      updated_at = excluded.updated_at
  `).run(commentId, hidden ? 1 : 0, actorId, now.toISOString());
}

export function moderateListing(database, actor, listingId, hidden, reasonInput, now) {
  if (typeof hidden !== "boolean") throw Object.assign(new Error("Hidden must be true or false."), { status: 422 });
  const reason = validateReason(reasonInput);
  const listing = demoListings.find(({ id }) => id === listingId);
  if (!listing) throw Object.assign(new Error("Marketplace Listing not found."), { status: 404 });
  const current = database.prepare("SELECT hidden FROM marketplace_moderation WHERE listing_id = ?").get(listingId);
  if (Boolean(current?.hidden) === hidden) throw Object.assign(new Error(`Marketplace Listing is already ${hidden ? "hidden" : "visible"}.`), { status: 409 });
  withImmediateTransaction(database, () => {
    setListingVisibility(database, actor.participant_id, listingId, hidden, reason, now);
    recordAudit(database, {
      eventType: hidden ? "marketplace_listing_hidden" : "marketplace_listing_restored",
      actorId: actor.participant_id,
      targetType: "marketplace_listing",
      targetId: listingId,
      reason,
      selfDirected: listing.ownerSubject === actor.external_subject,
    }, now);
  });
  return moderatorListings(database).find(({ id }) => id === listingId);
}

export function moderateComment(database, actor, commentId, hidden, reasonInput, now) {
  if (hidden !== true) throw Object.assign(new Error("Hidden must be true."), { status: 422 });
  const reason = validateReason(reasonInput);
  const comment = database.prepare(`
    SELECT c.id, c.author_participant_id, c.deleted_at,
      COALESCE(cm.hidden, 0) AS hidden
    FROM comments c
    LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
    WHERE c.id = ?
  `).get(commentId);
  if (!comment || comment.deleted_at) throw Object.assign(new Error("Comment not found."), { status: 404 });
  if (comment.hidden) throw Object.assign(new Error("Comment is already hidden."), { status: 409 });
  withImmediateTransaction(database, () => {
    setCommentVisibility(database, actor.participant_id, commentId, true, now);
    recordAudit(database, {
      eventType: "comment_hidden",
      actorId: actor.participant_id,
      targetType: "comment",
      targetId: commentId,
      reason,
      selfDirected: actor.participant_id === comment.author_participant_id,
    }, now);
    addNotification(database, {
      participantId: comment.author_participant_id,
      type: "comment_moderated",
      targetType: "comment",
      targetId: commentId,
      message: "Your Comment was hidden by a Moderator.",
    }, now);
  });
  return { id: commentId, hidden: true };
}

export function moderatorComments(database) {
  return database.prepare(`
    SELECT c.id, c.post_id AS postId, c.body, c.created_at AS createdAt,
      p.public_id AS authorPublicId, p.display_name AS authorDisplayName,
      COALESCE(cm.hidden, 0) AS hidden
    FROM comments c
    JOIN participants p ON p.id = c.author_participant_id
    LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
    WHERE c.deleted_at IS NULL
    ORDER BY c.created_at, c.id
  `).all().map((comment) => ({
    ...comment,
    hidden: Boolean(comment.hidden),
    listingTitle: demoListings.find(({ id }) => id === comment.postId)?.title || "Unknown Marketplace Listing",
  }));
}
