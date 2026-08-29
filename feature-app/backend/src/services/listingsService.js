const categories = new Set(["All", "Study", "Room & Living", "Transport", "Electronics"]);

export function persistedListings(database) {
  return database.prepare(`
    SELECT l.id, l.title, l.category, l.price, l.description, l.source_name AS source,
      l.source_url AS sourceUrl, l.source_updated_at AS updatedAt, l.image_url AS imageUrl,
      l.image_alt AS imageAlt, l.fictional, p.author_key_hash AS authorKeyHash,
      c.display_name_allowed AS displayNameAllowed, c.contact_allowed AS contactAllowed,
      c.display_name AS authorDisplayName, c.contact_url AS contactUrl, c.active AS consentActive
    FROM marketplace_listings l
    JOIN source_posts p ON p.id = l.source_post_id
    LEFT JOIN source_author_consents c ON c.feed_id = p.feed_id AND c.author_key_hash = p.author_key_hash
    WHERE p.deleted = 0
  `).all().map((row) => {
    const consentActive = Boolean(row.consentActive);
    const listing = {
      id: row.id,
      title: row.title,
      category: row.category,
      price: row.price,
      description: row.description,
      source: row.source,
      sourceUrl: row.sourceUrl,
      updatedAt: row.updatedAt,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      fictional: Boolean(row.fictional),
      authorKeyHash: row.authorKeyHash,
    };
    if (consentActive && row.displayNameAllowed) listing.authorDisplayName = row.authorDisplayName;
    if (consentActive && row.contactAllowed) listing.contactUrl = row.contactUrl;
    return listing;
  });
}

export function filterListings(listings, { query = "", category = "All", sort = "fresh" } = {}, hiddenIds = new Set()) {
  const safeCategory = categories.has(category) ? category : "All";
  const safeSort = ["fresh", "price"].includes(sort) ? sort : "fresh";
  const needle = String(query).trim().toLowerCase();
  return listings
    .filter(
      (item) =>
        !hiddenIds.has(item.id) &&
        (!needle || `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(needle)) &&
        (safeCategory === "All" || item.category === safeCategory),
    )
    .sort((a, b) =>
      safeSort === "price"
        ? a.price - b.price || a.id.localeCompare(b.id)
        : new Date(b.updatedAt) - new Date(a.updatedAt) || a.id.localeCompare(b.id),
    )
}

export function findListings(database, filters = {}, hiddenIds = new Set(), { includeInternal = false } = {}) {
  return filterListings(persistedListings(database), filters, hiddenIds).map((listing) => {
    if (includeInternal) return listing;
    const { authorKeyHash: _authorKeyHash, sourceUrl: _sourceUrl, ...visible } = listing;
    return visible;
  });
}
