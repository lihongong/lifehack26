import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../backend/src/db/database.js";
import { createDemoBuffetPosts } from "../backend/src/data/demoBuffetPosts.js";
import { ingestBuffetPosts } from "../backend/src/services/buffetAlertService.js";
import { recordBuffetGoing, findBuffetPosts } from "../backend/src/services/buffetService.js";
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
    const nextDay = new Date("2026-08-31T04:00:00.000Z");
    assert.equal(findBuffetPosts(posts, {}, nextDay).length, posts.length);
    for (const post of posts.slice(0, 3)) assert.equal(recordBuffetGoing(database, "buffet-participant", post.id, now).reward.amount, 2);
    assert.equal(recordBuffetGoing(database, "buffet-participant", posts[0].id, now).reward.status, "already_collected");
    assert.equal(recordBuffetGoing(database, "buffet-participant", posts[3].id, now).reward.status, "daily_limit_reached");
    assert.equal(getGemAccount(database, "buffet-participant").balance, 6);
  } finally { database.close(); }
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
