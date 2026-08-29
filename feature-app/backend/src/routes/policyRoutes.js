import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import {
  acceptActivePolicies,
  getAcceptanceHistory,
  getActivePolicies,
  getPolicyStatus,
} from "../services/policyService.js";

export function policyRoutes({ database, clock }) {
  const router = Router();

  router.get("/policies/active", (request, response) => {
    response.json({ policies: getActivePolicies(database, request.participant?.participant_id) });
  });

  router.get("/me/policy-status", requireParticipant, (request, response) => {
    response.json(getPolicyStatus(database, request.participant.participant_id, request.query.action));
  });

  router.get("/me/policy-acceptances", requireParticipant, (request, response) => {
    response.json({ acceptances: getAcceptanceHistory(database, request.participant.participant_id) });
  });

  router.post("/me/policy-acceptances", requireParticipant, (request, response) => {
    const acceptances = acceptActivePolicies(
      database,
      request.participant.participant_id,
      request.body?.versionIds,
      clock.now(),
    );
    response.status(201).json({ acceptances });
  });

  return router;
}
