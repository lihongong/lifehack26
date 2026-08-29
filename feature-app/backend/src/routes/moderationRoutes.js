import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requireRole } from "../middleware/requireRole.js";
import { moderateComment, moderateListing, moderatorListings } from "../services/moderationService.js";
import { listOpenContentReports, resolveContentReport } from "../services/reportService.js";

export function moderationRoutes({ database, clock }) {
  const router = Router();
  router.use(requireParticipant, requireRole("moderator"));
  router.get("/marketplace", (_request, response) => response.json({ listings: moderatorListings(database) }));
  router.get("/reports", (_request, response) => response.json({ reports: listOpenContentReports(database) }));
  router.patch("/reports/:reportId", (request, response) => {
    const resolution = resolveContentReport(
      database,
      request.participant,
      request.params.reportId,
      request.body,
      clock.now(),
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
    const listing = moderateListing(database, request.participant, request.params.listingId, request.body?.hidden, request.body?.reason, clock.now());
    response.json({ listing });
  });
  return router;
}
