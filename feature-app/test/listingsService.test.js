import test from "node:test";
import assert from "node:assert/strict";
import { findListings } from "../backend/src/services/listingsService.js";
import { createDatabase } from "../backend/src/db/database.js";
import { replaySourceFixture } from "../backend/src/sourceFeeds/telegramFixtureAdapter.js";

function withListings(run) {
  const database = createDatabase(":memory:");
  replaySourceFixture(database, "marketplace-baseline", { identitySecret: "fictional-source-fixture-secret" });
  try { return run(database); } finally { database.close(); }
}

test("all replayed fixtures are fictional and include safe public provenance and expiry", () => withListings((database) =>
  assert.ok(findListings(database).every((item) =>
    item.fictional && item.origin === "source_feed" && item.source && item.sourceTime && item.updatedAt === item.sourceTime && item.expiresAt &&
    item.attributionState === "withheld" && item.imageUrl && item.imageAlt && !("sourceUrl" in item) && !("expiryBasis" in item),
  )),
));
test("search is case-insensitive across listing fields", () => withListings((database) => {
  assert.equal(findListings(database, { query: "CALCULATOR" }).length, 1);
  assert.equal(findListings(database, { query: "transport" }).length, 1);
}));
test("category and sorting filters are deterministic", () => withListings((database) => {
  assert.equal(findListings(database, { category: "Study" }).length, 1);
  assert.deepEqual(
    findListings(database, { sort: "price" }).map(({ price }) => price),
    [12, 18, 75, 120],
  );
}));
test("unknown filters safely use public defaults", () => withListings((database) =>
  assert.equal(findListings(database, { category: "Unknown", sort: "unknown" }).length, 4)));
test("no-match searches return an empty result", () => withListings((database) =>
  assert.deepEqual(findListings(database, { query: "does-not-exist" }), [])));
test("internal source identity is never returned publicly", () => withListings((database) =>
  assert.ok(findListings(database).every((listing) => !("authorKeyHash" in listing) && !("externalAuthorId" in listing)))));
