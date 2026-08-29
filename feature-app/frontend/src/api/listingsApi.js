export async function getListings(filters) {
  const params = new URLSearchParams(filters);
  const response = await fetch(`/api/listings?${params}`);
  if (!response.ok) throw new Error("Listings could not be loaded.");
  return response.json();
}

async function rewardRequest(url) {
  const response = await fetch(url, { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "Gem reward could not be collected."), { status: response.status });
  return body;
}

export const collectMarketplaceContactReward = (listingId) => rewardRequest(`/api/listings/${encodeURIComponent(listingId)}/contact-reward`);
export const simulateMarketplaceSoldReply = (listingId) => rewardRequest(`/api/listings/${encodeURIComponent(listingId)}/demo-sold`);
