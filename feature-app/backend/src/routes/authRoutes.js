import { Router } from "express";
import { clearSessionCookie, completeLaunch, revokeSession, sessionPayload, setSessionCookie } from "../services/authService.js";

export function authRoutes({ database, clock, environment, platformOperatorSubject }) {
  const router = Router();
  router.get("/univus/callback", (request, response) => {
    const { participant, session } = completeLaunch(database, request.query.token, clock.now(), platformOperatorSubject);
    setSessionCookie(response, session, environment === "production");
    response.redirect(participant.display_name ? "/" : "/profile/setup");
  });
  router.get("/session", (request, response) => {
    if (!request.participant) return response.status(401).json({ error: "Authentication required" });
    response.json({ participant: sessionPayload(database, request.participant) });
  });
  router.post("/logout", (request, response) => {
    revokeSession(database, request.sessionToken, clock.now());
    clearSessionCookie(response, environment === "production");
    response.status(204).end();
  });
  return router;
}
