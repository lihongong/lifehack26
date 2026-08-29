export async function getBuffetFeed(filters) {
  const response = await fetch(`/api/buffets?${new URLSearchParams(filters)}`);
  if (!response.ok) throw new Error("Buffet Posts could not be loaded.");
  return response.json();
}
