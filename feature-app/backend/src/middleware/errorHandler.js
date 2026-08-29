export function errorHandler(error, _request, response, _next) {
  if (!error.status || error.status >= 500) console.error(error);
  const body = { error: error.status ? error.message : "Internal server error" };
  if (error.status && error.code) body.code = error.code;
  if (error.status && error.detectedContactTypes) body.detectedContactTypes = error.detectedContactTypes;
  response.status(error.status || 500).json(body);
}
