async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...options.headers } });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || "Request failed"), { status: response.status });
  return body;
}

export const getModerators = () => request("/api/operator/moderators");
export const enrollModerator = (email, reason) => request("/api/operator/moderators", { method: "POST", body: JSON.stringify({ email, reason }) });
export const removeModerator = (participantId, reason) => request(`/api/operator/moderators/${encodeURIComponent(participantId)}`, { method: "DELETE", body: JSON.stringify({ reason }) });
export const getAuditLog = () => request("/api/operator/audit");
export const getModerationListings = () => request("/api/moderation/marketplace");
export const moderateListing = (listingId, hidden, reason) => request(`/api/moderation/marketplace/${encodeURIComponent(listingId)}`, { method: "PATCH", body: JSON.stringify({ hidden, reason }) });
