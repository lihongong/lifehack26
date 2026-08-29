export async function getListings(filters) {
  const params = new URLSearchParams(filters);
  const response = await fetch(`/api/listings?${params}`);
  if (!response.ok) throw new Error("Listings could not be loaded.");
  return response.json();
}
