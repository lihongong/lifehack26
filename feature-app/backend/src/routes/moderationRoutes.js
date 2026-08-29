import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requireRole } from "../middleware/requireRole.js";
import { moderateListing, moderatorListings } from "../services/moderationService.js";

export function moderationRoutes({ database, clock }) {
  const router = Router();
  router.use(requireParticipant, requireRole("moderator"));
  router.get("/marketplace", (_request, response) => response.json({ listings: moderatorListings(database) }));
  router.patch("/marketplace/:listingId", (request, response) => {
    const listing = moderateListing(database, request.participant, request.params.listingId, request.body?.hidden, request.body?.reason, clock.now());
    response.json({ listing });
  });
  return router;
}
