import test from "node:test";
import assert from "node:assert/strict";
import { demoListings } from "../backend/src/data/demoListings.js";
import { findListings } from "../backend/src/services/listingsService.js";

test("all fixtures are fictional and include provenance", () =>
  assert.ok(
    demoListings.every(
      (item) =>
        item.fictional &&
        item.source &&
        item.sourceUrl &&
        item.updatedAt &&
        item.imageUrl &&
        item.imageAlt &&
        item.contacts?.whatsapp &&
        item.contacts?.telegram &&
        ["whatsapp", "telegram"].includes(item.preferredContact),
    ),
  ));
test("search is case-insensitive across listing fields", () => {
  assert.equal(findListings({ query: "CALCULATOR" }).length, 1);
  assert.equal(findListings({ query: "transport" }).length, 1);
});
test("category and sorting filters are deterministic", () => {
  assert.equal(findListings({ category: "Study" }).length, 1);
  assert.deepEqual(
    findListings({ sort: "price" }).map(({ price }) => price),
    [12, 18, 75, 120],
  );
});
test("unknown filters safely use public defaults", () =>
  assert.equal(findListings({ category: "Unknown", sort: "unknown" }).length, demoListings.length));
test("no-match searches return an empty result", () =>
  assert.deepEqual(findListings({ query: "does-not-exist" }), []));
