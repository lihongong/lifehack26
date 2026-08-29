import { validateReason, recordAudit } from "./privilegeService.js";
import { digest, hashSourceAuthor, sourceEventForStorage, stableId } from "../sourceFeeds/sourceFeedDomain.js";

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function requiredText(value, label, maximum = 500) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maximum) fail(`${label} is required and must not exceed ${maximum} characters.`, 422);
  return result;
}

function booleanInput(value, label) {
  if (value !== true && value !== false) fail(`${label} must be true or false.`, 422);
  return value;
}

function parseJson(value) {
  return value ? JSON.parse(value) : null;
}

function feedRow(database, feedId) {
  const feed = database.prepare("SELECT * FROM source_feeds WHERE id = ?").get(feedId);
  if (!feed) fail("Source Feed not found.", 404);
  return feed;
}

function publicFeed(feed) {
  return {
    id: feed.id,
    name: feed.name,
    provider: feed.provider,
    contentType: feed.content_type,
    permission: { approved: Boolean(feed.permission_approved), evidenceReference: feed.permission_evidence_reference || null },
    privacyReview: { approved: Boolean(feed.privacy_approved), evidenceReference: feed.privacy_evidence_reference || null },
    liveEnabled: Boolean(feed.live_enabled),
    limits: {
      maxUpdates: feed.rate_limit_max,
      windowSeconds: feed.rate_limit_window_seconds,
      maxUpdateAgeSeconds: feed.max_update_age_seconds,
    },
    lastUpdateId: feed.last_update_id ?? null,
    updatedAt: feed.updated_at,
  };
}

export function listSourceFeeds(database) {
  return database.prepare("SELECT * FROM source_feeds ORDER BY name, id").all().map(publicFeed);
}

export function updateSourceFeedGates(database, actorId, feedId, changes, reasonInput, now) {
  const reason = validateReason(reasonInput);
  const current = feedRow(database, feedId);
  const next = {
    permissionApproved: Boolean(current.permission_approved),
    permissionEvidence: current.permission_evidence_reference,
    privacyApproved: Boolean(current.privacy_approved),
    privacyEvidence: current.privacy_evidence_reference,
    liveEnabled: Boolean(current.live_enabled),
  };

  if (changes.permissionApproved !== undefined) {
    next.permissionApproved = booleanInput(changes.permissionApproved, "Permission approval");
    next.permissionEvidence = next.permissionApproved
      ? requiredText(changes.permissionEvidenceReference ?? next.permissionEvidence, "Permission evidence reference")
      : null;
  }
  if (changes.privacyApproved !== undefined) {
    next.privacyApproved = booleanInput(changes.privacyApproved, "Privacy approval");
    next.privacyEvidence = next.privacyApproved
      ? requiredText(changes.privacyEvidenceReference ?? next.privacyEvidence, "Privacy evidence reference")
      : null;
  }
  if (!next.permissionApproved || !next.privacyApproved) next.liveEnabled = false;
  if (changes.liveEnabled !== undefined) next.liveEnabled = booleanInput(changes.liveEnabled, "Live ingestion");
  if (next.liveEnabled && (!next.permissionApproved || !next.privacyApproved)) {
    fail("Written permission and privacy review approval are required before live ingestion can be enabled.", 409);
  }
  if (changes.permissionApproved === undefined && changes.privacyApproved === undefined && changes.liveEnabled === undefined) {
    fail("At least one Source Feed gate change is required.", 422);
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      UPDATE source_feeds SET permission_approved = ?, permission_evidence_reference = ?,
        privacy_approved = ?, privacy_evidence_reference = ?, live_enabled = ?, updated_at = ? WHERE id = ?
    `).run(
      next.permissionApproved ? 1 : 0, next.permissionEvidence,
      next.privacyApproved ? 1 : 0, next.privacyEvidence,
      next.liveEnabled ? 1 : 0, now.toISOString(), feedId,
    );
    recordAudit(database, {
      eventType: "source_feed_gates_updated",
      actorId,
      targetType: "source_feed",
      targetId: feedId,
      reason,
      selfDirected: false,
    }, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return publicFeed(feedRow(database, feedId));
}

export async function startLiveSourceFeed(database, feedId, adapterFactory) {
  const feed = feedRow(database, feedId);
  if (!feed.permission_approved || !feed.privacy_approved || !feed.live_enabled) {
    fail("Live Source Feed ingestion is disabled until permission, privacy review, and live-enable gates are approved.", 409);
  }
  const adapter = await adapterFactory(publicFeed(feed));
  return adapter.start();
}

function windowFor(now, seconds) {
  const length = seconds * 1000;
  return new Date(Math.floor(now.getTime() / length) * length);
}

function insertProcessed(database, feedId, event, outcome, now) {
  database.prepare(`
    INSERT INTO processed_source_updates
      (feed_id, update_id, event_type, source_post_key, payload_digest, outcome, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(feedId, event.updateId, event.eventType, event.sourcePostKey, event.payloadDigest, outcome, now.toISOString());
  database.prepare(`
    UPDATE source_feeds SET last_update_id = CASE
      WHEN last_update_id IS NULL OR last_update_id < ? THEN ? ELSE last_update_id END, updated_at = ? WHERE id = ?
  `).run(event.updateId, event.updateId, now.toISOString(), feedId);
}

function insertTombstone(database, feedId, sourcePostKey, reason, deletedAt) {
  database.prepare(`
    INSERT OR IGNORE INTO source_deletion_tombstones (id, feed_id, source_post_key, reason, deleted_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(stableId("tomb", feedId, sourcePostKey, reason, deletedAt), feedId, sourcePostKey, reason, deletedAt);
}

function applyEvent(database, feedId, event, authorKeyHash, now, { clearDivergence = true } = {}) {
  const current = database.prepare("SELECT * FROM source_posts WHERE feed_id = ? AND source_post_key = ?").get(feedId, event.sourcePostKey);
  const postId = current?.id || stableId("post", feedId, event.sourcePostKey);
  const publicId = event.listing?.id || current?.public_id || stableId("removed", feedId, event.sourcePostKey);
  const revisionAt = event.sourceEventAt.toISOString();

  if (event.eventType === "delete") {
    if (current) {
      database.prepare(`
        UPDATE source_posts SET author_key_hash = ?, revision_at = ?, source_hash = NULL, normalized_payload = NULL,
          deleted = 1, divergent = 0, updated_at = ? WHERE id = ?
      `).run(authorKeyHash, revisionAt, now.toISOString(), postId);
    } else {
      database.prepare(`
        INSERT INTO source_posts
          (id, feed_id, source_post_key, public_id, author_key_hash, revision_at, deleted, divergent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
      `).run(postId, feedId, event.sourcePostKey, publicId, authorKeyHash, revisionAt, now.toISOString(), now.toISOString());
    }
    database.prepare("DELETE FROM marketplace_listings WHERE source_post_id = ?").run(postId);
    insertTombstone(database, feedId, event.sourcePostKey, "source_deleted", revisionAt);
    return;
  }

  const payload = JSON.stringify(event.listing);
  const sourceHash = digest(event.listing);
  database.prepare(`
    INSERT INTO source_posts
      (id, feed_id, source_post_key, public_id, author_key_hash, revision_at, source_hash, normalized_payload,
       deleted, divergent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    ON CONFLICT(feed_id, source_post_key) DO UPDATE SET
      public_id = excluded.public_id, author_key_hash = excluded.author_key_hash, revision_at = excluded.revision_at,
      source_hash = excluded.source_hash, normalized_payload = excluded.normalized_payload, deleted = 0,
      divergent = CASE WHEN ? THEN 0 ELSE source_posts.divergent END, updated_at = excluded.updated_at
  `).run(
    postId, feedId, event.sourcePostKey, publicId, authorKeyHash, revisionAt, sourceHash, payload,
    now.toISOString(), now.toISOString(), clearDivergence ? 1 : 0,
  );
  database.prepare(`
    INSERT INTO marketplace_listings
      (id, source_post_id, title, category, price, description, source_name, source_url,
       image_url, image_alt, fictional, source_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_post_id) DO UPDATE SET
      id = excluded.id, title = excluded.title, category = excluded.category, price = excluded.price,
      description = excluded.description, source_name = excluded.source_name, source_url = excluded.source_url,
      image_url = excluded.image_url, image_alt = excluded.image_alt, fictional = excluded.fictional,
      source_updated_at = excluded.source_updated_at
  `).run(
    event.listing.id, postId, event.listing.title, event.listing.category, event.listing.price,
    event.listing.description, event.listing.sourceName, event.listing.sourceUrl,
    event.listing.imageUrl, event.listing.imageAlt, event.listing.fictional ? 1 : 0, revisionAt,
  );
}

function conflictType(database, feed, event, authorKeyHash, current, now) {
  if (now.getTime() - event.sourceEventAt.getTime() > feed.max_update_age_seconds * 1000) return "expired_update";
  if (feed.last_update_id != null && event.updateId < feed.last_update_id) return "out_of_order_update";
  const pending = database.prepare(`
    SELECT 1 FROM source_discrepancies WHERE feed_id = ? AND source_post_key = ? AND status = 'open' LIMIT 1
  `).get(feed.id, event.sourcePostKey);
  if (pending) return "earlier_discrepancy_open";
  if (!current) return event.eventType === "edit" ? "edit_without_create" : null;
  if (current.author_key_hash !== authorKeyHash) return "source_author_changed";
  if (current.divergent) return "retained_version";
  const incomingHash = event.listing ? digest(event.listing) : null;
  if (event.eventType === "create") {
    if (!current.deleted && current.source_hash === incomingHash) return "duplicate_content";
    return "source_post_already_exists";
  }
  if (event.eventType === "edit") {
    if (current.deleted) return "edit_after_deletion";
    if (event.sourceEventAt.getTime() <= new Date(current.revision_at).getTime()) {
      return current.source_hash === incomingHash ? "duplicate_content" : "stale_revision";
    }
  }
  if (event.eventType === "delete") {
    if (current.deleted) return "duplicate_content";
    if (event.sourceEventAt.getTime() < new Date(current.revision_at).getTime()) return "stale_revision";
  }
  return null;
}

function createDiscrepancy(database, feedId, event, authorKeyHash, type, now) {
  const stored = sourceEventForStorage(event, authorKeyHash);
  database.prepare(`
    INSERT INTO source_discrepancies
      (id, feed_id, source_post_key, update_id, discrepancy_type, incoming_event, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    stableId("discrepancy", feedId, event.updateId), feedId, event.sourcePostKey, event.updateId,
    type, JSON.stringify(stored), now.toISOString(),
  );
}

export function ingestSourceUpdate(database, feedId, event, now, identitySecret) {
  const feed = feedRow(database, feedId);
  const existing = database.prepare("SELECT outcome FROM processed_source_updates WHERE feed_id = ? AND update_id = ?").get(feedId, event.updateId);
  if (existing) return { status: "duplicate", outcome: existing.outcome };

  const windowStart = windowFor(now, feed.rate_limit_window_seconds);
  const rate = database.prepare("SELECT update_count FROM source_feed_rate_windows WHERE feed_id = ? AND window_started_at = ?").get(feedId, windowStart.toISOString());
  if ((rate?.update_count || 0) >= feed.rate_limit_max) {
    return {
      status: "rate_limited",
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + feed.rate_limit_window_seconds * 1000 - now.getTime()) / 1000)),
    };
  }

  const authorKeyHash = hashSourceAuthor(feedId, event.externalAuthorId, identitySecret);
  database.exec("BEGIN IMMEDIATE");
  try {
    const duplicate = database.prepare("SELECT outcome FROM processed_source_updates WHERE feed_id = ? AND update_id = ?").get(feedId, event.updateId);
    if (duplicate) {
      database.exec("COMMIT");
      return { status: "duplicate", outcome: duplicate.outcome };
    }
    database.prepare(`
      INSERT INTO source_feed_rate_windows (feed_id, window_started_at, update_count) VALUES (?, ?, 1)
      ON CONFLICT(feed_id, window_started_at) DO UPDATE SET update_count = update_count + 1
    `).run(feedId, windowStart.toISOString());

    const current = database.prepare("SELECT * FROM source_posts WHERE feed_id = ? AND source_post_key = ?").get(feedId, event.sourcePostKey);
    const conflict = conflictType(database, feed, event, authorKeyHash, current, now);
    if (conflict === "duplicate_content") {
      insertProcessed(database, feedId, event, "duplicate_content", now);
      database.exec("COMMIT");
      return { status: "processed", outcome: "duplicate_content" };
    }
    if (conflict) {
      createDiscrepancy(database, feedId, event, authorKeyHash, conflict, now);
      insertProcessed(database, feedId, event, "discrepancy", now);
      database.exec("COMMIT");
      return { status: "processed", outcome: "discrepancy", discrepancyType: conflict };
    }

    applyEvent(database, feedId, event, authorKeyHash, now);
    insertProcessed(database, feedId, event, "applied", now);
    database.exec("COMMIT");
    return { status: "processed", outcome: "applied" };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function recordSourceAuthorConsent(database, actorId, feedId, input, now, identitySecret) {
  feedRow(database, feedId);
  const reason = validateReason(input.reason);
  const externalAuthorId = requiredText(input.externalAuthorId, "Source author id", 200);
  const scopes = new Set(Array.isArray(input.scopes) ? input.scopes : []);
  if ([...scopes].some((scope) => !["display_name", "contact"].includes(scope)) || scopes.size === 0) {
    fail("Consent scopes must include display_name, contact, or both.", 422);
  }
  const displayName = scopes.has("display_name") ? requiredText(input.displayName, "Display name", 120) : null;
  const contactUrl = scopes.has("contact") ? requiredText(input.contactUrl, "Contact URL", 1000) : null;
  if (contactUrl) {
    let parsed;
    try { parsed = new URL(contactUrl); } catch { fail("Contact URL must be a valid HTTPS URL.", 422); }
    if (parsed.protocol !== "https:") fail("Contact URL must use HTTPS.", 422);
  }
  const evidenceReference = requiredText(input.evidenceReference, "Consent evidence reference");
  const authorKeyHash = hashSourceAuthor(feedId, externalAuthorId, identitySecret);
  const existing = database.prepare("SELECT id, active FROM source_author_consents WHERE feed_id = ? AND author_key_hash = ?").get(feedId, authorKeyHash);
  if (existing?.active) fail("Active consent is already recorded for this source author.", 409);
  const consentId = existing?.id || stableId("consent", feedId, authorKeyHash);

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO source_author_consents
        (id, feed_id, author_key_hash, display_name_allowed, contact_allowed, display_name, contact_url,
         evidence_reference, active, granted_by_participant_id, granted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(feed_id, author_key_hash) DO UPDATE SET
        display_name_allowed = excluded.display_name_allowed, contact_allowed = excluded.contact_allowed,
        display_name = excluded.display_name, contact_url = excluded.contact_url,
        evidence_reference = excluded.evidence_reference, active = 1,
        granted_by_participant_id = excluded.granted_by_participant_id, granted_at = excluded.granted_at,
        withdrawn_by_participant_id = NULL, withdrawn_at = NULL
    `).run(
      consentId, feedId, authorKeyHash, scopes.has("display_name") ? 1 : 0, scopes.has("contact") ? 1 : 0,
      displayName, contactUrl, evidenceReference, actorId, now.toISOString(),
    );
    recordAudit(database, {
      eventType: "source_author_consent_recorded",
      actorId,
      targetType: "source_author_consent",
      targetId: consentId,
      reason,
      selfDirected: false,
    }, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return getSourceAuthorConsents(database, feedId).find(({ id }) => id === consentId);
}

export function getSourceAuthorConsents(database, feedId) {
  feedRow(database, feedId);
  return database.prepare(`
    SELECT id, display_name_allowed AS displayNameAllowed, contact_allowed AS contactAllowed,
      display_name AS displayName, contact_url AS contactUrl, evidence_reference AS evidenceReference,
      active, granted_at AS grantedAt, withdrawn_at AS withdrawnAt
    FROM source_author_consents WHERE feed_id = ? ORDER BY granted_at DESC, id
  `).all(feedId).map((row) => ({
    ...row,
    displayNameAllowed: Boolean(row.displayNameAllowed),
    contactAllowed: Boolean(row.contactAllowed),
    active: Boolean(row.active),
  }));
}

export function withdrawSourceAuthorConsent(database, actorId, feedId, consentId, reasonInput, now) {
  const reason = validateReason(reasonInput);
  const consent = database.prepare("SELECT * FROM source_author_consents WHERE id = ? AND feed_id = ?").get(consentId, feedId);
  if (!consent) fail("Source author consent not found.", 404);
  if (!consent.active) fail("Source author consent is already withdrawn.", 409);

  database.exec("BEGIN IMMEDIATE");
  try {
    const posts = database.prepare("SELECT id, source_post_key FROM source_posts WHERE feed_id = ? AND author_key_hash = ? AND deleted = 0").all(feedId, consent.author_key_hash);
    for (const post of posts) {
      database.prepare("DELETE FROM marketplace_listings WHERE source_post_id = ?").run(post.id);
      database.prepare(`
        UPDATE source_posts SET normalized_payload = NULL, source_hash = NULL, deleted = 1, divergent = 0, updated_at = ? WHERE id = ?
      `).run(now.toISOString(), post.id);
      insertTombstone(database, feedId, post.source_post_key, "consent_withdrawn", now.toISOString());
    }
    database.prepare(`
      UPDATE source_discrepancies SET incoming_event = NULL, redacted = 1
      WHERE feed_id = ? AND status = 'open' AND json_extract(incoming_event, '$.authorKeyHash') = ?
    `).run(feedId, consent.author_key_hash);
    database.prepare(`
      UPDATE source_author_consents SET display_name_allowed = 0, contact_allowed = 0,
        display_name = NULL, contact_url = NULL, evidence_reference = NULL, active = 0,
        withdrawn_by_participant_id = ?, withdrawn_at = ? WHERE id = ?
    `).run(actorId, now.toISOString(), consentId);
    recordAudit(database, {
      eventType: "source_author_consent_withdrawn",
      actorId,
      targetType: "source_author_consent",
      targetId: consentId,
      reason,
      selfDirected: false,
    }, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function discrepancyView(row) {
  const incoming = parseJson(row.incoming_event);
  const current = parseJson(row.normalized_payload);
  return {
    id: row.id,
    feedId: row.feed_id,
    feedName: row.feed_name,
    listingId: row.public_id || incoming?.listing?.id || null,
    type: row.discrepancy_type,
    status: row.status,
    redacted: Boolean(row.redacted),
    incoming: incoming ? { eventType: incoming.eventType, revisionAt: incoming.revisionAt, listing: incoming.listing } : null,
    current,
    decision: row.decision || null,
    resolutionReason: row.resolution_reason || null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
  };
}

export function getSourceDiscrepancies(database, status = "open") {
  if (!["open", "resolved"].includes(status)) fail("Discrepancy status must be open or resolved.", 422);
  return database.prepare(`
    SELECT d.*, f.name AS feed_name, p.public_id, p.normalized_payload
    FROM source_discrepancies d
    JOIN source_feeds f ON f.id = d.feed_id
    LEFT JOIN source_posts p ON p.feed_id = d.feed_id AND p.source_post_key = d.source_post_key
    WHERE d.status = ? ORDER BY d.created_at, d.update_id, d.id
  `).all(status).map(discrepancyView);
}

export function resolveSourceDiscrepancy(database, actorId, discrepancyId, decision, reasonInput, now) {
  if (!['apply_source', 'retain_current'].includes(decision)) fail("Decision must be apply_source or retain_current.", 422);
  const reason = validateReason(reasonInput);
  const discrepancy = database.prepare("SELECT * FROM source_discrepancies WHERE id = ?").get(discrepancyId);
  if (!discrepancy) fail("Source Discrepancy not found.", 404);
  if (discrepancy.status !== "open") fail("Source Discrepancy is already resolved.", 409);
  const oldest = database.prepare(`
    SELECT id FROM source_discrepancies
    WHERE feed_id = ? AND source_post_key = ? AND status = 'open'
    ORDER BY created_at, update_id, id LIMIT 1
  `).get(discrepancy.feed_id, discrepancy.source_post_key);
  if (oldest.id !== discrepancyId) fail("Resolve the oldest Source Discrepancy for this post first.", 409);
  if (decision === "apply_source" && discrepancy.redacted) fail("Redacted source content cannot be applied after consent withdrawal.", 409);

  database.exec("BEGIN IMMEDIATE");
  try {
    if (decision === "apply_source") {
      const incoming = parseJson(discrepancy.incoming_event);
      applyEvent(database, discrepancy.feed_id, {
        updateId: discrepancy.update_id,
        eventType: incoming.eventType,
        sourcePostKey: incoming.sourcePostKey,
        sourceEventAt: new Date(incoming.revisionAt),
        listing: incoming.listing,
      }, incoming.authorKeyHash, now);
    } else {
      database.prepare(`
        UPDATE source_posts SET divergent = CASE WHEN deleted = 0 THEN 1 ELSE 0 END, updated_at = ?
        WHERE feed_id = ? AND source_post_key = ?
      `).run(now.toISOString(), discrepancy.feed_id, discrepancy.source_post_key);
    }
    database.prepare(`
      UPDATE source_discrepancies SET status = 'resolved', decision = ?, resolution_reason = ?,
        resolved_by_participant_id = ?, resolved_at = ? WHERE id = ?
    `).run(decision, reason, actorId, now.toISOString(), discrepancyId);
    recordAudit(database, {
      eventType: decision === "apply_source" ? "source_discrepancy_applied" : "source_discrepancy_retained",
      actorId,
      targetType: "source_discrepancy",
      targetId: discrepancyId,
      reason,
      selfDirected: false,
    }, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return getSourceDiscrepancies(database, "resolved").find(({ id }) => id === discrepancyId);
}
