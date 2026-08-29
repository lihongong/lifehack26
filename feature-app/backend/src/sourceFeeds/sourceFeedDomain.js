import { createHash, createHmac } from "node:crypto";
import { parseMarketplaceMessage, validateCorrectedMarketplaceFields } from "./marketplaceMessageParser.js";

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

function listingFromCandidate(candidate, defaults) {
  return {
    id: defaults.id,
    ...candidate,
    sourceName: defaults.sourceName,
    sourceUrl: defaults.sourceUrl,
    imageUrl: defaults.imageUrl || null,
    imageAlt: defaults.imageAlt || null,
    fictional: Boolean(defaults.fictional),
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

export function normalizeCorrectedMarketplaceListing(input, defaults) {
  return listingFromCandidate(validateCorrectedMarketplaceFields(input), defaults);
}

export function normalizeTelegramUpdate(rawUpdate, { feedId = "telegram-marketplace-demo", fictional = false, media = null } = {}) {
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
  const externalAuthorId = message.from?.id ?? message.sender_chat?.id;
  if (externalAuthorId == null) invalid("Telegram message author id is required.");
  const chatUsername = requiredString(message.chat?.username, "Telegram chat username", 200);
  const defaults = {
    id: stableId("listing", feedId, message.message_id),
    sourceName: "NUS Marketplace",
    sourceUrl: optionalHttpsUrl(`https://t.me/${chatUsername}/${message.message_id}`, "Source URL"),
    imageUrl: media?.imageUrl ? imageLocation(media.imageUrl) : null,
    imageAlt: media?.imageAlt ? requiredString(media.imageAlt, "Image alternative text", 300) : null,
    fictional,
  };
  const parsed = eventType === "delete" ? { issues: [], candidate: null } : parseMarketplaceMessage(message.text ?? message.caption);
  const listing = parsed.issues.length ? null : listingFromCandidate(parsed.candidate, defaults);
  const event = {
    updateId: rawUpdate.update_id,
    eventType,
    sourcePostKey: String(message.message_id),
    externalAuthorId: String(externalAuthorId),
    sourceEventAt,
    listing,
    parseIssues: parsed.issues,
    parseCandidate: parsed.candidate,
    listingDefaults: defaults,
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
    parseIssues: event.parseIssues,
    parseCandidate: event.parseCandidate,
    listingDefaults: event.listingDefaults,
  };
}
