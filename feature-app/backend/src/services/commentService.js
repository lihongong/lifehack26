import { randomUUID } from "node:crypto";
import { hiddenListingIds } from "./moderationService.js";
import { findListings } from "./listingsService.js";
import { addNotification } from "./notificationService.js";
import { withImmediateTransaction } from "../db/database.js";
import { getPublicLostItemPost } from "./lostItemService.js";
import { getPublicFoundItem, getPublicFoundItemReport } from "./foundItemService.js";

const marketplacePostType = "marketplace_listing";
const lostItemPostType = "lost_item_post";
const foundItemReportType = "found_item_report";
const foundItemType = "found_item";

function error(message, status) {
  return Object.assign(new Error(message), { status });
}

export function requireVisibleCommentPost(database, postType, postId, now) {
  if (postType === marketplacePostType) {
    const listing = findListings(database, {}, hiddenListingIds(database), { now }).find(({ id }) => id === postId);
    if (listing) return listing;
  }
  if (postType === lostItemPostType) {
    const post = getPublicLostItemPost(database, postId);
    if (post) return post;
  }
  if (postType === foundItemReportType) {
    const report = getPublicFoundItemReport(database, postId);
    if (report) return report;
  }
  if (postType === foundItemType) {
    const item = getPublicFoundItem(database, postId);
    if (item) return item;
  }
  throw error("Comment post not found.", 404);
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

export function listPostComments(database, postType, postId, now) {
  requireVisibleCommentPost(database, postType, postId, now);
  const comments = database.prepare(`
    SELECT c.*, p.public_id, p.display_name, COALESCE(cm.hidden, 0) AS hidden
    FROM comments c
    JOIN participants p ON p.id = c.author_participant_id
    LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
    WHERE c.post_type = ? AND c.post_id = ?
    ORDER BY c.created_at, c.id
  `).all(postType, postId).map(publicComment);
  const topLevel = comments.filter(({ parentCommentId }) => !parentCommentId);
  const replies = new Map(topLevel.map(({ id }) => [id, []]));
  for (const comment of comments.filter(({ parentCommentId }) => parentCommentId)) {
    replies.get(comment.parentCommentId)?.push(comment);
  }
  return topLevel.map((comment) => ({ ...comment, replies: replies.get(comment.id) }));
}

export function createPostComment(database, participant, postType, postId, input, now) {
  requireVisibleCommentPost(database, postType, postId, now);
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
    if (!parent || parent.post_type !== postType || parent.post_id !== postId) {
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
    `).run(id, postType, postId, parentCommentId, participant.participant_id, body, timestamp, timestamp);
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
  requireVisibleCommentPost(database, comment.post_type, comment.post_id, now);
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
