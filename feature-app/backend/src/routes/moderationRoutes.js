import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requireRole } from "../middleware/requireRole.js";
import { moderateComment, moderateListing, moderatorComments, moderatorListings } from "../services/moderationService.js";
import { listOpenContentReports, resolveContentReport } from "../services/reportService.js";
import {
  getSourceAuthorConsents,
  getSourceDiscrepancies,
  recordSourceAuthorConsent,
  resolveSourceDiscrepancy,
  withdrawSourceAuthorConsent,
} from "../services/sourceFeedService.js";
import {
  getModeratorLostItemPhoto,
  listModeratorLostItemPosts,
  reviewLostItemPost,
} from "../services/lostItemService.js";

function sendPrivatePhoto(response, photo) {
  response.set({
    "content-type": photo.mimeType,
    "content-length": String(photo.bytes.length),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
  });
  response.send(photo.bytes);
}

export function moderationRoutes({ database, clock, sourceIdentitySecret, lostItemCipher }) {
  const router = Router();
  router.use(requireParticipant, requireRole("moderator"));
  router.get("/marketplace", (_request, response) => response.json({ listings: moderatorListings(database, clock.now()) }));
  router.get("/reports", (_request, response) => response.json({ reports: listOpenContentReports(database) }));
  router.get("/comments", (_request, response) => response.json({ comments: moderatorComments(database, clock.now()) }));
  router.patch("/reports/:reportId", (request, response) => {
    const resolution = resolveContentReport(
      database,
      request.participant,
      request.params.reportId,
      request.body,
      clock.now(),
      sourceIdentitySecret,
    );
    response.json({ resolution });
  });
  router.patch("/comments/:commentId", (request, response) => {
    const comment = moderateComment(
      database,
      request.participant,
      request.params.commentId,
      request.body?.hidden,
      request.body?.reason,
      clock.now(),
    );
    response.json({ comment });
  });
  router.patch("/marketplace/:listingId", (request, response) => {
    const listing = moderateListing(database, request.participant, request.params.listingId, request.body?.hidden, request.body?.reason, clock.now(), sourceIdentitySecret);
    response.json({ listing });
  });
  router.get("/lost-item-posts", (request, response) => {
    response.json({ posts: listModeratorLostItemPosts(database, lostItemCipher, request.query.status || "pending_review") });
  });
  router.post("/lost-item-posts/:postId/review", (request, response) => {
    const review = reviewLostItemPost(
      database,
      request.participant.participant_id,
      request.params.postId,
      request.body || {},
      clock.now(),
    );
    response.json({ review });
  });
  router.get("/lost-item-photos/:photoId", (request, response) => {
    sendPrivatePhoto(response, getModeratorLostItemPhoto(database, lostItemCipher, request.params.photoId));
  });
  router.get("/source-discrepancies", (request, response) => {
    response.json({ discrepancies: getSourceDiscrepancies(database, request.query.status || "open") });
  });
  router.post("/source-discrepancies/:discrepancyId/resolution", (request, response) => {
    const discrepancy = resolveSourceDiscrepancy(
      database,
      request.participant.participant_id,
      request.params.discrepancyId,
      request.body?.decision,
      request.body?.reason,
      clock.now(),
      request.body?.correctedListing,
    );
    response.json({ discrepancy });
  });
  router.get("/source-feeds/:feedId/author-consents", (request, response) => {
    response.json({ consents: getSourceAuthorConsents(database, request.params.feedId) });
  });
  router.post("/source-feeds/:feedId/author-consents", (request, response) => {
    const consent = recordSourceAuthorConsent(
      database,
      request.participant.participant_id,
      request.params.feedId,
      request.body || {},
      clock.now(),
      sourceIdentitySecret,
    );
    response.status(201).json({ consent });
  });
  router.delete("/source-feeds/:feedId/author-consents/:consentId", (request, response) => {
    withdrawSourceAuthorConsent(
      database,
      request.participant.participant_id,
      request.params.feedId,
      request.params.consentId,
      request.body?.reason,
      clock.now(),
    );
    response.status(204).end();
  });
  return router;
}
