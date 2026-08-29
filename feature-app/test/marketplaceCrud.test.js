import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import { createClock } from "../backend/src/services/clock.js";
import { replaySourceFixture } from "../backend/src/sourceFeeds/telegramFixtureAdapter.js";

const now = new Date("2026-08-30T10:00:00Z");
const operatorIdentity = { subject: "operator-subject", email: "operator@example.nus.edu.sg" };
const moderatorIdentity = { subject: "moderator-subject", email: "moderator@example.nus.edu.sg" };

function login(database, identity, platformOperatorSubject = "") {
  return completeLaunch(database, createLaunchAssertion(database, identity, now), now, platformOperatorSubject);
}

async function setup() {
  const database = createDatabase(":memory:");
  replaySourceFixture(database, "marketplace-baseline", { identitySecret: "fictional-source-fixture-secret" });
  const operator = login(database, operatorIdentity, operatorIdentity.subject);
  const moderator = login(database, moderatorIdentity);
  const participant = login(database, { subject: "participant-subject", email: "participant@example.nus.edu.sg" });
  const api = request(createApp({ database, clock: createClock(now), environment: "test", platformOperatorSubject: operatorIdentity.subject }));
  const cookie = (session) => `univus_session=${session.session.rawToken}`;
  const enrolled = await api.post("/api/operator/moderators").set("Cookie", cookie(operator)).send({
    email: moderatorIdentity.email,
    reason: "Trusted Marketplace operations volunteer",
  });
  assert.equal(enrolled.status, 201);
  return { api, database, operatorCookie: cookie(operator), moderatorCookie: cookie(moderator), participantCookie: cookie(participant) };
}

test("only a Moderator can create a validated manual Marketplace Listing and publish it", async () => {
  const { api, database, operatorCookie, moderatorCookie, participantCookie } = await setup();
  const listing = {
    title: "Desk fan",
    category: "Room & Living",
    price: 24,
    description: "Quiet USB desk fan in good working condition.",
    imageUrl: "https://images.example.test/desk-fan.jpg",
    imageAlt: "A compact white desk fan",
    reason: "Verified community submission",
  };

  assert.equal((await api.post("/api/moderation/marketplace").send(listing)).status, 401);
  assert.equal((await api.post("/api/moderation/marketplace").set("Cookie", participantCookie).send(listing)).status, 403);
  assert.equal((await api.post("/api/moderation/marketplace").set("Cookie", operatorCookie).send(listing)).status, 403);
  assert.equal((await api.post("/api/moderation/marketplace").set("Cookie", moderatorCookie).send({ ...listing, price: 24.5 })).status, 422);
  assert.equal((await api.post("/api/moderation/marketplace").set("Cookie", moderatorCookie).send({ ...listing, imageUrl: "http://images.example.test/desk-fan.jpg" })).status, 422);

  const created = await api.post("/api/moderation/marketplace").set("Cookie", moderatorCookie).send(listing);
  assert.equal(created.status, 201);
  assert.equal(created.body.listing.title, "Desk fan");
  assert.equal(created.body.listing.origin, "manual");
  const publicListings = await api.get("/api/listings");
  const publicListing = publicListings.body.listings.find(({ id }) => id === created.body.listing.id);
  assert.equal(publicListing.title, "Desk fan");
  assert.equal(publicListing.origin, "manual");
  assert.equal(publicListing.imageUrl, "https://images.example.test/desk-fan.jpg");
  assert.equal(publicListing.imageAlt, "A compact white desk fan");
  assert.equal("createdByParticipantId" in publicListing, false);

  const audit = await api.get("/api/operator/audit").set("Cookie", operatorCookie);
  assert.equal(audit.body.entries.find(({ targetId }) => targetId === created.body.listing.id).eventType, "marketplace_listing_created");
  database.close();
});

test("a Moderator can delete only a manual Marketplace Listing with an audited reason", async () => {
  const { api, database, operatorCookie, moderatorCookie, participantCookie } = await setup();
  const created = await api.post("/api/moderation/marketplace").set("Cookie", moderatorCookie).send({
    title: "Desk fan",
    category: "Room & Living",
    price: 24,
    description: "Quiet USB desk fan in good working condition.",
    reason: "Verified community submission",
  });
  const listingId = created.body.listing.id;

  assert.equal((await api.delete(`/api/moderation/marketplace/${listingId}`).send({ reason: "Unauthorized request" })).status, 401);
  assert.equal((await api.delete(`/api/moderation/marketplace/${listingId}`).set("Cookie", participantCookie).send({ reason: "Unauthorized request" })).status, 403);
  assert.equal((await api.delete(`/api/moderation/marketplace/${listingId}`).set("Cookie", operatorCookie).send({ reason: "Unauthorized request" })).status, 403);
  assert.equal((await api.delete(`/api/moderation/marketplace/${listingId}`).set("Cookie", moderatorCookie).send({ reason: "x" })).status, 422);
  const sourceListingId = (await api.get("/api/listings")).body.listings.find(({ origin }) => origin === "source_feed").id;
  assert.equal((await api.delete(`/api/moderation/marketplace/${sourceListingId}`).set("Cookie", moderatorCookie).send({ reason: "Must remain Source Feed governed" })).status, 404);
  const deleted = await api.delete(`/api/moderation/marketplace/${listingId}`).set("Cookie", moderatorCookie).send({ reason: "Item is no longer available" });
  assert.equal(deleted.status, 204);
  assert.equal((await api.get("/api/listings")).body.listings.some(({ id }) => id === listingId), false);
  assert.equal((await api.delete(`/api/moderation/marketplace/${listingId}`).set("Cookie", moderatorCookie).send({ reason: "Duplicate request" })).status, 404);

  const audit = await api.get("/api/operator/audit").set("Cookie", operatorCookie);
  const deletion = audit.body.entries.find(({ eventType }) => eventType === "marketplace_listing_deleted");
  assert.equal(deletion.targetId, listingId);
  assert.equal(deletion.reason, "Item is no longer available");
  database.close();
});
