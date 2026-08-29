import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createDatabase } from "../backend/src/db/database.js";
import { createApp } from "../backend/src/app.js";
import { createClock } from "../backend/src/services/clock.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import { findListings } from "../backend/src/services/listingsService.js";
import {
  getSourceDiscrepancies,
  ingestSourceUpdate,
  recordSourceAuthorConsent,
  resolveSourceDiscrepancy,
  startLiveSourceFeed,
  updateSourceFeedGates,
  withdrawSourceAuthorConsent,
} from "../backend/src/services/sourceFeedService.js";
import { normalizeTelegramUpdate } from "../backend/src/sourceFeeds/sourceFeedDomain.js";
import { replaySourceFixture, sourceFixtureSnapshot } from "../backend/src/sourceFeeds/telegramFixtureAdapter.js";

const feedId = "telegram-marketplace-demo";
const secret = "source-feed-test-secret";
const baseTime = new Date("2026-08-29T10:00:00Z");

function actor(database, suffix = "one") {
  return completeLaunch(
    database,
    createLaunchAssertion(database, { subject: `moderator-${suffix}`, email: `moderator-${suffix}@example.nus.edu.sg` }, baseTime),
    baseTime,
  ).participant;
}

function update({
  updateId,
  messageId,
  authorId = "source-author",
  date = 1787997600,
  editDate,
  title = "Fixture item",
  category = "Study",
  price = 10,
  description = "Normalized fixture description.",
  text,
  event = "message",
}) {
  const message = {
    message_id: messageId,
    date,
    chat: { username: "nus_marketplace_demo" },
    from: { id: authorId, first_name: "Private Fixture Seller", username: "private_fixture_seller" },
  };
  if (event !== "deleted_message") {
    message.text = text || `Title: ${title}\nCategory: ${category}\nPrice: S$${price}\nDescription: ${description}\nContact: @private_fixture_seller`;
  }
  if (editDate != null) message.edit_date = editDate;
  return normalizeTelegramUpdate(
    { update_id: updateId, [event]: message },
    { feedId, fictional: true, media: { imageUrl: "/images/listings/calculator.svg", imageAlt: "Fictional fixture item" } },
  );
}

test("the allowlisted Telegram fixture replays deterministically and idempotently", () => {
  const database = createDatabase(":memory:");
  const first = replaySourceFixture(database, "marketplace-baseline", { identitySecret: secret });
  const firstSnapshot = sourceFixtureSnapshot(database);
  const second = replaySourceFixture(database, "marketplace-baseline", { identitySecret: secret });
  assert.ok(first.outcomes.every(({ outcome }) => outcome === "applied"));
  assert.ok(second.outcomes.every(({ status }) => status === "duplicate"));
  assert.deepEqual(sourceFixtureSnapshot(database), firstSnapshot);
  assert.equal(firstSnapshot.processedUpdates, 4);
  database.close();
});

test("live adapter creation is gated by permission, privacy review, and explicit enablement", async () => {
  const database = createDatabase(":memory:");
  const moderator = actor(database);
  let factoryCalls = 0;
  const factory = async () => { factoryCalls += 1; return { start: () => "started" }; };
  await assert.rejects(() => startLiveSourceFeed(database, feedId, factory), /disabled/);
  assert.equal(factoryCalls, 0);

  updateSourceFeedGates(database, moderator.id, feedId, {
    privacyApproved: true,
    privacyEvidenceReference: "privacy-001",
  }, "Privacy review approved before written permission", baseTime);
  await assert.rejects(() => startLiveSourceFeed(database, feedId, factory), /disabled/);
  assert.equal(factoryCalls, 0);
  assert.throws(() => updateSourceFeedGates(database, moderator.id, feedId, { liveEnabled: true }, "Attempt live enable", baseTime), /written permission/i);
  assert.equal(factoryCalls, 0);

  updateSourceFeedGates(database, moderator.id, feedId, {
    permissionApproved: true,
    permissionEvidenceReference: "permission-001",
    liveEnabled: true,
  }, "Written permission approved for fixture feed", baseTime);
  assert.equal(await startLiveSourceFeed(database, feedId, factory), "started");
  assert.equal(factoryCalls, 1);

  const revoked = updateSourceFeedGates(database, moderator.id, feedId, { permissionApproved: false }, "Permission was revoked", baseTime);
  assert.equal(revoked.liveEnabled, false);
  await assert.rejects(() => startLiveSourceFeed(database, feedId, factory), /disabled/);
  assert.equal(factoryCalls, 1);
  database.close();
});

test("edits and deletions propagate while stale changes require oldest-first Moderator review", () => {
  const database = createDatabase(":memory:");
  const moderator = actor(database);
  const created = update({ updateId: 1, messageId: 10, date: 1787997000, title: "Original title" });
  assert.equal(ingestSourceUpdate(database, feedId, created, baseTime, secret).outcome, "applied");
  const edited = update({ updateId: 2, messageId: 10, date: 1787997000, editDate: 1787997300, title: "Edited title", event: "edited_message" });
  assert.equal(ingestSourceUpdate(database, feedId, edited, baseTime, secret).outcome, "applied");
  assert.equal(findListings(database)[0].title, "Edited title");

  const stale = update({ updateId: 3, messageId: 10, date: 1787997000, editDate: 1787997200, title: "Stale title", event: "edited_message" });
  const later = update({ updateId: 4, messageId: 10, date: 1787997000, editDate: 1787997400, title: "Later title", event: "edited_message" });
  assert.equal(ingestSourceUpdate(database, feedId, stale, baseTime, secret).discrepancyType, "stale_revision");
  assert.equal(ingestSourceUpdate(database, feedId, later, baseTime, secret).discrepancyType, "earlier_discrepancy_open");
  const [first, second] = getSourceDiscrepancies(database);
  assert.throws(() => resolveSourceDiscrepancy(database, moderator.id, second.id, "apply_source", "Trying the later update first", baseTime), /oldest/);
  resolveSourceDiscrepancy(database, moderator.id, first.id, "retain_current", "Current normalized version is correct", baseTime);
  resolveSourceDiscrepancy(database, moderator.id, second.id, "apply_source", "Later source edit is now verified", baseTime);
  assert.equal(findListings(database)[0].title, "Later title");

  const deleted = update({ updateId: 5, messageId: 10, date: 1787997500, event: "deleted_message" });
  assert.equal(ingestSourceUpdate(database, feedId, deleted, baseTime, secret).outcome, "applied");
  assert.deepEqual(findListings(database), []);
  database.close();
});

test("scoped consent controls attribution and withdrawal scrubs PII, content, and staged changes", () => {
  const database = createDatabase(":memory:");
  const moderator = actor(database);
  const created = update({ updateId: 1, messageId: 20, authorId: "private-author", date: 1787997000 });
  ingestSourceUpdate(database, feedId, created, baseTime, secret);
  assert.equal(findListings(database)[0].contactUrl, undefined);

  const consent = recordSourceAuthorConsent(database, moderator.id, feedId, {
    externalAuthorId: "private-author",
    scopes: ["display_name", "contact"],
    displayName: "Consenting Author",
    contactUrl: "https://t.me/consenting_author_unavailable",
    evidenceReference: "consent-evidence-001",
    reason: "Author consent was recorded",
  }, baseTime, secret);
  assert.equal(findListings(database)[0].authorDisplayName, "Consenting Author");
  assert.equal(findListings(database)[0].contactUrl, "https://t.me/consenting_author_unavailable");

  const stale = update({ updateId: 2, messageId: 20, authorId: "private-author", date: 1787997000, editDate: 1787996900, title: "Conflicting content", event: "edited_message" });
  ingestSourceUpdate(database, feedId, stale, baseTime, secret);
  withdrawSourceAuthorConsent(database, moderator.id, feedId, consent.id, "Author withdrew attribution and content consent", baseTime);
  assert.deepEqual(findListings(database), []);
  const stored = database.prepare("SELECT display_name, contact_url, evidence_reference, active FROM source_author_consents WHERE id = ?").get(consent.id);
  assert.deepEqual({ ...stored }, { display_name: null, contact_url: null, evidence_reference: null, active: 0 });
  assert.equal(database.prepare("SELECT normalized_payload FROM source_posts WHERE public_id = ?").get(created.listing.id).normalized_payload, null);
  const discrepancy = getSourceDiscrepancies(database)[0];
  assert.equal(discrepancy.redacted, true);
  assert.throws(() => resolveSourceDiscrepancy(database, moderator.id, discrepancy.id, "apply_source", "Cannot restore withdrawn content", baseTime), /cannot be applied/);
  resolveSourceDiscrepancy(database, moderator.id, discrepancy.id, "retain_current", "Acknowledge the consent withdrawal tombstone", baseTime);
  database.close();
});

test("duplicates bypass quota, rate-limited retries preserve the cursor, and expired updates enter review", () => {
  const database = createDatabase(":memory:");
  database.prepare("UPDATE source_feeds SET rate_limit_max = 1 WHERE id = ?").run(feedId);
  const first = update({ updateId: 1, messageId: 31, date: 1787997600 });
  assert.equal(ingestSourceUpdate(database, feedId, first, baseTime, secret).outcome, "applied");
  assert.equal(ingestSourceUpdate(database, feedId, first, baseTime, secret).status, "duplicate");

  const retry = update({ updateId: 2, messageId: 32, date: 1787997600 });
  const limited = ingestSourceUpdate(database, feedId, retry, baseTime, secret);
  assert.equal(limited.status, "rate_limited");
  assert.equal(database.prepare("SELECT last_update_id AS id FROM source_feeds WHERE id = ?").get(feedId).id, 1);
  assert.equal(ingestSourceUpdate(database, feedId, retry, new Date("2026-08-29T10:01:00Z"), secret).outcome, "applied");

  const expired = update({ updateId: 3, messageId: 33, date: 1787907600 });
  const expiredResult = ingestSourceUpdate(database, feedId, expired, new Date("2026-08-29T10:02:00Z"), secret);
  assert.equal(expiredResult.discrepancyType, "expired_update");
  assert.equal(getSourceDiscrepancies(database)[0].type, "expired_update");
  database.close();
});

test("Marketplace expiry uses source revisions, hides at the exact boundary, and resets only after an applied edit", () => {
  const database = createDatabase(":memory:");
  const created = update({ updateId: 1, messageId: 41, date: 1787997600, title: "Expiry calculator" });
  ingestSourceUpdate(database, feedId, created, baseTime, secret);
  const expectedFirstExpiry = "2026-09-28T10:00:00.000Z";
  assert.equal(findListings(database, {}, new Set(), { now: new Date("2026-09-28T09:59:59.999Z") })[0].expiresAt, expectedFirstExpiry);
  assert.deepEqual(findListings(database, {}, new Set(), { now: new Date(expectedFirstExpiry) }), []);

  const firstLifecycle = database.prepare("SELECT expires_at AS expiresAt FROM marketplace_listing_lifecycle WHERE listing_id = ?").get(created.listing.id);
  assert.equal(ingestSourceUpdate(database, feedId, created, new Date("2026-09-28T10:00:00Z"), secret).status, "duplicate");
  assert.deepEqual(database.prepare("SELECT expires_at AS expiresAt FROM marketplace_listing_lifecycle WHERE listing_id = ?").get(created.listing.id), firstLifecycle);

  const editDate = Math.floor(new Date("2026-09-28T10:01:00Z").getTime() / 1000);
  const edited = update({ updateId: 2, messageId: 41, date: 1787997600, editDate, title: "Reactivated calculator", event: "edited_message" });
  assert.equal(ingestSourceUpdate(database, feedId, edited, new Date("2026-09-28T10:01:00Z"), secret).outcome, "applied");
  const visible = findListings(database, {}, new Set(), { now: new Date("2026-09-28T10:01:00Z") });
  assert.equal(visible[0].title, "Reactivated calculator");
  assert.equal(visible[0].sourceTime, "2026-09-28T10:01:00.000Z");
  assert.equal(visible[0].updatedAt, visible[0].sourceTime);
  assert.equal(visible[0].expiresAt, "2026-10-28T10:01:00.000Z");
  assert.equal(visible[0].attributionState, "withheld");
  database.close();
});

test("unparseable messages retain only safe candidates and require a validated Moderator correction", () => {
  const database = createDatabase(":memory:");
  const moderator = actor(database, "correction");
  const unparseable = update({
    updateId: 1,
    messageId: 51,
    authorId: "private-correction-author",
    date: 1787997600,
    text: "Title: Bicycle phone holder\nPrice: $12\nDescription: Secure mount. Contact seller@example.com or @private_username",
  });
  const result = ingestSourceUpdate(database, feedId, unparseable, baseTime, secret);
  assert.equal(result.discrepancyType, "unparseable_marketplace_message");
  assert.deepEqual(findListings(database), []);
  const [discrepancy] = getSourceDiscrepancies(database);
  assert.deepEqual(discrepancy.incoming.parseIssues, ["category_ambiguous"]);
  assert.equal(JSON.stringify(discrepancy).includes("seller@example.com"), false);
  assert.equal(JSON.stringify(discrepancy).includes("private_username"), false);
  assert.throws(() => resolveSourceDiscrepancy(database, moderator.id, discrepancy.id, "apply_source", "Publish without correction", baseTime), /required/);
  assert.throws(() => resolveSourceDiscrepancy(database, moderator.id, discrepancy.id, "apply_source", "Reject invalid correction", baseTime, {
    title: "Corrected holder", category: "Other", price: 12.5, description: "Description",
  }), /invalid/);

  resolveSourceDiscrepancy(database, moderator.id, discrepancy.id, "apply_source", "Corrected deterministic category and price", baseTime, {
    title: "Bicycle phone holder",
    category: "Transport",
    price: 12,
    description: "Secure handlebar mount.",
    id: "moderator-controlled-id",
    expiresAt: "2099-01-01T00:00:00Z",
  });
  const [listing] = findListings(database, {}, new Set(), { now: baseTime });
  assert.equal(listing.id, unparseable.listingDefaults.id);
  assert.equal(listing.category, "Transport");
  assert.equal(listing.expiresAt, "2026-09-28T10:00:00.000Z");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE event_type = 'source_discrepancy_corrected'").get().count, 1);
  database.close();
});

test("Operator and Moderator Source Feed APIs enforce roles and keep private identifiers out of public listings", async () => {
  const database = createDatabase(":memory:");
  replaySourceFixture(database, "marketplace-baseline", { identitySecret: secret });
  const operatorIdentity = { subject: "source-operator", email: "source-operator@example.nus.edu.sg" };
  const operator = completeLaunch(database, createLaunchAssertion(database, operatorIdentity, baseTime), baseTime, operatorIdentity.subject);
  const moderator = completeLaunch(database, createLaunchAssertion(database, { subject: "source-moderator", email: "source-moderator@example.nus.edu.sg" }, baseTime), baseTime);
  database.prepare("INSERT INTO privileged_roles (participant_id, role, granted_by_participant_id, granted_at) VALUES (?, 'moderator', ?, ?)")
    .run(moderator.participant.id, operator.participant.id, baseTime.toISOString());
  const api = request(createApp({ database, clock: createClock(baseTime), environment: "test", platformOperatorSubject: operatorIdentity.subject, sourceIdentitySecret: secret }));
  const operatorCookie = `univus_session=${operator.session.rawToken}`;
  const moderatorCookie = `univus_session=${moderator.session.rawToken}`;

  assert.equal((await api.get("/api/operator/source-feeds").set("Cookie", moderatorCookie)).status, 403);
  assert.equal((await api.get("/api/moderation/source-discrepancies").set("Cookie", operatorCookie)).status, 403);
  const gates = await api.patch(`/api/operator/source-feeds/${feedId}/gates`).set("Cookie", operatorCookie).send({
    permissionApproved: true,
    permissionEvidenceReference: "operator-permission-evidence",
    privacyApproved: true,
    privacyEvidenceReference: "operator-privacy-evidence",
    liveEnabled: true,
    reason: "Operator approved the demonstration feed gates",
  });
  assert.equal(gates.status, 200);
  assert.equal(gates.body.feed.liveEnabled, true);

  const consent = await api.post(`/api/moderation/source-feeds/${feedId}/author-consents`).set("Cookie", moderatorCookie).send({
    externalAuthorId: "fixture-author-lamp",
    scopes: ["display_name", "contact"],
    displayName: "Lamp Fixture Author",
    contactUrl: "https://t.me/lamp_fixture_unavailable",
    evidenceReference: "private-consent-evidence",
    reason: "Moderator recorded author consent evidence",
  });
  assert.equal(consent.status, 201);
  const publicListings = await api.get("/api/listings");
  const lamp = publicListings.body.listings.find(({ title }) => title === "Adjustable study lamp");
  assert.equal(lamp.authorDisplayName, "Lamp Fixture Author");
  assert.equal(lamp.contactUrl, "https://t.me/lamp_fixture_unavailable");
  assert.equal(lamp.attributionState, "name_and_contact");
  assert.equal(lamp.updatedAt, lamp.sourceTime);
  assert.equal(new Date(lamp.expiresAt) - new Date(lamp.sourceTime), 30 * 24 * 60 * 60 * 1000);
  assert.equal(JSON.stringify(publicListings.body).includes("private-consent-evidence"), false);
  assert.equal(JSON.stringify(publicListings.body).includes("authorKeyHash"), false);
  assert.equal(JSON.stringify(publicListings.body).includes("sourceUrl"), false);

  const staleLamp = update({ updateId: 3000, messageId: 504, authorId: "fixture-author-lamp", date: 1787991000, editDate: 1787991500, title: "Stale lamp title", category: "Room & Living", event: "edited_message" });
  ingestSourceUpdate(database, feedId, staleLamp, baseTime, secret);
  const queue = await api.get("/api/moderation/source-discrepancies").set("Cookie", moderatorCookie);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.discrepancies[0].type, "stale_revision");
  assert.equal(JSON.stringify(queue.body).includes("authorKeyHash"), false);
  const resolved = await api.post(`/api/moderation/source-discrepancies/${queue.body.discrepancies[0].id}/resolution`).set("Cookie", moderatorCookie).send({
    decision: "retain_current",
    reason: "Moderator retained the newer stored version",
  });
  assert.equal(resolved.status, 200);
  database.close();
});
