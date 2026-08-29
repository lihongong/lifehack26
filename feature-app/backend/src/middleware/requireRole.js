export function requireRole(role) {
  return (request, response, next) => {
    if (request.participant?.role !== role) return response.status(403).json({ error: "Insufficient privileges" });
    next();
  };
}
