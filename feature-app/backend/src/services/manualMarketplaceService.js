import { randomUUID } from "node:crypto";
import { withImmediateTransaction } from "../db/database.js";
import { recordAudit, validateReason } from "./privilegeService.js";
import { marketplaceCategories } from "../sourceFeeds/marketplaceMessageParser.js";

const categories = new Set(marketplaceCategories);

function validationError(message) {
  return Object.assign(new Error(message), { status: 422 });
}

function requiredText(value, field, minimum, maximum) {
  const text = String(value || "").trim();
  if (text.length < minimum || text.length > maximum) {
    throw validationError(`${field} must be ${minimum}-${maximum} characters.`);
  }
  return text;
}

function imageMetadata(input) {
  const imageUrl = String(input?.imageUrl || "").trim();
  const imageAlt = String(input?.imageAlt || "").trim();
  if (!imageUrl && !imageAlt) return { imageUrl: null, imageAlt: null };
  if (!imageUrl || imageAlt.length < 3 || imageAlt.length > 300) {
    throw validationError("Image URL and 3-300 character alternative text must be provided together.");
  }
  let parsed;
  try { parsed = new URL(imageUrl); } catch { throw validationError("Image URL must be a valid HTTPS URL."); }
  if (parsed.protocol !== "https:" || parsed.toString().length > 1000) throw validationError("Image URL must be a valid HTTPS URL.");
  return { imageUrl: parsed.toString(), imageAlt };
}

export function persistedManualListings(database, now = new Date(), { includeExpired = false } = {}) {
  return database.prepare(`
    SELECT id, title, category, price, description, image_url AS imageUrl, image_alt AS imageAlt,
      created_by_participant_id AS createdByParticipantId,
      created_at AS createdAt, expires_at AS expiresAt
    FROM manual_marketplace_listings
    WHERE deleted_at IS NULL
  `).all().map((row) => ({
    ...row,
    source: "NUS Community Exchange",
    sourceTime: row.createdAt,
    updatedAt: row.createdAt,
    expiryBasis: "default_30_days",
    fictional: false,
    attributionState: "name_only",
    authorDisplayName: "Community Exchange Moderator",
    origin: "manual",
    expired: row.expiresAt <= now.toISOString(),
  })).filter((listing) => includeExpired || !listing.expired);
}

export function createManualMarketplaceListing(database, actor, input, now) {
  const title = requiredText(input?.title, "Title", 3, 160);
  const category = String(input?.category || "");
  if (!categories.has(category)) throw validationError("Category is invalid.");
  const price = Number(input?.price);
  if (!Number.isInteger(price) || price < 0 || price > 100000) throw validationError("Price must be a whole SGD amount from 0-100000.");
  const description = requiredText(input?.description, "Description", 10, 2000);
  const { imageUrl, imageAlt } = imageMetadata(input);
  const reason = validateReason(input?.reason);
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  withImmediateTransaction(database, () => {
    database.prepare(`
      INSERT INTO manual_marketplace_listings (
        id, title, category, price, description, image_url, image_alt,
        created_by_participant_id, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, category, price, description, imageUrl, imageAlt, actor.participant_id, now.toISOString(), expiresAt.toISOString());
    recordAudit(database, {
      eventType: "marketplace_listing_created",
      actorId: actor.participant_id,
      targetType: "marketplace_listing",
      targetId: id,
      reason,
      selfDirected: true,
    }, now);
  });
  return persistedManualListings(database, now, { includeExpired: true }).find((listing) => listing.id === id);
}

export function deleteManualMarketplaceListing(database, actor, listingId, reasonInput, now) {
  const reason = validateReason(reasonInput);
  const listing = database.prepare("SELECT id FROM manual_marketplace_listings WHERE id = ? AND deleted_at IS NULL").get(listingId);
  if (!listing) throw Object.assign(new Error("Manual Marketplace Listing not found."), { status: 404 });

  withImmediateTransaction(database, () => {
    database.prepare(`
      UPDATE manual_marketplace_listings
      SET deleted_by_participant_id = ?, deleted_at = ?, deletion_reason = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(actor.participant_id, now.toISOString(), reason, listingId);
    recordAudit(database, {
      eventType: "marketplace_listing_deleted",
      actorId: actor.participant_id,
      targetType: "marketplace_listing",
      targetId: listingId,
      reason,
      selfDirected: actor.participant_id === database.prepare("SELECT created_by_participant_id FROM manual_marketplace_listings WHERE id = ?").get(listingId).created_by_participant_id,
    }, now);
  });
}
