import { persistedManualListings } from "./manualMarketplaceService.js";
import { hashSourceAuthor } from "../sourceFeeds/sourceFeedDomain.js";

const categories = new Set(["All", "Study", "Room & Living", "Transport", "Electronics"]);

export function persistedListings(database, now = new Date(), { includeExpired = false } = {}) {
  return database.prepare(`
    SELECT l.id, l.title, l.category, l.price, l.description, l.source_name AS source,
      l.source_url AS sourceUrl, l.source_updated_at AS updatedAt, l.image_url AS imageUrl,
      l.image_alt AS imageAlt, l.fictional, p.feed_id AS feedId, p.author_key_hash AS authorKeyHash,
      c.display_name_allowed AS displayNameAllowed, c.contact_allowed AS contactAllowed,
      c.display_name AS authorDisplayName, c.contact_url AS contactUrl, c.active AS consentActive,
      life.expires_at AS expiresAt, life.expiry_basis AS expiryBasis
    FROM marketplace_listings l
    JOIN source_posts p ON p.id = l.source_post_id
    JOIN marketplace_listing_lifecycle life ON life.listing_id = l.id
    LEFT JOIN source_author_consents c ON c.feed_id = p.feed_id AND c.author_key_hash = p.author_key_hash
    LEFT JOIN marketplace_sales sale ON sale.listing_id = l.id
    WHERE p.deleted = 0 AND sale.listing_id IS NULL
  `).all().map((row) => {
    const consentActive = Boolean(row.consentActive);
    const displayNameAllowed = consentActive && Boolean(row.displayNameAllowed);
    const contactAllowed = consentActive && Boolean(row.contactAllowed);
    const listing = {
      id: row.id,
      title: row.title,
      category: row.category,
      price: row.price,
      description: row.description,
      source: row.source,
      sourceUrl: row.sourceUrl,
      sourceTime: row.updatedAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt,
      expiryBasis: row.expiryBasis,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      fictional: Boolean(row.fictional),
      origin: "source_feed",
      feedId: row.feedId,
      authorKeyHash: row.authorKeyHash,
      attributionState: displayNameAllowed && contactAllowed
        ? "name_and_contact"
        : displayNameAllowed ? "name_only" : contactAllowed ? "contact_only" : "withheld",
      expired: row.expiresAt <= now.toISOString(),
    };
    if (displayNameAllowed) listing.authorDisplayName = row.authorDisplayName;
    if (contactAllowed) listing.contactUrl = row.contactUrl;
    return listing;
  }).filter((listing) => includeExpired || !listing.expired);
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

export function findListings(database, filters = {}, hiddenIds = new Set(), { includeInternal = false, includeExpired = false, now = new Date(), viewer = null, identitySecret = "", demoSoldEnabled = false } = {}) {
  const listings = [...persistedListings(database, now, { includeExpired }), ...persistedManualListings(database, now, { includeExpired })];
  return filterListings(listings, filters, hiddenIds).map((listing) => {
    const ownedByMe = Boolean(viewer && (
      listing.origin === "manual"
        ? listing.createdByParticipantId === viewer.participant_id
        : identitySecret && listing.authorKeyHash === hashSourceAuthor(listing.feedId, viewer.external_subject, identitySecret)
    ));
    if (includeInternal) return listing;
    const {
      authorKeyHash: _authorKeyHash,
      sourceUrl: _sourceUrl,
      expiryBasis: _expiryBasis,
      expired: _expired,
      createdByParticipantId: _createdByParticipantId,
      feedId: _feedId,
      ...visible
    } = listing;
    return { ...visible, ownedByMe, demoSoldActionAvailable: demoSoldEnabled && listing.origin === "source_feed" && ownedByMe };
  });
}
