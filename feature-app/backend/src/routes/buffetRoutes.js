import { Router } from "express";
import { buffetFeed, recordBuffetGoing } from "../services/buffetService.js";
import { buffetPostStates, listPersistedBuffetPosts } from "../services/buffetAlertService.js";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { GEM_REASONS } from "../services/gemService.js";

export function buffetRoutes({ database, clock }) {
  const router = Router();
  router.get("/", (request, response) => {
    const participantId = request.participant?.participant_id;
    const collectedIds = participantId ? new Set(database.prepare(`
      SELECT source_id FROM gem_ledger WHERE participant_id = ? AND reason = ?
    `).all(participantId, GEM_REASONS.buffetGoing).map(({ source_id }) => source_id)) : new Set();
    response.json(buffetFeed(listPersistedBuffetPosts(database), request.query, clock.now(), buffetPostStates(database), collectedIds));
  });
  router.post("/:postId/going", requireParticipant, (request, response) => response.json(
    recordBuffetGoing(database, request.participant.participant_id, request.params.postId, clock.now()),
  ));
  return router;
}
