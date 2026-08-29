import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requirePolicyAcceptance } from "../middleware/requirePolicyAcceptance.js";
import {
  deliverEligibleAlerts,
  getAlertSettings,
  listParticipantAlerts,
  recordAlertFeedback,
  updateAlertPreference,
} from "../services/buffetAlertService.js";

export function buffetAlertRoutes({ database, clock }) {
  const router = Router();
  router.use(requireParticipant);
  router.get("/", (request, response) => response.json({
    settings: getAlertSettings(database, request.participant.participant_id),
    alerts: listParticipantAlerts(database, request.participant.participant_id),
  }));
  router.put("/preference", (request, response) => {
    const settings = updateAlertPreference(database, request.participant.participant_id, request.body || {}, clock.now());
    response.json({ settings, alerts: listParticipantAlerts(database, request.participant.participant_id) });
  });
  router.post("/sync", requirePolicyAcceptance({ database, action: "alerts" }), (request, response) => {
    const result = deliverEligibleAlerts(database, clock.now(), undefined, request.participant.participant_id);
    response.json({ ...result, alerts: listParticipantAlerts(database, request.participant.participant_id) });
  });
  router.post("/:alertId/feedback", requirePolicyAcceptance({ database, action: "alerts" }), (request, response) => {
    const outcome = recordAlertFeedback(database, request.participant.participant_id, request.params.alertId, request.body?.outcome, clock.now());
    response.json({ outcome });
  });
  return router;
}
