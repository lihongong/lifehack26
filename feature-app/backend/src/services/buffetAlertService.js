import { randomUUID } from "node:crypto";
import { withImmediateTransaction } from "../db/database.js";
import { adjacentZoneIds, nusZones, publicZones } from "../data/nusZones.js";
import { buffetPostExpiry } from "./buffetService.js";
import { getPolicyStatus } from "./policyService.js";
import { recordAudit, validateReason } from "./privilegeService.js";

export const DEMO_BUFFET_FEED_ID = "demo-buffet-v1";
const canonicalZoneIds = new Set(nusZones.map(({ id }) => id));
const legacyProfileZones = new Map([
  ["Kent Ridge", "medicine-kent-ridge"],
  ["Bukit Timah", null],
  ["Outram", null],
]);
const internalPostId = (feedId, sourcePostId) => `${feedId}:${sourcePostId}`;

function persistedPost(row) {
  return {
    internalId: row.id,
    id: row.source_post_id,
    sourceFeedId: row.source_feed_id,
    title: row.title,
    description: row.description,
    source: row.source_name,
    sourceTime: row.source_time,
    reportedLocation: row.reported_location,
    zoneId: row.zone_id,
    collectionDeadline: row.collection_deadline,
    fictional: Boolean(row.fictional),
  };
}

export function listPersistedBuffetPosts(database, feedId = DEMO_BUFFET_FEED_ID) {
  return database.prepare("SELECT * FROM buffet_posts WHERE source_feed_id = ? ORDER BY source_time DESC, source_post_id").all(feedId).map(persistedPost);
}

export function buffetPostStates(database, feedId = DEMO_BUFFET_FEED_ID) {
  return new Map(database.prepare(`
    SELECT bp.source_post_id AS sourcePostId, bps.state
    FROM buffet_posts bp LEFT JOIN buffet_post_states bps ON bps.buffet_post_id = bp.id
    WHERE bp.source_feed_id = ?
  `).all(feedId).map(({ sourcePostId, state }) => [sourcePostId, state || "active"]));
}

export function ingestBuffetPosts(database, posts, now, feedId = DEMO_BUFFET_FEED_ID) {
  withImmediateTransaction(database, () => {
    const upsert = database.prepare(`
      INSERT INTO buffet_posts (
        id, source_feed_id, source_post_id, title, description, source_name, source_time,
        reported_location, zone_id, collection_deadline, fictional, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_feed_id, source_post_id) DO UPDATE SET
        title = excluded.title, description = excluded.description, source_name = excluded.source_name,
        source_time = excluded.source_time, reported_location = excluded.reported_location,
        zone_id = excluded.zone_id, collection_deadline = excluded.collection_deadline,
        fictional = excluded.fictional, updated_at = excluded.updated_at
    `);
    const ensureState = database.prepare("INSERT OR IGNORE INTO buffet_post_states (buffet_post_id, state, updated_at) VALUES (?, 'active', ?)");
    for (const post of posts) {
      const id = internalPostId(feedId, post.id);
      upsert.run(id, feedId, post.id, post.title, post.description, post.source, post.sourceTime,
        post.reportedLocation, post.zoneId, post.collectionDeadline, post.fictional ? 1 : 0, now.toISOString());
      ensureState.run(id, now.toISOString());
    }
  });
  return deliverEligibleAlerts(database, now, feedId);
}

function policyRequired(status) {
  return Object.assign(new Error("Current policy acceptance is required for Buffet Alerts."), {
    status: 428,
    code: "POLICY_ACCEPTANCE_REQUIRED",
    missingPolicies: status.missingPolicies.map(({ type, version }) => ({ type, version })),
  });
}

export function updateAlertPreference(database, participantId, { nusZone, enabled }, now) {
  if (typeof enabled !== "boolean") throw Object.assign(new Error("Buffet Alerts must be on or off."), { status: 422 });
  const zone = nusZone || null;
  if (zone && !canonicalZoneIds.has(zone)) throw Object.assign(new Error("Invalid NUS Zone."), { status: 422 });
  if (enabled && !zone) throw Object.assign(new Error("Select a NUS Zone before enabling Buffet Alerts."), { status: 422 });
  if (enabled) {
    const status = getPolicyStatus(database, participantId, "alerts");
    if (!status.allowed) throw policyRequired(status);
  }
  database.prepare("UPDATE participants SET nus_zone = ?, buffet_alerts_enabled = ?, updated_at = ? WHERE id = ?")
    .run(zone, enabled ? 1 : 0, now.toISOString(), participantId);
  if (enabled) deliverEligibleAlerts(database, now);
  return getAlertSettings(database, participantId);
}

export function updateProfileZone(database, participantId, zoneInput, now, { deliver = true } = {}) {
  const requestedZone = zoneInput || null;
  const zone = legacyProfileZones.has(requestedZone) ? legacyProfileZones.get(requestedZone) : requestedZone;
  if (zone && !canonicalZoneIds.has(zone)) throw Object.assign(new Error("Invalid NUS Zone."), { status: 422 });
  const participant = database.prepare("SELECT nus_zone, buffet_alerts_enabled FROM participants WHERE id = ?").get(participantId);
  if (participant.buffet_alerts_enabled && zone && zone !== participant.nus_zone) {
    const status = getPolicyStatus(database, participantId, "alerts");
    if (!status.allowed) throw policyRequired(status);
  }
  database.prepare(`
    UPDATE participants SET nus_zone = ?, buffet_alerts_enabled = CASE WHEN ? IS NULL THEN 0 ELSE buffet_alerts_enabled END,
      updated_at = ? WHERE id = ?
  `).run(zone, zone, now.toISOString(), participantId);
  if (deliver && participant.buffet_alerts_enabled && zone) deliverEligibleAlerts(database, now);
  return { enabled: Boolean(participant.buffet_alerts_enabled && zone), zone };
}

export function getAlertSettings(database, participantId) {
  const participant = database.prepare("SELECT nus_zone, buffet_alerts_enabled FROM participants WHERE id = ?").get(participantId);
  return { nusZone: participant.nus_zone, enabled: Boolean(participant.buffet_alerts_enabled), zones: publicZones() };
}

function activePosts(database, feedId, now) {
  return database.prepare(`
    SELECT bp.* FROM buffet_posts bp
    JOIN buffet_post_states state ON state.buffet_post_id = bp.id
    WHERE bp.source_feed_id = ? AND state.state = 'active'
  `).all(feedId).map(persistedPost).filter((post) => new Date(buffetPostExpiry(post)) > now);
}

export function deliverEligibleAlerts(database, now, feedId = DEMO_BUFFET_FEED_ID, participantId = null) {
  const participants = database.prepare(`
    SELECT id, nus_zone FROM participants
    WHERE buffet_alerts_enabled = 1 AND nus_zone IS NOT NULL ${participantId ? "AND id = ?" : ""}
  `).all(...(participantId ? [participantId] : []));
  const posts = activePosts(database, feedId, now);
  let delivered = 0;
  withImmediateTransaction(database, () => {
    const insertAlert = database.prepare(`
      INSERT INTO buffet_alerts (id, participant_id, buffet_post_id, notification_id, match_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(participant_id, buffet_post_id) DO NOTHING
    `);
    const insertNotification = database.prepare(`
      INSERT INTO notifications (id, participant_id, type, target_type, target_id, message, created_at)
      VALUES (?, ?, 'buffet_alert', 'buffet_alert', ?, ?, ?)
    `);
    for (const participant of participants) {
      if (!getPolicyStatus(database, participant.id, "alerts").allowed) continue;
      const nearby = new Set(adjacentZoneIds(participant.nus_zone));
      for (const post of posts) {
        const matchType = post.zoneId === participant.nus_zone ? "selected_zone" : nearby.has(post.zoneId) ? "nearby_zone" : null;
        if (!matchType) continue;
        const alertId = randomUUID();
        const notificationId = randomUUID();
        const inserted = insertAlert.run(alertId, participant.id, post.internalId, notificationId, matchType, now.toISOString());
        if (!inserted.changes) continue;
        insertNotification.run(notificationId, participant.id, alertId,
          `${matchType === "selected_zone" ? "Your NUS Zone" : "Nearby Zone"}: ${post.title}`, now.toISOString());
        delivered += 1;
      }
    }
  });
  return { delivered };
}

export function listParticipantAlerts(database, participantId) {
  return database.prepare(`
    SELECT ba.id, ba.match_type AS matchType, ba.created_at AS createdAt,
      bp.source_post_id AS postId,
      hao.outcome, bps.state AS postState
    FROM buffet_alerts ba
    JOIN buffet_posts bp ON bp.id = ba.buffet_post_id
    JOIN buffet_post_states bps ON bps.buffet_post_id = bp.id
    LEFT JOIN helpful_alert_outcomes hao ON hao.alert_id = ba.id
    WHERE ba.participant_id = ? ORDER BY ba.created_at DESC, ba.id DESC
  `).all(participantId);
}

export function recordAlertFeedback(database, participantId, alertId, outcome, now) {
  if (!new Set(["helpful", "food_gone"]).has(outcome)) throw Object.assign(new Error("Invalid Helpful Alert outcome."), { status: 422 });
  const alert = database.prepare(`
    SELECT ba.id, ba.buffet_post_id, bp.* FROM buffet_alerts ba
    JOIN buffet_posts bp ON bp.id = ba.buffet_post_id
    WHERE ba.id = ? AND ba.participant_id = ?
  `).get(alertId, participantId);
  if (!alert) throw Object.assign(new Error("Buffet Alert not found."), { status: 404 });
  if (database.prepare("SELECT 1 FROM helpful_alert_outcomes WHERE alert_id = ?").get(alertId)) {
    throw Object.assign(new Error("Helpful Alert outcome is already recorded."), { status: 409 });
  }
  let reviewId = null;
  withImmediateTransaction(database, () => {
    if (outcome === "food_gone") {
      const open = database.prepare("SELECT id FROM buffet_food_gone_reviews WHERE buffet_post_id = ? AND status = 'open'").get(alert.buffet_post_id);
      reviewId = open?.id || randomUUID();
      if (!open) {
        const cycle = database.prepare("SELECT COALESCE(MAX(cycle), 0) + 1 AS cycle FROM buffet_food_gone_reviews WHERE buffet_post_id = ?").get(alert.buffet_post_id).cycle;
        database.prepare(`
          INSERT INTO buffet_food_gone_reviews (
            id, buffet_post_id, cycle, snapshot_title, snapshot_description, snapshot_location,
            snapshot_zone_id, snapshot_source_time, opened_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(reviewId, alert.buffet_post_id, cycle, alert.title, alert.description, alert.reported_location,
          alert.zone_id, alert.source_time, now.toISOString());
      }
      database.prepare("UPDATE buffet_post_states SET state = 'possibly_gone', updated_at = ? WHERE buffet_post_id = ?")
        .run(now.toISOString(), alert.buffet_post_id);
    }
    database.prepare("INSERT INTO helpful_alert_outcomes (alert_id, outcome, review_id, created_at) VALUES (?, ?, ?, ?)")
      .run(alertId, outcome, reviewId, now.toISOString());
  });
  return { alertId, outcome };
}

export function listOpenBuffetReviews(database) {
  return database.prepare(`
    SELECT review.id, review.cycle, review.snapshot_title AS title,
      review.snapshot_description AS description, review.snapshot_location AS reportedLocation,
      review.snapshot_zone_id AS zoneId, review.snapshot_source_time AS sourceTime,
      review.opened_at AS openedAt, COUNT(outcome.alert_id) AS signalCount,
      MIN(outcome.created_at) AS firstSignalAt, MAX(outcome.created_at) AS latestSignalAt
    FROM buffet_food_gone_reviews review
    JOIN helpful_alert_outcomes outcome ON outcome.review_id = review.id
    WHERE review.status = 'open'
    GROUP BY review.id ORDER BY review.opened_at, review.id
  `).all();
}

export function resolveBuffetReview(database, actor, reviewId, requestedOutcome, reasonInput, now) {
  if (!new Set(["restored", "expired"]).has(requestedOutcome)) throw Object.assign(new Error("Invalid Buffet review outcome."), { status: 422 });
  const reason = validateReason(reasonInput);
  const review = database.prepare(`
    SELECT review.*, bp.collection_deadline, bp.source_time, bp.source_feed_id
    FROM buffet_food_gone_reviews review JOIN buffet_posts bp ON bp.id = review.buffet_post_id
    WHERE review.id = ? AND review.status = 'open'
  `).get(reviewId);
  if (!review) throw Object.assign(new Error("Open Buffet food-gone review not found."), { status: 404 });
  const effectiveOutcome = requestedOutcome === "restored" && new Date(buffetPostExpiry({
    sourceTime: review.source_time,
    collectionDeadline: review.collection_deadline,
  })) <= now ? "expired" : requestedOutcome;
  withImmediateTransaction(database, () => {
    database.prepare("INSERT INTO buffet_review_resolutions (review_id, outcome, moderator_participant_id, reason, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(reviewId, effectiveOutcome, actor.participant_id, reason, now.toISOString());
    database.prepare("UPDATE buffet_food_gone_reviews SET status = 'resolved', resolved_at = ? WHERE id = ?")
      .run(now.toISOString(), reviewId);
    database.prepare("UPDATE buffet_post_states SET state = ?, updated_at = ? WHERE buffet_post_id = ?")
      .run(effectiveOutcome === "restored" ? "active" : "confirmed_expired", now.toISOString(), review.buffet_post_id);
    recordAudit(database, {
      eventType: effectiveOutcome === "restored" ? "buffet_post_restored" : "buffet_post_expired",
      actorId: actor.participant_id,
      targetType: "buffet_post",
      targetId: review.buffet_post_id,
      reason,
      selfDirected: false,
    }, now);
  });
  if (effectiveOutcome === "restored") deliverEligibleAlerts(database, now, review.source_feed_id);
  return { reviewId, outcome: effectiveOutcome, requestedOutcome };
}
