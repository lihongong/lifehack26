import { Router } from "express";
import { createLaunchAssertion } from "../services/authService.js";

export function integrationRoutes({ database, clock, univusAdapter }) {
  const router = Router();
  router.post("/univus/launch", (request, response) => {
    const identity = univusAdapter.resolveIdentity(request);
    const token = createLaunchAssertion(database, identity, clock.now());
    response.status(201).json({ launchUrl: `${request.protocol}://${request.get("host")}/api/auth/univus/callback?token=${encodeURIComponent(token)}` });
  });
  return router;
}
