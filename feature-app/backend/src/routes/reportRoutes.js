import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { createContentReport } from "../services/reportService.js";

export function reportRoutes({ database, clock }) {
  const router = Router();
  router.post("/content-reports", requireParticipant, (request, response) => {
    const report = createContentReport(database, request.participant, request.body, clock.now());
    response.status(201).json({ report });
  });
  return router;
}
