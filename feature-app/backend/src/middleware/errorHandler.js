export function errorHandler(error, _request, response, _next) {
  if (!error.status || error.status >= 500) console.error(error);
  response.status(error.status || 500).json({ error: error.status ? error.message : "Internal server error" });
}
