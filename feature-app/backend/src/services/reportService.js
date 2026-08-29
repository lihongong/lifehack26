import { randomUUID } from "node:crypto";
import { demoListings } from "../data/demoListings.js";
import { hiddenListingIds, setCommentVisibility, setListingVisibility } from "./moderationService.js";
import { addNotification } from "./notificationService.js";
import { recordAudit, validateReason } from "./privilegeService.js";
import { withImmediateTransaction } from "../db/database.js";

const categories = new Set(["fraud", "safety", "privacy", "staleness"]);

function error(message, status) {
  return Object.assign(new Error(message), { status });
}

function marketplaceListingEvidence(database, targetId) {
  const listing = demoListings.find(({ id }) => id === targetId);
  if (!listing || hiddenListingIds(database).has(targetId)) throw error("Reported content not found.", 404);
  return { postId: listing.id, label: listing.title, text: listing.description };
}

function commentEvidence(database, targetId) {
  const comment = database.prepare(`
    SELECT c.body, c.post_id, c.deleted_at, p.display_name,
      COALESCE(cm.hidden, 0) AS hidden
    FROM comments c
    JOIN participants p ON p.id = c.author_participant_id
    LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
    WHERE c.id = ?
  `).get(targetId);
  if (!comment || comment.deleted_at || comment.hidden || hiddenListingIds(database).has(comment.post_id)) {
    throw error("Reported content not found.", 404);
  }
  return { postId: comment.post_id, label: `${comment.display_name}'s Comment`, text: comment.body };
}

function publicSubmittedReport(report) {
  return {
    id: report.id,
    targetType: report.target_type,
    targetId: report.target_id,
    category: report.category,
    createdAt: report.created_at,
  };
}

export function createContentReport(database, participant, input, now) {
  if (!participant.display_name) throw error("Complete your public profile before reporting content.", 422);
  const category = String(input?.category || "");
  if (!categories.has(category)) throw error("Content Report category is invalid.", 422);
  const targetType = String(input?.targetType || "");
  const targetId = String(input?.targetId || "");
  const id = randomUUID();
  const targetHandler = targetHandlers[targetType];
  if (!targetHandler) throw error("Content Report target type is invalid.", 422);
  withImmediateTransaction(database, () => {
    const evidence = targetHandler.evidence(database, targetId);
    database.prepare(`
      INSERT INTO content_reports (
        id, target_type, target_id, target_post_id, reporter_participant_id,
        category, evidence_label, evidence_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetType,
      targetId,
      evidence.postId,
      participant.participant_id,
      category,
      evidence.label,
      evidence.text,
      now.toISOString(),
    );
  });
  return publicSubmittedReport(database.prepare("SELECT * FROM content_reports WHERE id = ?").get(id));
}

export function listOpenContentReports(database) {
  return database.prepare(`
    SELECT cr.id, cr.target_type AS targetType, cr.target_id AS targetId,
      cr.target_post_id AS targetPostId, cr.category,
      cr.evidence_label AS evidenceLabel, cr.evidence_text AS evidenceText,
      cr.created_at AS createdAt, p.public_id AS reporterPublicId,
      p.display_name AS reporterDisplayName
    FROM content_reports cr
    JOIN participants p ON p.id = cr.reporter_participant_id
    LEFT JOIN report_resolutions rr ON rr.report_id = cr.id
    WHERE rr.report_id IS NULL
    ORDER BY cr.created_at, cr.id
  `).all().map((report) => ({
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    targetPostId: report.targetPostId,
    category: report.category,
    evidence: { label: report.evidenceLabel, text: report.evidenceText },
    reporter: { publicId: report.reporterPublicId, displayName: report.reporterDisplayName },
    createdAt: report.createdAt,
  }));
}

function addResolutionNotification(database, participantId, outcome, reportId, now) {
  const outcomeMessage = outcome === "hidden"
    ? "the content was hidden"
    : outcome === "already_unavailable"
      ? "the content was already unavailable"
      : "no content was hidden";
  addNotification(database, {
    participantId,
    type: "report_resolved",
    targetType: "content_report",
    targetId: reportId,
    message: `Your Content Report was resolved: ${outcomeMessage}.`,
  }, now);
}

function hideReportedComment(database, actorId, report, _reason, now) {
  const comment = database.prepare(`
    SELECT c.author_participant_id, c.deleted_at, c.post_id,
      COALESCE(cm.hidden, 0) AS hidden
    FROM comments c
    LEFT JOIN comment_moderation cm ON cm.comment_id = c.id
    WHERE c.id = ?
  `).get(report.target_id);
  if (!comment || comment.deleted_at || comment.hidden || hiddenListingIds(database).has(comment?.post_id)) {
    return { outcome: "already_unavailable", authorParticipantId: comment?.author_participant_id || null };
  }
  setCommentVisibility(database, actorId, report.target_id, true, now);
  return { outcome: "hidden", authorParticipantId: comment.author_participant_id };
}

function hideReportedListing(database, actorId, report, reason, now) {
  const listing = demoListings.find(({ id }) => id === report.target_id);
  if (!listing || hiddenListingIds(database).has(report.target_id)) {
    return { outcome: "already_unavailable", authorParticipantId: null };
  }
  setListingVisibility(database, actorId, report.target_id, true, reason, now);
  const author = database.prepare("SELECT id FROM participants WHERE external_subject = ?").get(listing.ownerSubject);
  return { outcome: "hidden", authorParticipantId: author?.id || null };
}

const targetHandlers = Object.freeze({
  marketplace_listing: Object.freeze({
    evidence: marketplaceListingEvidence,
    hide: hideReportedListing,
    moderatedMessage: "Your Marketplace Listing was hidden by a Moderator.",
  }),
  comment: Object.freeze({
    evidence: commentEvidence,
    hide: hideReportedComment,
    moderatedMessage: "Your Comment was hidden by a Moderator.",
  }),
});

function removeUnreferencedDeletedComment(database, report) {
  if (report.target_type !== "comment") return;
  const retained = database.prepare(`
    SELECT 1
    FROM comments c
    WHERE c.id = ? AND (
      c.deleted_at IS NULL
      OR EXISTS (SELECT 1 FROM comments reply WHERE reply.parent_comment_id = c.id)
      OR EXISTS (
        SELECT 1 FROM content_reports cr
        LEFT JOIN report_resolutions rr ON rr.report_id = cr.id
        WHERE cr.target_type = 'comment' AND cr.target_id = c.id AND rr.report_id IS NULL
      )
    )
  `).get(report.target_id);
  if (!retained) database.prepare("DELETE FROM comments WHERE id = ?").run(report.target_id);
}

export function resolveContentReport(database, actor, reportId, input, now) {
  const requestedOutcome = String(input?.outcome || "");
  if (!new Set(["hidden", "dismissed"]).has(requestedOutcome)) {
    throw error("Content Report outcome is invalid.", 422);
  }
  const reason = validateReason(input?.reason);
  const report = database.prepare(`
    SELECT cr.*, rr.report_id AS resolved
    FROM content_reports cr
    LEFT JOIN report_resolutions rr ON rr.report_id = cr.id
    WHERE cr.id = ?
  `).get(reportId);
  if (!report) throw error("Content Report not found.", 404);
  if (report.resolved) throw error("Content Report is already resolved.", 409);

  const targetHandler = targetHandlers[report.target_type];
  if (!targetHandler) throw error("Content Report target type is invalid.", 422);
  return withImmediateTransaction(database, () => {
    let outcome = requestedOutcome;
    let authorParticipantId = null;
    if (requestedOutcome === "hidden") {
      const result = targetHandler.hide(database, actor.participant_id, report, reason, now);
      outcome = result.outcome;
      authorParticipantId = result.authorParticipantId;
    }
    database.prepare(`
      INSERT INTO report_resolutions (
        report_id, outcome, moderator_participant_id, reason, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(reportId, outcome, actor.participant_id, reason, now.toISOString());
    recordAudit(database, {
      eventType: `content_report_${outcome}`,
      actorId: actor.participant_id,
      targetType: "content_report",
      targetId: reportId,
      reason,
      selfDirected: actor.participant_id === report.reporter_participant_id || actor.participant_id === authorParticipantId,
    }, now);
    addResolutionNotification(database, report.reporter_participant_id, outcome, reportId, now);
    if (outcome === "hidden" && authorParticipantId && authorParticipantId !== report.reporter_participant_id) {
      addNotification(database, {
        participantId: authorParticipantId,
        type: "comment_moderated",
        targetType: report.target_type,
        targetId: report.target_id,
        message: targetHandler.moderatedMessage,
      }, now);
    }
    removeUnreferencedDeletedComment(database, report);
    return { reportId, outcome, reason, createdAt: now.toISOString() };
  });
}
