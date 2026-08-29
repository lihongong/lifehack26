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
export const getCustodySettings = () => request("/api/operator/custody-settings");
export const updateCustodySettings = (settings) => request("/api/operator/custody-settings", { method: "PATCH", body: JSON.stringify(settings) });
export const getCustodyLocations = () => request("/api/operator/custody-locations");
export const createCustodyLocation = (location) => request("/api/operator/custody-locations", { method: "POST", body: JSON.stringify(location) });
export const updateCustodyLocation = (id, location) => request(`/api/operator/custody-locations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(location) });
export const getModerationListings = () => request("/api/moderation/marketplace");
export const moderateListing = (listingId, hidden, reason) => request(`/api/moderation/marketplace/${encodeURIComponent(listingId)}`, { method: "PATCH", body: JSON.stringify({ hidden, reason }) });
export const getModerationLostItemPosts = (status = "pending_review") => request(`/api/moderation/lost-item-posts?status=${encodeURIComponent(status)}`);
export const reviewLostItemPost = (postId, review) => request(`/api/moderation/lost-item-posts/${encodeURIComponent(postId)}/review`, { method: "POST", body: JSON.stringify(review) });
export const getModerationFoundItemReports = (status) => request(`/api/moderation/found-item-reports?status=${encodeURIComponent(status)}`);
export const reviewFoundItemReport = (id, review) => request(`/api/moderation/found-item-reports/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify(review) });
export const closeFoundItemReport = (id, closure) => request(`/api/moderation/found-item-reports/${encodeURIComponent(id)}/close`, { method: "POST", body: JSON.stringify(closure) });
export const arrangeFoundItemHandover = (id, appointment) => request(`/api/moderation/found-item-reports/${encodeURIComponent(id)}/appointments`, { method: "POST", body: JSON.stringify(appointment) });
export const intakeFoundItem = (id, intake) => request(`/api/moderation/found-item-reports/${encodeURIComponent(id)}/intake`, { method: "POST", body: JSON.stringify(intake) });
export const getModerationCustodyLocations = () => request("/api/moderation/custody-locations");
export const getContentReports = () => request("/api/moderation/reports");
export const resolveContentReport = (reportId, outcome, reason) => request(`/api/moderation/reports/${encodeURIComponent(reportId)}`, {
  method: "PATCH",
  body: JSON.stringify({ outcome, reason }),
});
export const getModerationComments = () => request("/api/moderation/comments");
export const moderateComment = (commentId, reason) => request(`/api/moderation/comments/${encodeURIComponent(commentId)}`, {
  method: "PATCH",
  body: JSON.stringify({ hidden: true, reason }),
});
export const getSourceDiscrepancies = (status = "open") => request(`/api/moderation/source-discrepancies?status=${encodeURIComponent(status)}`);
export const resolveSourceDiscrepancy = (id, decision, reason, correctedListing) => request(`/api/moderation/source-discrepancies/${encodeURIComponent(id)}/resolution`, {
  method: "POST",
  body: JSON.stringify({ decision, reason, ...(correctedListing ? { correctedListing } : {}) }),
});
export const getSourceAuthorConsents = (feedId) => request(`/api/moderation/source-feeds/${encodeURIComponent(feedId)}/author-consents`);
export const recordSourceAuthorConsent = (feedId, consent) => request(`/api/moderation/source-feeds/${encodeURIComponent(feedId)}/author-consents`, { method: "POST", body: JSON.stringify(consent) });
export const withdrawSourceAuthorConsent = (feedId, consentId, reason) => request(`/api/moderation/source-feeds/${encodeURIComponent(feedId)}/author-consents/${encodeURIComponent(consentId)}`, { method: "DELETE", body: JSON.stringify({ reason }) });
