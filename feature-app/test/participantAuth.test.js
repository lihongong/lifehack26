import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion, resolveSession, sessionPayload } from "../backend/src/services/authService.js";
import { getGemAccount } from "../backend/src/services/gemService.js";
import { publicProfile, updateParticipantProfile } from "../backend/src/services/participantService.js";

const identity = { subject: "test-univus-001", email: "participant@example.nus.edu.sg" };
const firstVisit = new Date("2026-08-29T15:59:00Z");

test("launch is one-time, verifies participant, and awards once per Singapore day", () => {
  const database = createDatabase(":memory:");
  const token = createLaunchAssertion(database, identity, firstVisit);
  const { participant, session } = completeLaunch(database, token, firstVisit);
  assert.equal(participant.verification_state, "verified");
  assert.equal(getGemAccount(database, participant.id).balance, 5);
  assert.throws(() => completeLaunch(database, token, firstVisit), /invalid or expired/);
  resolveSession(database, session.rawToken, new Date("2026-08-29T15:59:30Z"));
  assert.equal(getGemAccount(database, participant.id).balance, 5);
  resolveSession(database, session.rawToken, new Date("2026-08-29T16:00:00Z"));
  assert.equal(getGemAccount(database, participant.id).balance, 10);
  assert.equal(getGemAccount(database, participant.id).entries.length, 2);
  database.close();
});

test("ledger is immutable and balance comes from ledger entries", () => {
  const database = createDatabase(":memory:");
  const { participant } = completeLaunch(database, createLaunchAssertion(database, identity, firstVisit), firstVisit);
  assert.throws(() => database.prepare("UPDATE gem_ledger SET amount = 500 WHERE participant_id = ?").run(participant.id), /immutable/);
  assert.throws(() => database.prepare("DELETE FROM gem_ledger WHERE participant_id = ?").run(participant.id), /immutable/);
  assert.equal(sessionPayload(database, participant).gemBalance, 5);
  database.close();
});

test("public profile exposes only public identity fields", () => {
  const database = createDatabase(":memory:");
  const { participant } = completeLaunch(database, createLaunchAssertion(database, identity, firstVisit), firstVisit);
  const updated = updateParticipantProfile(database, participant.id, { displayName: "Campus Bryan", nusZone: "medicine-kent-ridge" }, firstVisit);
  const visible = publicProfile(database, updated.public_id);
  assert.deepEqual(Object.keys(visible).sort(), ["avatar", "displayName", "publicId", "verificationState"].sort());
  assert.equal(JSON.stringify(visible).includes(identity.email), false);
  database.close();
});

test("display names are case-insensitively unique", () => {
  const database = createDatabase(":memory:");
  const first = completeLaunch(database, createLaunchAssertion(database, identity, firstVisit), firstVisit).participant;
  const secondIdentity = { subject: "test-univus-002", email: "second@example.nus.edu.sg" };
  const second = completeLaunch(database, createLaunchAssertion(database, secondIdentity, firstVisit), firstVisit).participant;
  updateParticipantProfile(database, first.id, { displayName: "Safe Name", nusZone: null }, firstVisit);
  assert.throws(() => updateParticipantProfile(database, second.id, { displayName: "safe name", nusZone: null }, firstVisit), /already taken/);
  database.close();
});
