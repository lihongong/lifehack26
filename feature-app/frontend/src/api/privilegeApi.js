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
export const getSourceFeeds = () => request("/api/operator/source-feeds");
export const updateSourceFeedGates = (feedId, changes) => request(`/api/operator/source-feeds/${encodeURIComponent(feedId)}/gates`, { method: "PATCH", body: JSON.stringify(changes) });
export const getModerationListings = () => request("/api/moderation/marketplace");
export const moderateListing = (listingId, hidden, reason) => request(`/api/moderation/marketplace/${encodeURIComponent(listingId)}`, { method: "PATCH", body: JSON.stringify({ hidden, reason }) });
export const getSourceDiscrepancies = (status = "open") => request(`/api/moderation/source-discrepancies?status=${encodeURIComponent(status)}`);
export const resolveSourceDiscrepancy = (id, decision, reason, correctedListing) => request(`/api/moderation/source-discrepancies/${encodeURIComponent(id)}/resolution`, {
  method: "POST",
  body: JSON.stringify({ decision, reason, ...(correctedListing ? { correctedListing } : {}) }),
});
export const getSourceAuthorConsents = (feedId) => request(`/api/moderation/source-feeds/${encodeURIComponent(feedId)}/author-consents`);
export const recordSourceAuthorConsent = (feedId, consent) => request(`/api/moderation/source-feeds/${encodeURIComponent(feedId)}/author-consents`, { method: "POST", body: JSON.stringify(consent) });
export const withdrawSourceAuthorConsent = (feedId, consentId, reason) => request(`/api/moderation/source-feeds/${encodeURIComponent(feedId)}/author-consents/${encodeURIComponent(consentId)}`, { method: "DELETE", body: JSON.stringify({ reason }) });
