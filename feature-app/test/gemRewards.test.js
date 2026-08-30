import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../backend/src/db/database.js";
import { createDemoBuffetPosts } from "../backend/src/data/demoBuffetPosts.js";
import { allBuffetPostStates, ingestBuffetPosts } from "../backend/src/services/buffetAlertService.js";
import { recordBuffetGoing, findBuffetPosts } from "../backend/src/services/buffetService.js";
import { createManualBuffetPost, deleteManualBuffetPost } from "../backend/src/services/manualBuffetService.js";
import { getGemAccount } from "../backend/src/services/gemService.js";
import { findListings } from "../backend/src/services/listingsService.js";
import { awardMarketplaceContact } from "../backend/src/services/marketplaceRewardService.js";
import {
  replayDemoSoldReply,
  replaySourceFixture,
  seedDemoMarketplaceConsents,
  seedDemoMarketplaceRewards,
} from "../backend/src/sourceFeeds/telegramFixtureAdapter.js";

const secret = "fictional-source-fixture-secret";
const now = new Date("2026-08-30T04:00:00.000Z");

function participant(database, id, subject = `${id}-subject`) {
  database.prepare(`
    INSERT INTO participants (id, public_id, provider, external_subject, email, display_name, display_name_key,
      nus_zone, verification_state, created_at, updated_at)
    VALUES (?, ?, 'test', ?, ?, ?, ?, 'central', 'verified', ?, ?)
  `).run(id, id, subject, `${id}@example.invalid`, id, id, now.toISOString(), now.toISOString());
  return { participant_id: id, external_subject: subject };
}

test("Buffet rewards are exact-once, capped at three daily, and demo posts stay available", () => {
  const database = createDatabase(":memory:");
  try {
    participant(database, "buffet-participant");
    const posts = createDemoBuffetPosts(now);
    ingestBuffetPosts(database, posts, now);
    const references = new Map(database.prepare(`
      SELECT bp.source_post_id AS sourcePostId, ref.public_id AS referenceId
      FROM buffet_posts bp JOIN buffet_post_refs ref ON ref.id = bp.id
    `).all().map(({ sourcePostId, referenceId }) => [sourcePostId, referenceId]));
    const nextDay = new Date("2026-08-31T04:00:00.000Z");
    assert.equal(findBuffetPosts(posts, {}, nextDay).length, posts.length);
    for (const post of posts.slice(0, 3)) assert.equal(recordBuffetGoing(database, "buffet-participant", references.get(post.id), now).reward.amount, 2);
    assert.equal(recordBuffetGoing(database, "buffet-participant", references.get(posts[0].id), now).reward.status, "already_collected");
    assert.equal(recordBuffetGoing(database, "buffet-participant", references.get(posts[3].id), now).reward.status, "daily_limit_reached");
    assert.equal(getGemAccount(database, "buffet-participant").balance, 6);
  } finally { database.close(); }
});

test("Buffet Gem identity distinguishes duplicate source ids across feeds and a manual post", () => {
  const database = createDatabase(":memory:");
  try {
    const actor = participant(database, "buffet-collision");
    const shared = { ...createDemoBuffetPosts(now)[0], id: "shared-post" };
    ingestBuffetPosts(database, [shared], now, "feed-one");
    ingestBuffetPosts(database, [shared], now, "feed-two");
    const manual = createManualBuffetPost(database, actor, {
      title: "Manual shared buffet",
      description: "Manual food remains available for collection.",
      reportedLocation: "CLB foyer",
      zoneId: "central",
      collectionDeadline: "2026-08-30T06:00:00.000Z",
      reason: "Verified manual publication",
    }, now);
    const sourceReferences = database.prepare(`
      SELECT ref.public_id AS referenceId FROM buffet_posts bp
      JOIN buffet_post_refs ref ON ref.id = bp.id
      WHERE bp.source_post_id = 'shared-post' ORDER BY bp.source_feed_id
    `).all().map(({ referenceId }) => referenceId);
    assert.equal(new Set([...sourceReferences, manual.referenceId]).size, 3);
    for (const referenceId of [...sourceReferences, manual.referenceId]) {
      assert.equal(recordBuffetGoing(database, actor.participant_id, referenceId, now).reward.amount, 2);
    }
    assert.equal(database.prepare("SELECT COUNT(DISTINCT source_id) AS count FROM gem_ledger WHERE participant_id = ? AND reason = 'BUFFET_GOING'").get(actor.participant_id).count, 3);
    const firstInternalId = database.prepare("SELECT id FROM buffet_posts WHERE source_feed_id = 'feed-one' AND source_post_id = 'shared-post'").get().id;
    database.prepare("UPDATE buffet_post_states SET state = 'confirmed_expired' WHERE buffet_post_id = ?").run(firstInternalId);
    const states = allBuffetPostStates(database);
    assert.equal(states.get(sourceReferences[0]), "confirmed_expired");
    assert.equal(states.get(sourceReferences[1]), "active");
    assert.equal(states.get(manual.referenceId), "active");
  } finally { database.close(); }
});

test("a committed manual deletion fences a Gem award from another connection", () => {
  const directory = mkdtempSync(join(tmpdir(), "buffet-gem-fence-"));
  const path = join(directory, "fence.sqlite");
  const awardConnection = createDatabase(path);
  const deletionConnection = createDatabase(path);
  try {
    const actor = participant(awardConnection, "buffet-fence");
    const manual = createManualBuffetPost(awardConnection, actor, {
      title: "Fenced manual buffet",
      description: "This collection will be deleted before the award.",
      reportedLocation: "CLB foyer",
      zoneId: "central",
      collectionDeadline: "2026-08-30T06:00:00.000Z",
      reason: "Verified before deletion",
    }, now);
    deleteManualBuffetPost(deletionConnection, actor, manual.id, "Collection cancelled", now);
    assert.throws(() => recordBuffetGoing(awardConnection, actor.participant_id, manual.referenceId, now), /no longer available/);
    assert.equal(awardConnection.prepare("SELECT COUNT(*) AS count FROM gem_ledger WHERE participant_id = ? AND reason = 'BUFFET_GOING'").get(actor.participant_id).count, 0);
  } finally {
    deletionConnection.close();
    awardConnection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the demo sold adapter awards buyer and seller once and removes the listing", () => {
  const database = createDatabase(":memory:");
  try {
    replaySourceFixture(database, "marketplace-baseline", { identitySecret: secret });
    seedDemoMarketplaceConsents(database, secret);
    seedDemoMarketplaceRewards(database, secret);
    const seller = participant(database, "demo-seller", "mock-univus-bryan-001");
    const listing = findListings(database, { query: "mechanical keyboard" }, new Set(), {
      now, viewer: seller, identitySecret: secret, demoSoldEnabled: true,
    })[0];
    assert.equal(listing.demoSoldActionAvailable, true);
    const result = replayDemoSoldReply(database, listing.id, seller, now, secret);
    assert.equal(result.sellerReward.amount, 30);
    assert.equal(result.buyerReward.amount, 30);
    assert.equal(getGemAccount(database, seller.participant_id).balance, 30);
    assert.equal(findListings(database, { query: "mechanical keyboard" }, new Set(), { now }).length, 0);
    assert.throws(() => replayDemoSoldReply(database, listing.id, seller, now, secret), /already sold/);
  } finally { database.close(); }
});

test("Marketplace contacts award 1 Gem once per listing and cap at three daily", () => {
  const database = createDatabase(":memory:");
  try {
    const shopper = participant(database, "marketplace-shopper");
    replaySourceFixture(database, "marketplace-baseline", { identitySecret: secret });
    seedDemoMarketplaceConsents(database, secret);
    const listings = findListings(database, {}, new Set(), { now, includeInternal: true }).filter(({ contactUrl }) => contactUrl);
    const first = awardMarketplaceContact(database, shopper.participant_id, listings[0], now);
    assert.equal(first.reward.amount, 1);
    assert.equal(awardMarketplaceContact(database, shopper.participant_id, listings[0], now).reward.status, "already_collected");
    for (const listing of listings.slice(1, 3)) awardMarketplaceContact(database, shopper.participant_id, listing, now);
    assert.equal(awardMarketplaceContact(database, shopper.participant_id, { id: "fourth-contact", contactUrl: "https://example.invalid" }, now).reward.status, "daily_limit_reached");
    assert.equal(getGemAccount(database, shopper.participant_id).balance, 3);
  } finally { database.close(); }
});
