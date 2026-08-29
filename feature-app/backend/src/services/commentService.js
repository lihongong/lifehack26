import { randomUUID } from "node:crypto";
import { demoListings } from "../data/demoListings.js";
import { hiddenListingIds } from "./moderationService.js";
import { addNotification } from "./notificationService.js";
import { withImmediateTransaction } from "../db/database.js";

const marketplacePostType = "marketplace_listing";

function error(message, status) {
  return Object.assign(new Error(message), { status });
}

function requireVisibleListing(database, listingId) {
  const listing = demoListings.find(({ id }) => id === listingId);
  if (!listing || hiddenListingIds(database).has(listingId)) {
    throw error("Marketplace Listing not found.", 404);
  }
  return listing;
}

function validateBody(input) {
  const body = String(input || "").normalize("NFKC").trim();
  if (body.length < 1 || body.length > 1000) {
    throw error("Comment must be 1-1000 characters.", 422);
  }
  return body;
}

export function detectContactDetails(body) {
  const detected = [];
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(body)) detected.push("email");
  if (/(?:^|\D)\+?\d(?:[\s().-]*\d){7,14}(?:\D|$)/.test(body)) detected.push("phone");
  return detected;
}

function publicComment(row) {
  const hidden = Boolean(row.hidden);
  return {
    id: row.id,
    parentCommentId: row.parent_comment_id || null,
    body: row.deleted_at || hidden ? null : row.body,
    edited: Boolean(row.edited_at),
    deleted: Boolean(row.deleted_at),
    hidden,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      publicId: row.public_id,
      displayName: row.display_name,
    },
  };
}

function validateContactConfirmation(body, confirmed) {
  const detectedContactTypes = detectContactDetails(body);
  if (detectedContactTypes.length && confirmed !== true) {
    throw Object.assign(error("Confirm before sharing contact details publicly.", 409), {
      code: "CONTACT_DETAILS_CONFIRMATION_REQUIRED",
      detectedContactTypes,
    });
  }
}

function findCommentRow(database, commentId) {
  return database.prepare(`
    SELECT c.*, p.public_id, p.display_name, COALESCE(cm.hidden, 0) AS hidden
    FROM comments c
    JOIN participants p ON p.id = c.author_participant_id
    LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
    WHERE c.id = ?
  `).get(commentId);
}

export function listMarketplaceComments(database, listingId) {
  requireVisibleListing(database, listingId);
  const comments = database.prepare(`
    SELECT c.*, p.public_id, p.display_name, COALESCE(cm.hidden, 0) AS hidden
    FROM comments c
    JOIN participants p ON p.id = c.author_participant_id
    LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
    WHERE c.post_type = ? AND c.post_id = ?
    ORDER BY c.created_at, c.id
  `).all(marketplacePostType, listingId).map(publicComment);
  const topLevel = comments.filter(({ parentCommentId }) => !parentCommentId);
  const replies = new Map(topLevel.map(({ id }) => [id, []]));
  for (const comment of comments.filter(({ parentCommentId }) => parentCommentId)) {
    replies.get(comment.parentCommentId)?.push(comment);
  }
  return topLevel.map((comment) => ({ ...comment, replies: replies.get(comment.id) }));
}

export function createMarketplaceComment(database, participant, listingId, input, now) {
  requireVisibleListing(database, listingId);
  if (!participant.display_name) throw error("Complete your public profile before commenting.", 422);
  const body = validateBody(input?.body);
  validateContactConfirmation(body, input?.confirmContactDetails);
  const parentCommentId = input?.parentCommentId || null;
  let parent = null;
  if (parentCommentId) {
    parent = database.prepare(`
      SELECT c.parent_comment_id, c.post_type, c.post_id, c.deleted_at,
        c.author_participant_id, COALESCE(cm.hidden, 0) AS hidden
      FROM comments c LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
      WHERE c.id = ?
    `).get(parentCommentId);
    if (!parent || parent.post_type !== marketplacePostType || parent.post_id !== listingId) {
      throw error("Parent Comment not found.", 404);
    }
    if (parent.parent_comment_id) throw error("Comments support one reply level.", 422);
    if (parent.deleted_at) throw error("Replies cannot be added to a removed Comment.", 409);
    if (parent.hidden) throw error("Replies cannot be added to a hidden Comment.", 409);
  }
  const id = randomUUID();
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    database.prepare(`
      INSERT INTO comments (
        id, post_type, post_id, parent_comment_id, author_participant_id,
        body, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, marketplacePostType, listingId, parentCommentId, participant.participant_id, body, timestamp, timestamp);
    if (parent && parent.author_participant_id !== participant.participant_id) {
      addNotification(database, {
        participantId: parent.author_participant_id,
        type: "reply_received",
        targetType: "comment",
        targetId: id,
        message: `${participant.display_name} replied to your Comment.`,
      }, now);
    }
  });
  return publicComment(findCommentRow(database, id));
}

export function editComment(database, participant, commentId, input, now) {
  const comment = findCommentRow(database, commentId);
  if (!comment || comment.deleted_at) throw error("Comment not found.", 404);
  if (comment.author_participant_id !== participant.participant_id) {
    throw error("Only the Comment author can edit it.", 403);
  }
  requireVisibleListing(database, comment.post_id);
  const body = validateBody(input?.body);
  validateContactConfirmation(body, input?.confirmContactDetails);
  const timestamp = now.toISOString();
  database.prepare("UPDATE comments SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?")
    .run(body, timestamp, timestamp, commentId);
  return publicComment(findCommentRow(database, commentId));
}

export function deleteComment(database, participant, commentId, now) {
  const comment = findCommentRow(database, commentId);
  if (!comment) throw error("Comment not found.", 404);
  if (comment.author_participant_id !== participant.participant_id) {
    throw error("Only the Comment author can delete it.", 403);
  }
  if (comment.deleted_at) throw error("Comment is already removed.", 409);
  const hasReplies = Boolean(database.prepare("SELECT 1 FROM comments WHERE parent_comment_id = ? LIMIT 1").get(commentId));
  const hasOpenReport = Boolean(database.prepare(`
    SELECT 1 FROM content_reports cr
    LEFT JOIN report_resolutions rr ON rr.report_id = cr.id
    WHERE cr.target_type = 'comment' AND cr.target_id = ? AND rr.report_id IS NULL
    LIMIT 1
  `).get(commentId));
  if (hasReplies || hasOpenReport) {
    const timestamp = now.toISOString();
    database.prepare("UPDATE comments SET body = '', deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(timestamp, timestamp, commentId);
  } else {
    database.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
  }
}
