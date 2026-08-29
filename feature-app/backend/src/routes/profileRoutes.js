import { Router } from "express";
import { getGemAccount } from "../services/gemService.js";
import { privateProfile, publicProfile, updateParticipantProfile } from "../services/participantService.js";
import { requireParticipant } from "../middleware/requireParticipant.js";

export function profileRoutes({ database, clock }) {
  const router = Router();
  router.put("/me/profile", requireParticipant, (request, response) => {
    const participant = updateParticipantProfile(database, request.participant.participant_id, request.body, clock.now());
    response.json({ participant: privateProfile(participant, getGemAccount(database, participant.id)) });
  });
  router.get("/me/gems", requireParticipant, (request, response) => response.json(getGemAccount(database, request.participant.participant_id)));
  router.get("/participants/:publicId", (request, response) => {
    const participant = publicProfile(database, request.params.publicId);
    if (!participant) return response.status(404).json({ error: "Participant not found" });
    response.json({ participant });
  });
  return router;
}
