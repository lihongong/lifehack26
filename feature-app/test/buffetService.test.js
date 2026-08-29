import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { createDemoBuffetPosts } from "../backend/src/data/demoBuffetPosts.js";
import { adjacentZoneIds, nusZones, resolveZoneAlias, zoneEdges, ZONE_GRAPH_VERSION } from "../backend/src/data/nusZones.js";
import { findBuffetPosts } from "../backend/src/services/buffetService.js";
import { createClock } from "../backend/src/services/clock.js";

const anchor = new Date("2026-08-30T04:00:00Z");
const posts = createDemoBuffetPosts(anchor);

test("versioned NUS Zones contain approved aliases and a valid undirected graph", () => {
  assert.equal(ZONE_GRAPH_VERSION, "nus-zones-v1");
  assert.equal(nusZones.length, 10);
  const approved = { SRC: "Museum/UCC", ERC: "UTown", YIH: "Central", CLB: "Central", AS5: "FASS", BIZ2: "Business", COM2: "Computing", COM3: "Computing", PGP: "PGP", LT27: "Science", S17: "Science" };
  for (const [alias, zone] of Object.entries(approved)) assert.equal(resolveZoneAlias(alias)?.name, zone);
  assert.equal(new Set(nusZones.flatMap(({ aliases }) => aliases.map((alias) => alias.toLowerCase()))).size, nusZones.flatMap(({ aliases }) => aliases).length);
  for (const [left, right] of zoneEdges) {
    assert.ok(nusZones.some(({ id }) => id === left));
    assert.ok(nusZones.some(({ id }) => id === right));
    assert.ok(adjacentZoneIds(left).includes(right));
    assert.ok(adjacentZoneIds(right).includes(left));
  }
});

test("search, exact zones, unclear locations, and freshness filters are deterministic", () => {
  assert.equal(findBuffetPosts(posts, {}, anchor).length, 6);
  assert.deepEqual(findBuffetPosts(posts, { freshness: "30" }, anchor).map(({ id }) => id).sort(), ["science-bentos", "unclear-snacks", "utown-pastries"]);
  assert.equal(findBuffetPosts(posts, { freshness: "60" }, anchor).length, 4);
  assert.deepEqual(findBuffetPosts(posts, { zone: "science" }, anchor).map(({ id }) => id), ["science-bentos"]);
  assert.deepEqual(findBuffetPosts(posts, { zone: "unclear" }, anchor).map(({ id }) => id), ["unclear-snacks"]);
  assert.deepEqual(findBuffetPosts(posts, { query: "vegetarian" }, anchor).map(({ id }) => id), ["science-bentos"]);
  assert.deepEqual(findBuffetPosts(posts, { query: "LT27" }, anchor).map(({ id }) => id), ["science-bentos"]);
});

test("fictional demo posts persist while real posts expire at the boundary", () => {
  assert.equal(findBuffetPosts(posts, {}, new Date("2026-08-31T04:00:00Z")).length, 6);
  assert.ok(findBuffetPosts(posts, {}, anchor).every(({ expiryBasis }) => expiryBasis === "demo"));
  const active = findBuffetPosts(posts.map((post) => ({ ...post, fictional: false })), {}, anchor);
  const fallback = active.find(({ id }) => id === "science-bentos");
  assert.equal(fallback.expiryBasis, "fallback");
  assert.equal(fallback.expiresAt, "2026-08-30T05:35:00.000Z");
  assert.equal(active.find(({ id }) => id === "utown-pastries").expiryBasis, "stated");
  const atDeadline = findBuffetPosts(posts.map((post) => ({ ...post, fictional: false })), {}, new Date("2026-08-30T04:50:00Z"));
  assert.equal(atDeadline.some(({ id }) => id === "utown-pastries"), false);
  assert.equal(active.some(({ id }) => id === "expired-tea"), false);
});

test("anonymous Buffet API returns safe defaults and versioned metadata", async () => {
  const database = createDatabase(":memory:");
  const api = request(createApp({ database, clock: createClock(anchor), environment: "test", buffetPosts: posts }));
  const response = await api.get("/api/buffets?zone=unknown&freshness=unknown");
  assert.equal(response.status, 200);
  assert.equal(response.body.posts.length, 6);
  assert.equal(response.body.zones.length, 10);
  assert.equal(response.body.zoneGraphVersion, ZONE_GRAPH_VERSION);
  assert.equal(response.body.serverNow, anchor.toISOString());
  database.close();
});
