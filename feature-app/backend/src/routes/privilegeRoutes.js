import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requireRole } from "../middleware/requireRole.js";
import { enrollModerator, getAuditLog, listModerators, removeModerator } from "../services/privilegeService.js";
import { listSourceFeeds, updateSourceFeedGates } from "../services/sourceFeedService.js";
import {
  createCustodyLocation,
  getCustodySettings,
  listCustodyLocations,
  updateCustodyLocation,
  updateCustodySettings,
} from "../services/foundItemService.js";

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
  router.get("/custody-settings", (_request, response) => response.json({ settings: getCustodySettings(database) }));
  router.patch("/custody-settings", (request, response) => response.json({ settings: updateCustodySettings(database, request.participant.participant_id, request.body || {}, clock.now()) }));
  router.get("/custody-locations", (_request, response) => response.json({ locations: listCustodyLocations(database) }));
  router.post("/custody-locations", (request, response) => response.status(201).json({ location: createCustodyLocation(database, request.participant.participant_id, request.body || {}, clock.now()) }));
  router.patch("/custody-locations/:locationId", (request, response) => response.json({ location: updateCustodyLocation(database, request.participant.participant_id, request.params.locationId, request.body || {}, clock.now()) }));
  return router;
}
