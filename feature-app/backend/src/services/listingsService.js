import { demoListings } from "../data/demoListings.js";
const categories = new Set(["All", "Study", "Room & Living", "Transport", "Electronics"]);
export function findListings({ query = "", category = "All", sort = "fresh" } = {}) {
  const safeCategory = categories.has(category) ? category : "All";
  const safeSort = ["fresh", "price"].includes(sort) ? sort : "fresh";
  const needle = String(query).trim().toLowerCase();
  return demoListings
    .filter(
      (item) =>
        (!needle || `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(needle)) &&
        (safeCategory === "All" || item.category === safeCategory),
    )
    .sort((a, b) =>
      safeSort === "price"
        ? a.price - b.price || a.id.localeCompare(b.id)
        : new Date(b.updatedAt) - new Date(a.updatedAt) || a.id.localeCompare(b.id),
    );
}
