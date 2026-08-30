import { Router } from "express";
import { buffetFeed, recordBuffetGoing } from "../services/buffetService.js";
import { allBuffetPostStates, listPersistedBuffetPosts } from "../services/buffetAlertService.js";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { GEM_REASONS } from "../services/gemService.js";
import { listManualBuffetPosts } from "../services/manualBuffetService.js";

export function buffetRoutes({ database, clock }) {
  const router = Router();
  router.get("/", (request, response) => {
    const participantId = request.participant?.participant_id;
    const collectedIds = participantId ? new Set(database.prepare(`
      SELECT source_id FROM gem_ledger WHERE participant_id = ? AND reason = ?
    `).all(participantId, GEM_REASONS.buffetGoing).map(({ source_id }) => source_id)) : new Set();
    response.json(buffetFeed(
      [...listPersistedBuffetPosts(database), ...listManualBuffetPosts(database, clock.now())],
      request.query,
      clock.now(),
      allBuffetPostStates(database),
      collectedIds,
    ));
  });
  router.post("/:referenceId/going", requireParticipant, (request, response) => response.json(
    recordBuffetGoing(database, request.participant.participant_id, request.params.referenceId, clock.now()),
  ));
  return router;
}
