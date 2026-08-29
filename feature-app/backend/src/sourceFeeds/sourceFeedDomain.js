import { createHash, createHmac } from "node:crypto";

const categories = new Set(["Study", "Room & Living", "Transport", "Electronics"]);

function invalid(message) {
  throw Object.assign(new Error(message), { status: 422 });
}

function requiredString(value, field, maximum = 500) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maximum) invalid(`${field} is required and must not exceed ${maximum} characters.`);
  return result;
}

function optionalHttpsUrl(value, field) {
  if (value == null || value === "") return null;
  const result = requiredString(value, field, 1000);
  let parsed;
  try { parsed = new URL(result); } catch { invalid(`${field} must be a valid URL.`); }
  if (parsed.protocol !== "https:") invalid(`${field} must use HTTPS.`);
  return parsed.toString();
}

function imageLocation(value) {
  const result = requiredString(value, "Image URL", 1000);
  if (result.startsWith("/images/")) return result;
  return optionalHttpsUrl(result, "Image URL");
}

function telegramDate(value, field) {
  if (!Number.isInteger(value) || value < 0) invalid(`${field} must be a Telegram-style Unix timestamp.`);
  return new Date(value * 1000);
}

function normalizeListing(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Marketplace Listing content is required.");
  const id = requiredString(input.id, "Marketplace Listing id", 80);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) invalid("Marketplace Listing id must use lowercase letters, numbers, and hyphens.");
  const category = requiredString(input.category, "Category", 80);
  if (!categories.has(category)) invalid("Category is not supported.");
  if (!Number.isInteger(input.price) || input.price < 0) invalid("Price must be a non-negative integer.");
  return {
    id,
    title: requiredString(input.title, "Title", 160),
    category,
    price: input.price,
    description: requiredString(input.description, "Description", 2000),
    sourceName: requiredString(input.source_name, "Source name", 120),
    sourceUrl: optionalHttpsUrl(input.source_url, "Source URL"),
    imageUrl: imageLocation(input.image_url),
    imageAlt: requiredString(input.image_alt, "Image alternative text", 300),
    fictional: input.fictional === true,
  };
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function stableId(prefix, ...parts) {
  return `${prefix}_${digest(parts.join(":" )).slice(0, 24)}`;
}

export function hashSourceAuthor(feedId, externalAuthorId, secret) {
  if (!secret) throw Object.assign(new Error("Source identity hashing is not configured."), { status: 503 });
  const author = requiredString(externalAuthorId, "Source author id", 200);
  return createHmac("sha256", secret).update(`${feedId}:${author}`).digest("hex");
}

export function normalizeTelegramUpdate(rawUpdate) {
  if (!rawUpdate || typeof rawUpdate !== "object" || Array.isArray(rawUpdate)) invalid("Telegram update must be an object.");
  if (!Number.isInteger(rawUpdate.update_id) || rawUpdate.update_id < 0) invalid("Telegram update_id must be a non-negative integer.");

  const present = ["message", "edited_message", "deleted_message"].filter((key) => rawUpdate[key] != null);
  if (present.length !== 1) invalid("Telegram update must contain exactly one supported message event.");
  const sourceType = present[0];
  const message = rawUpdate[sourceType];
  if (!message || typeof message !== "object" || Array.isArray(message)) invalid("Telegram message event must be an object.");
  if (!Number.isInteger(message.message_id) || message.message_id < 0) invalid("Telegram message_id must be a non-negative integer.");

  const eventType = sourceType === "message" ? "create" : sourceType === "edited_message" ? "edit" : "delete";
  const sourceEventAt = telegramDate(eventType === "edit" ? message.edit_date : message.date, eventType === "edit" ? "edit_date" : "date");
  const externalAuthorId = message.from?.id;
  if (externalAuthorId == null) invalid("Telegram message author id is required.");
  const listing = eventType === "delete" ? null : normalizeListing(message.marketplace_listing);
  const event = {
    updateId: rawUpdate.update_id,
    eventType,
    sourcePostKey: String(message.message_id),
    externalAuthorId: String(externalAuthorId),
    sourceEventAt,
    listing,
  };
  return { ...event, payloadDigest: digest({ ...event, sourceEventAt: sourceEventAt.toISOString() }) };
}

export function sourceEventForStorage(event, authorKeyHash) {
  return {
    eventType: event.eventType,
    sourcePostKey: event.sourcePostKey,
    authorKeyHash,
    revisionAt: event.sourceEventAt.toISOString(),
    listing: event.listing,
  };
}
