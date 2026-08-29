import { readCookie, resolveSession } from "../services/authService.js";

export function participantMiddleware({ database, clock }) {
  return (request, _response, next) => {
    request.sessionToken = readCookie(request);
    request.participant = resolveSession(database, request.sessionToken, clock.now());
    next();
  };
}

export function requireParticipant(request, response, next) {
  if (!request.participant) return response.status(401).json({ error: "Authentication required" });
  next();
}
