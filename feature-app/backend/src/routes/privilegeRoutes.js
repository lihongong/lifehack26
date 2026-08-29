import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requireRole } from "../middleware/requireRole.js";
import { enrollModerator, getAuditLog, listModerators, removeModerator } from "../services/privilegeService.js";
import { listSourceFeeds, updateSourceFeedGates } from "../services/sourceFeedService.js";

export function privilegeRoutes({ database, clock }) {
  const router = Router();
  router.use(requireParticipant, requireRole("platform_operator"));
  router.get("/moderators", (_request, response) => response.json({ moderators: listModerators(database) }));
  router.post("/moderators", (request, response) => {
    const moderator = enrollModerator(database, request.participant.participant_id, request.body?.email, request.body?.reason, clock.now());
    response.status(201).json({ moderator });
  });
  router.delete("/moderators/:participantId", (request, response) => {
    removeModerator(database, request.participant.participant_id, request.params.participantId, request.body?.reason, clock.now());
    response.status(204).end();
  });
  router.get("/audit", (_request, response) => response.json({ entries: getAuditLog(database) }));
  router.get("/source-feeds", (_request, response) => response.json({ feeds: listSourceFeeds(database) }));
  router.patch("/source-feeds/:feedId/gates", (request, response) => {
    const feed = updateSourceFeedGates(
      database,
      request.participant.participant_id,
      request.params.feedId,
      request.body || {},
      request.body?.reason,
      clock.now(),
    );
    response.json({ feed });
  });
  return router;
}
