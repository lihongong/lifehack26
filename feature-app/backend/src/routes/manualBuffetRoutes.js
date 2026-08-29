import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  createManualBuffetPost,
  deleteManualBuffetPost,
  getManualBuffetManagement,
} from "../services/manualBuffetService.js";

export function manualBuffetRoutes({ database, clock }) {
  const router = Router();
  router.use(requireParticipant, requireRole("moderator"));
  router.get("/buffets", (_request, response) => response.json(getManualBuffetManagement(database, clock.now())));
  router.post("/buffets", (request, response) => {
    const post = createManualBuffetPost(database, request.participant, request.body, clock.now());
    response.status(201).json({ post });
  });
  router.delete("/buffets/:postId", (request, response) => {
    deleteManualBuffetPost(database, request.participant, request.params.postId, request.body?.reason, clock.now());
    response.status(204).end();
  });
  return router;
}
