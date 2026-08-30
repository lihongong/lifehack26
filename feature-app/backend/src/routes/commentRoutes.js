import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requirePolicyAcceptance } from "../middleware/requirePolicyAcceptance.js";
import {
  createPostComment,
  deleteComment,
  editComment,
  listPostComments,
} from "../services/commentService.js";
import { listNotifications } from "../services/notificationService.js";

export function commentRoutes({ database, clock }) {
  const router = Router();
  const requireCommentPolicy = requirePolicyAcceptance({ database, action: "comments" });

  router.get("/listings/:listingId/comments", (request, response) => {
    response.json({ comments: listPostComments(database, "marketplace_listing", request.params.listingId, clock.now()) });
  });
  router.post(
    "/listings/:listingId/comments",
    requireParticipant,
    requireCommentPolicy,
    (request, response) => {
      const comment = createPostComment(
        database,
        request.participant,
        "marketplace_listing",
        request.params.listingId,
        request.body,
        clock.now(),
      );
      response.status(201).json({ comment });
    },
  );
  for (const [path, postType] of [["/found-item-reports/:postId/comments", "found_item_report"], ["/found-items/:postId/comments", "found_item"]]) {
    router.get(path, (request, response) => response.json({ comments: listPostComments(database, postType, request.params.postId, clock.now()) }));
    router.post(path, requireParticipant, requireCommentPolicy, (request, response) => {
      response.status(201).json({ comment: createPostComment(database, request.participant, postType, request.params.postId, request.body, clock.now()) });
    });
  }
  router.get("/buffets/:postId/comments", (request, response) => {
    response.json({ comments: listPostComments(database, "buffet_post", request.params.postId, clock.now()) });
  });
  router.post("/buffets/:postId/comments", requireParticipant, requireCommentPolicy, (request, response) => {
    response.status(201).json({ comment: createPostComment(database, request.participant, "buffet_post", request.params.postId, request.body, clock.now()) });
  });
  router.get("/lost-item-posts/:postId/comments", (request, response) => {
    response.json({ comments: listPostComments(database, "lost_item_post", request.params.postId, clock.now()) });
  });
  router.post(
    "/lost-item-posts/:postId/comments",
    requireParticipant,
    requireCommentPolicy,
    (request, response) => {
      const comment = createPostComment(
        database,
        request.participant,
        "lost_item_post",
        request.params.postId,
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
