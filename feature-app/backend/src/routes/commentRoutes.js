import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requirePolicyAcceptance } from "../middleware/requirePolicyAcceptance.js";
import {
  createMarketplaceComment,
  deleteComment,
  editComment,
  listMarketplaceComments,
} from "../services/commentService.js";
import { listNotifications } from "../services/notificationService.js";

export function commentRoutes({ database, clock }) {
  const router = Router();
  const requireCommentPolicy = requirePolicyAcceptance({ database, action: "comments" });

  router.get("/listings/:listingId/comments", (request, response) => {
    response.json({ comments: listMarketplaceComments(database, request.params.listingId) });
  });
  router.post(
    "/listings/:listingId/comments",
    requireParticipant,
    requireCommentPolicy,
    (request, response) => {
      const comment = createMarketplaceComment(
        database,
        request.participant,
        request.params.listingId,
        request.body,
        clock.now(),
      );
      response.status(201).json({ comment });
    },
  );
  router.patch("/comments/:commentId", requireParticipant, requireCommentPolicy, (request, response) => {
    const comment = editComment(
      database,
      request.participant,
      request.params.commentId,
      request.body,
      clock.now(),
    );
    response.json({ comment });
  });
  router.delete("/comments/:commentId", requireParticipant, (request, response) => {
    deleteComment(database, request.participant, request.params.commentId, clock.now());
    response.status(204).end();
  });
  router.get("/me/notifications", requireParticipant, (request, response) => {
    response.json({
      notifications: listNotifications(database, request.participant.participant_id),
    });
  });
  return router;
}
