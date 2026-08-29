export async function getBuffetFeed(filters) {
  const response = await fetch(`/api/buffets?${new URLSearchParams(filters)}`);
  if (!response.ok) throw new Error("Buffet Posts could not be loaded.");
  return response.json();
}

async function alertRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "Buffet Alerts could not be updated."), { status: response.status, body });
  return body;
}

export const getBuffetAlerts = () => alertRequest("/api/buffet-alerts");
export const updateBuffetAlertPreference = (preference) => alertRequest("/api/buffet-alerts/preference", {
  method: "PUT", body: JSON.stringify(preference),
});
export const synchronizeBuffetAlerts = () => alertRequest("/api/buffet-alerts/sync", { method: "POST" });
export const recordBuffetAlertFeedback = (alertId, outcome) => alertRequest(`/api/buffet-alerts/${encodeURIComponent(alertId)}/feedback`, {
  method: "POST", body: JSON.stringify({ outcome }),
});
