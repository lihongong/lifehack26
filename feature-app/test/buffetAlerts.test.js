import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../backend/src/db/database.js";
import { createDemoBuffetPosts } from "../backend/src/data/demoBuffetPosts.js";
import { completeLaunch, createLaunchAssertion, sessionPayload } from "../backend/src/services/authService.js";
import { acceptActivePolicies, activatePolicyVersion } from "../backend/src/services/policyService.js";
import { getGemAccount } from "../backend/src/services/gemService.js";
import {
  buffetPostStates,
  deliverEligibleAlerts,
  getAlertSettings,
  ingestBuffetPosts,
  listOpenBuffetReviews,
  listParticipantAlerts,
  recordAlertFeedback,
  resolveBuffetReview,
  updateAlertPreference,
} from "../backend/src/services/buffetAlertService.js";
import { updateParticipantProfile } from "../backend/src/services/participantService.js";

const anchor = new Date("2026-08-30T04:00:00Z");
const posts = createDemoBuffetPosts(anchor);

function participant(database, suffix, name = `Participant ${suffix}`) {
  const launched = completeLaunch(database, createLaunchAssertion(database, {
    subject: `buffet-${suffix}`,
    email: `buffet-${suffix}@example.nus.edu.sg`,
  }, anchor), anchor);
  updateParticipantProfile(database, launched.participant.id, { displayName: name, nusZone: null }, anchor);
  acceptActivePolicies(database, launched.participant.id, ["terms-v1", "privacy-v1"], anchor);
  return launched.participant;
}

test("file-backed upgrade preserves legacy notifications and is idempotent across reopenings", () => {
  const directory = mkdtempSync(join(tmpdir(), "buffet-alert-upgrade-"));
  const path = join(directory, "upgrade.sqlite");
  const migrations = fileURLToPath(new URL("../backend/src/migrations", import.meta.url));
  const legacy = new DatabaseSync(path);
  legacy.exec("PRAGMA foreign_keys = ON");
  for (const migration of readdirSync(migrations).filter((name) => name.endsWith(".sql") && name < "006_buffet_alerts.sql").sort()) {
    legacy.exec(readFileSync(join(migrations, migration), "utf8"));
  }
  legacy.prepare(`
    INSERT INTO participants (id, public_id, external_subject, email, verification_state, created_at, updated_at, nus_zone)
    VALUES ('p1', 'public-p1', 'subject-p1', 'p1@example.nus.edu.sg', 'verified', ?, ?, 'Kent Ridge')
  `).run(anchor.toISOString(), anchor.toISOString());
  const insertNotification = legacy.prepare("INSERT INTO notifications VALUES (?, 'p1', ?, 'comment', ?, ?, ?)");
  insertNotification.run("n1", "reply_received", "one", "Reply", anchor.toISOString());
  insertNotification.run("n2", "comment_moderated", "two", "Moderated", anchor.toISOString());
  insertNotification.run("n3", "report_resolved", "three", "Resolved", anchor.toISOString());
  legacy.close();

  for (let reopening = 0; reopening < 2; reopening += 1) {
    const database = createDatabase(path);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notifications").get().count, 3);
    assert.equal(database.prepare("SELECT nus_zone FROM participants WHERE id = 'p1'").get().nus_zone, "medicine-kent-ridge");
    assert.equal(database.prepare("SELECT buffet_alerts_enabled FROM participants WHERE id = 'p1'").get().buffet_alerts_enabled, 0);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE name = '006_buffet_alerts.sql'").get().count, 1);
    database.close();
  }
  rmSync(directory, { recursive: true, force: true });
});

test("preferences start off, require policy to enable, and deliver only same or one-hop posts once", () => {
  const database = createDatabase(":memory:");
  ingestBuffetPosts(database, posts, anchor);
  const launched = completeLaunch(database, createLaunchAssertion(database, {
    subject: "buffet-default", email: "buffet-default@example.nus.edu.sg",
  }, anchor), anchor).participant;
  assert.deepEqual(getAlertSettings(database, launched.id), {
    nusZone: null, enabled: false, zones: getAlertSettings(database, launched.id).zones,
  });
  assert.throws(() => updateAlertPreference(database, launched.id, { nusZone: "central", enabled: true }, anchor), /policy/i);
  acceptActivePolicies(database, launched.id, ["terms-v1", "privacy-v1"], anchor);
  updateAlertPreference(database, launched.id, { nusZone: "central", enabled: true }, anchor);
  const alerts = listParticipantAlerts(database, launched.id);
  assert.deepEqual(alerts.map(({ postId }) => postId).sort(), ["business-sandwiches", "fass-fruit", "science-bentos"]);
  assert.deepEqual(Object.keys(alerts[0]).sort(), ["createdAt", "id", "matchType", "outcome", "postId", "postState"]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE participant_id = ? AND type = 'buffet_alert'").get(launched.id).count, 3);
  deliverEligibleAlerts(database, anchor, undefined, launched.id);
  ingestBuffetPosts(database, posts.map((post) => post.id === "science-bentos" ? { ...post, title: "Edited bento title" } : post), anchor);
  assert.equal(listParticipantAlerts(database, launched.id).length, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE participant_id = ? AND type = 'buffet_alert'").get(launched.id).count, 3);
  assert.throws(() => database.prepare("UPDATE participants SET nus_zone = NULL WHERE id = ?").run(launched.id), /canonical NUS Zone/);
  updateParticipantProfile(database, launched.id, { displayName: "Default Diner", nusZone: null }, anchor);
  assert.equal(getAlertSettings(database, launched.id).enabled, false);
  database.close();
});

test("delivery is ingestion-driven, policy renewal pauses it, and opt-out remains available", () => {
  const database = createDatabase(":memory:");
  ingestBuffetPosts(database, posts, anchor);
  const current = participant(database, "ingestion");
  updateAlertPreference(database, current.id, { nusZone: "central", enabled: true }, anchor);
  const newPost = { ...posts[0], id: "central-ingested", zoneId: "central", reportedLocation: "CLB" };
  ingestBuffetPosts(database, [...posts, newPost], anchor);
  assert.ok(listParticipantAlerts(database, current.id).some(({ postId }) => postId === "central-ingested"));

  const renewalTime = new Date("2026-10-01T00:00:00Z");
  activatePolicyVersion(database, "privacy", "2026-10-01", renewalTime);
  assert.throws(() => updateParticipantProfile(database, current.id, { displayName: "Participant ingestion", nusZone: "science" }, renewalTime), /policy/i);
  const postAfterRenewal = { ...newPost, id: "central-after-renewal", sourceTime: renewalTime.toISOString(), collectionDeadline: new Date(renewalTime.getTime() + 60_000).toISOString() };
  ingestBuffetPosts(database, [postAfterRenewal], renewalTime);
  assert.equal(listParticipantAlerts(database, current.id).some(({ postId }) => postId === postAfterRenewal.id), false);
  updateAlertPreference(database, current.id, { nusZone: "central", enabled: false }, renewalTime);
  assert.equal(getAlertSettings(database, current.id).enabled, false);
  database.close();
});

test("food-gone feedback shares an open review, preserves evidence, repeats after restoration, and audits outcomes", () => {
  const database = createDatabase(":memory:");
  ingestBuffetPosts(database, posts, anchor);
  const first = participant(database, "first", "First Foodie");
  const second = participant(database, "second", "Second Foodie");
  updateAlertPreference(database, first.id, { nusZone: "central", enabled: true }, anchor);
  updateAlertPreference(database, second.id, { nusZone: "central", enabled: true }, anchor);
  const firstAlert = listParticipantAlerts(database, first.id).find(({ postId }) => postId === "science-bentos");
  const secondAlert = listParticipantAlerts(database, second.id).find(({ postId }) => postId === "science-bentos");
  const gemsBefore = getGemAccount(database, first.id).balance;
  recordAlertFeedback(database, first.id, firstAlert.id, "food_gone", anchor);
  recordAlertFeedback(database, second.id, secondAlert.id, "food_gone", anchor);
  assert.throws(() => recordAlertFeedback(database, second.id, firstAlert.id, "helpful", anchor), /not found/i);
  assert.throws(() => recordAlertFeedback(database, first.id, firstAlert.id, "helpful", anchor), /already recorded/i);
  let reviews = listOpenBuffetReviews(database);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].signalCount, 2);
  assert.equal(reviews[0].title, "Vegetarian bento boxes");
  ingestBuffetPosts(database, posts.map((post) => post.id === "science-bentos" ? { ...post, title: "Edited after report" } : post), anchor);
  assert.equal(listOpenBuffetReviews(database)[0].title, "Vegetarian bento boxes");
  assert.equal(buffetPostStates(database).get("science-bentos"), "possibly_gone");

  const moderator = participant(database, "moderator", "Buffet Moderator");
  const restored = resolveBuffetReview(database, { participant_id: moderator.id }, reviews[0].id, "restored", "Food remains available", anchor);
  assert.equal(restored.outcome, "restored");
  assert.equal(buffetPostStates(database).get("science-bentos"), "active");

  const third = participant(database, "third", "Third Foodie");
  updateAlertPreference(database, third.id, { nusZone: "central", enabled: true }, anchor);
  const thirdAlert = listParticipantAlerts(database, third.id).find(({ postId }) => postId === "science-bentos");
  recordAlertFeedback(database, third.id, thirdAlert.id, "food_gone", anchor);
  reviews = listOpenBuffetReviews(database);
  assert.equal(reviews[0].cycle, 2);
  const afterExpiry = new Date("2026-08-30T05:35:00.000Z");
  const expired = resolveBuffetReview(database, { participant_id: moderator.id }, reviews[0].id, "restored", "Checked after the collection window", afterExpiry);
  assert.equal(expired.outcome, "expired");
  assert.equal(buffetPostStates(database).get("science-bentos"), "confirmed_expired");
  assert.deepEqual(database.prepare("SELECT event_type FROM audit_log WHERE event_type LIKE 'buffet_post_%' ORDER BY created_at, event_type").all().map(({ event_type }) => event_type), ["buffet_post_restored", "buffet_post_expired"]);
  assert.equal(getGemAccount(database, first.id).balance, gemsBefore);
  assert.throws(() => database.prepare("DELETE FROM helpful_alert_outcomes WHERE alert_id = ?").run(firstAlert.id), /immutable/);
  assert.throws(() => database.prepare("UPDATE buffet_review_resolutions SET reason = 'changed'").run(), /immutable/);
  database.close();
});

test("Buffet review resolution rolls back state when the audit write fails", () => {
  const database = createDatabase(":memory:");
  ingestBuffetPosts(database, posts, anchor);
  const current = participant(database, "rollback", "Rollback Foodie");
  const moderator = participant(database, "rollback-mod", "Rollback Moderator");
  updateAlertPreference(database, current.id, { nusZone: "central", enabled: true }, anchor);
  const alert = listParticipantAlerts(database, current.id).find(({ postId }) => postId === "science-bentos");
  recordAlertFeedback(database, current.id, alert.id, "food_gone", anchor);
  const review = listOpenBuffetReviews(database)[0];
  database.exec("CREATE TRIGGER reject_buffet_audit BEFORE INSERT ON audit_log WHEN NEW.event_type LIKE 'buffet_post_%' BEGIN SELECT RAISE(ABORT, 'audit rejected'); END;");
  assert.throws(() => resolveBuffetReview(database, { participant_id: moderator.id }, review.id, "restored", "Attempt rollback proof", anchor), /audit rejected/);
  assert.equal(listOpenBuffetReviews(database).length, 1);
  assert.equal(buffetPostStates(database).get("science-bentos"), "possibly_gone");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM buffet_review_resolutions").get().count, 0);
  database.close();
});
