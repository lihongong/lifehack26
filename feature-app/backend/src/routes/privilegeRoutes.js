import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requireRole } from "../middleware/requireRole.js";
import { enrollModerator, getAuditLog, listModerators, removeModerator } from "../services/privilegeService.js";

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
  return router;
}
