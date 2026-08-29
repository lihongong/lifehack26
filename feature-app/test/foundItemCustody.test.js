import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import { createClock } from "../backend/src/services/clock.js";
import { createLostItemCipher, DEMO_LOST_ITEM_PRIVATE_DATA_KEY } from "../backend/src/services/lostItemCrypto.js";
import { updateParticipantProfile } from "../backend/src/services/participantService.js";
import { acceptActivePolicies, getActivePolicies } from "../backend/src/services/policyService.js";

const sharp = createRequire(new URL("../backend/package.json", import.meta.url))("sharp");
const now = new Date("2026-08-30T10:00:00.000Z");

function createParticipant(database, subject, displayName, role = null) {
  const launched = completeLaunch(database, createLaunchAssertion(database, { subject, email: `${subject}@example.nus.edu.sg` }, now), now);
  updateParticipantProfile(database, launched.participant.id, { displayName, nusZone: "Kent Ridge" }, now);
  if (role) database.prepare("INSERT INTO privileged_roles (participant_id,role,granted_by_participant_id,granted_at) VALUES (?,?,?,?)").run(launched.participant.id, role, launched.participant.id, now.toISOString());
  return { ...launched, cookie: `univus_session=${launched.session.rawToken}` };
}

function acceptPolicies(database, id) {
  acceptActivePolicies(database, id, getActivePolicies(database, id).map(({ id: policyId }) => policyId), now);
}

async function image() {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: "#456789" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
}

const reportInput = {
  category: "Bags", foundDate: "2026-08-29", nusZoneId: "utown",
  description: "ORIGINAL-FOUND-CANARY navy bag found beside a study table.",
  privateIdentifyingDetails: "PRIVATE-FOUND-CANARY unique lining and ownership marker.",
};

async function createApprovedReport(api, authorCookie, moderatorCookie, suffix = "") {
  const created = await api.post("/api/found-item-reports").set("Cookie", authorCookie).field({ ...reportInput, description: `${reportInput.description} ${suffix}`.trim() });
  assert.equal(created.status, 201);
  const report = created.body.report;
  const reviewed = await api.post(`/api/moderation/found-item-reports/${report.id}/review`).set("Cookie", moderatorCookie).send({
    revision: report.revision, decision: "approve", category: report.category, foundDate: report.foundDate,
    nusZoneId: report.nusZone.id, publicDescription: `Sanitized navy bag found in UTown ${suffix}`.trim(),
    approvedPhotoIds: [], reason: "Safe public candidate approved for handover.",
  });
  assert.equal(reviewed.status, 200);
  return report.id;
}

test("report submission awards exactly 20 Gems before physical custody", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "found-author", "Finder Fiona");
  const moderator = createParticipant(database, "found-moderator", "Custody Morgan", "moderator");
  const operator = createParticipant(database, "found-operator", "Operator Olive", "platform_operator");
  const commenter = createParticipant(database, "found-commenter", "Comment Rowan");
  acceptPolicies(database, author.participant.id); acceptPolicies(database, commenter.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));
  const photo = await image();
  try {
    const created = await api.post("/api/found-item-reports").set("Cookie", author.cookie).field(reportInput)
      .attach("photos", photo, { filename: "FOUND-FILENAME-CANARY.jpg", contentType: "image/jpeg" });
    assert.equal(created.status, 201);
    assert.equal(created.body.report.reward.amount, 20);
    const reportId = created.body.report.id;
    const photoId = created.body.report.photos[0].id;
    assert.equal((await api.get("/api/found-item-reports")).body.reports.length, 0);
    assert.equal(database.prepare("SELECT ciphertext FROM found_item_report_private_payloads WHERE report_id=?").get(reportId).ciphertext.toString("utf8").includes("PRIVATE-FOUND-CANARY"), false);

    const location = await api.post("/api/operator/custody-locations").set("Cookie", operator.cookie).send({ name: "Central secure desk", nusZoneId: "central", defaultInstructions: "Present the private reference at the service desk.", reason: "Create a staffed custody point." });
    assert.equal(location.status, 201);
    const blocked = await api.post(`/api/moderation/found-item-reports/${reportId}/appointments`).set("Cookie", moderator.cookie).send({ revision: 1, locationId: location.body.location.id, appointmentAt: "2026-08-31T10:00:00Z", reason: "Arrange handover." });
    assert.equal(blocked.status, 409);
    const settings = (await api.get("/api/operator/custody-settings").set("Cookie", operator.cookie)).body.settings;
    assert.equal((await api.patch("/api/operator/custody-settings").set("Cookie", operator.cookie).send({ revision: settings.revision, procedureApproved: true, procedureEvidenceReference: "custody-procedure-v1", custodyEnabled: true, reason: "Approved staffed custody procedure." })).status, 200);

    const review = await api.post(`/api/moderation/found-item-reports/${reportId}/review`).set("Cookie", moderator.cookie).send({
      revision: 1, decision: "approve", category: "Bags", foundDate: "2026-08-29", nusZoneId: "utown",
      publicDescription: "Navy bag found beside a study table in UTown.", approvedPhotoIds: [photoId], reason: "Sanitized text and photo approved.",
    });
    assert.equal(review.status, 200);
    const publicApproved = await api.get("/api/found-item-reports");
    assert.equal(publicApproved.body.reports.length, 1);
    const serialized = JSON.stringify(publicApproved.body);
    for (const canary of ["ORIGINAL-FOUND-CANARY", "PRIVATE-FOUND-CANARY", "FOUND-FILENAME-CANARY", "Finder Fiona", "custody-procedure-v1", "Central secure desk"]) assert.equal(serialized.includes(canary), false);

    const comment = await api.post(`/api/found-item-reports/${reportId}/comments`).set("Cookie", commenter.cookie).send({ body: "I saw this near the UTown entrance." });
    assert.equal(comment.status, 201);
    const contentReport = await api.post("/api/content-reports").set("Cookie", commenter.cookie).send({ targetType: "found_item_report", targetId: reportId, category: "staleness" });
    assert.equal(contentReport.status, 201);

    const arranged = await api.post(`/api/moderation/found-item-reports/${reportId}/appointments`).set("Cookie", moderator.cookie).send({ revision: 1, locationId: location.body.location.id, appointmentAt: "2026-08-31T10:00:00Z", instructions: "Ask for Custodian Morgan.", reason: "Coordinate a private physical handover." });
    assert.equal(arranged.status, 201);
    const publicArranged = JSON.stringify((await api.get("/api/found-item-reports")).body);
    assert.equal(publicArranged.includes("Central secure desk"), false);
    assert.equal(publicArranged.includes("Custodian Morgan"), false);
    const privateReport = (await api.get("/api/me/found-item-reports").set("Cookie", author.cookie)).body.reports[0];
    assert.equal(privateReport.appointment.custodyLocation.name, "Central secure desk");

    const intake = await api.post(`/api/moderation/found-item-reports/${reportId}/intake`).set("Cookie", moderator.cookie).send({
      revision: 2, condition: "fair", conditionNotes: "CONDITION-CANARY minor scuff on one corner.",
      category: "Bags", foundDate: "2026-08-29", nusZoneId: "utown",
      publicDescription: "Navy bag received into custody after being found in UTown.", approvedPhotoIds: [photoId],
      reason: "Physical property inspected and accepted by the Custodian.",
    });
    assert.equal(intake.status, 201);
    const foundItemId = intake.body.foundItem.id;
    assert.equal((await api.get("/api/found-item-reports")).body.reports.length, 0);
    const items = await api.get("/api/found-items");
    assert.equal(items.body.items.length, 1);
    assert.equal(items.body.items[0].condition, "fair");
    assert.equal(JSON.stringify(items.body).includes("CONDITION-CANARY"), false);
    const carried = await api.get(`/api/found-items/${foundItemId}/comments`);
    assert.equal(carried.body.comments[0].body, "I saw this near the UTown entrance.");
    const migratedReport = database.prepare("SELECT target_type,target_id,target_post_id,evidence_text FROM content_reports WHERE id=?").get(contentReport.body.report.id);
    assert.equal(migratedReport.target_type, "found_item"); assert.equal(migratedReport.target_id, foundItemId); assert.equal(migratedReport.target_post_id, foundItemId);
    assert.equal(migratedReport.evidence_text.includes("PRIVATE-FOUND-CANARY"), false);

    const rewards = database.prepare("SELECT * FROM gem_ledger WHERE reason='FOUND_ITEM_REPORT' AND source_id=?").all(reportId);
    assert.equal(rewards.length, 1); assert.equal(rewards[0].amount, 20);
    assert.equal((await api.post(`/api/moderation/found-item-reports/${reportId}/intake`).set("Cookie", moderator.cookie).send({ revision: 2 })).status, 409);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM found_items WHERE report_id=?").get(reportId).count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM gem_ledger WHERE source_id=?").get(reportId).count, 1);
    const evidence = database.prepare("SELECT * FROM found_item_private_evidence WHERE found_item_id=?").get(foundItemId);
    assert.equal(evidence.ciphertext.toString("utf8").includes("CONDITION-CANARY"), false);
    assert.throws(() => database.prepare("UPDATE found_items SET condition='good' WHERE id=?").run(foundItemId), /immutable/);
  } finally { database.close(); }
});

test("withdrawn and typed-closed reports do not add rewards beyond submission", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "found-terminal-author", "Terminal Finder");
  const moderator = createParticipant(database, "found-terminal-mod", "Terminal Custodian", "moderator");
  acceptPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));
  try {
    const withdrawn = await api.post("/api/found-item-reports").set("Cookie", author.cookie).field(reportInput);
    assert.equal((await api.post(`/api/me/found-item-reports/${withdrawn.body.report.id}/withdraw`).set("Cookie", author.cookie)).status, 204);
    const approvedId = await createApprovedReport(api, author.cookie, moderator.cookie, "for closure");
    const closed = await api.post(`/api/moderation/found-item-reports/${approvedId}/close`).set("Cookie", moderator.cookie).send({ revision: 1, outcome: "abandoned", reason: "Reporter stopped responding before handover." });
    assert.equal(closed.status, 200);
    const pending = await api.post("/api/found-item-reports").set("Cookie", author.cookie).field({ ...reportInput, description: `${reportInput.description} pending close` });
    assert.equal((await api.post(`/api/moderation/found-item-reports/${pending.body.report.id}/close`).set("Cookie", moderator.cookie).send({ revision: 1, outcome: "abandoned", reason: "Invalid abandoned attempt." })).status, 409);
    assert.equal((await api.post(`/api/moderation/found-item-reports/${pending.body.report.id}/close`).set("Cookie", moderator.cookie).send({ revision: 1, outcome: "otherwise_closed", reason: "Duplicate report closed before review." })).status, 200);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM found_items").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM gem_ledger WHERE reason='FOUND_ITEM_REPORT'").get().count, 3);
  } finally { database.close(); }
});

test("multiple report submissions on one Singapore day each earn one reward", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "found-multi-author", "Multiple Finder");
  const moderator = createParticipant(database, "found-multi-mod", "Multiple Custodian", "moderator");
  const operator = createParticipant(database, "found-multi-op", "Multiple Operator", "platform_operator");
  acceptPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));
  try {
    const location = (await api.post("/api/operator/custody-locations").set("Cookie", operator.cookie).send({ name: "Multi intake desk", nusZoneId: "central", defaultInstructions: "Present report reference.", reason: "Configure test custody." })).body.location;
    const settings = (await api.get("/api/operator/custody-settings").set("Cookie", operator.cookie)).body.settings;
    await api.patch("/api/operator/custody-settings").set("Cookie", operator.cookie).send({ revision: settings.revision, procedureApproved: true, procedureEvidenceReference: "multi-procedure", custodyEnabled: true, reason: "Enable verified intake." });
    for (const suffix of ["one", "two"]) {
      const reportId = await createApprovedReport(api, author.cookie, moderator.cookie, suffix);
      await api.post(`/api/moderation/found-item-reports/${reportId}/appointments`).set("Cookie", moderator.cookie).send({ revision: 1, locationId: location.id, appointmentAt: "2026-09-01T10:00:00Z", reason: "Arrange intake." });
      const result = await api.post(`/api/moderation/found-item-reports/${reportId}/intake`).set("Cookie", moderator.cookie).send({ revision: 2, condition: "good", conditionNotes: `Condition notes ${suffix}`, category: "Bags", foundDate: "2026-08-29", nusZoneId: "utown", publicDescription: `Sanitized found bag ${suffix} received into custody.`, approvedPhotoIds: [], reason: "Physical intake verified." });
      assert.equal(result.status, 201);
    }
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM gem_ledger WHERE reason='FOUND_ITEM_REPORT'").get().count, 2);
    assert.equal(database.prepare("SELECT SUM(amount) AS amount FROM gem_ledger WHERE reason='FOUND_ITEM_REPORT'").get().amount, 40);
  } finally { database.close(); }
});

test("custody gates fail closed and location changes preserve appointment snapshots", async () => {
  const database = createDatabase(":memory:");
  const author = createParticipant(database, "found-gate-author", "Gate Finder");
  const moderator = createParticipant(database, "found-gate-mod", "Gate Custodian", "moderator");
  const operator = createParticipant(database, "found-gate-op", "Gate Operator", "platform_operator");
  acceptPolicies(database, author.participant.id);
  const api = request(createApp({ database, clock: createClock(now), environment: "test" }));
  try {
    const location = (await api.post("/api/operator/custody-locations").set("Cookie", operator.cookie).send({
      name: "Original custody desk", nusZoneId: "central", defaultInstructions: "Use the original private instructions.", reason: "Create custody location.",
    })).body.location;
    let settings = (await api.get("/api/operator/custody-settings").set("Cookie", operator.cookie)).body.settings;
    assert.equal((await api.patch("/api/operator/custody-settings").set("Cookie", operator.cookie).send({
      revision: settings.revision, procedureApproved: true, procedureEvidenceReference: "procedure-gate-evidence",
      custodyEnabled: true, reason: "Enable custody after approval and location setup.",
    })).status, 200);

    const reportId = await createApprovedReport(api, author.cookie, moderator.cookie, "gate snapshot");
    assert.equal((await api.post(`/api/moderation/found-item-reports/${reportId}/appointments`).set("Cookie", moderator.cookie).send({
      revision: 1, locationId: location.id, appointmentAt: "2026-09-01T10:00:00Z",
      instructions: "Original participant instruction.", reason: "Arrange the first handover.",
    })).status, 201);

    const renamed = await api.patch(`/api/operator/custody-locations/${location.id}`).set("Cookie", operator.cookie).send({
      revision: location.revision, name: "Renamed custody desk", defaultInstructions: "Use replacement instructions.", reason: "Update future appointments only.",
    });
    assert.equal(renamed.status, 200);
    const privateReport = (await api.get("/api/me/found-item-reports").set("Cookie", author.cookie)).body.reports.find(({ id }) => id === reportId);
    assert.equal(privateReport.appointment.custodyLocation.name, "Original custody desk");
    assert.match(privateReport.appointment.instructions, /original private instructions/i);
    assert.throws(() => database.prepare("UPDATE found_item_handover_appointments SET location_name_snapshot='Changed' WHERE report_id=?").run(reportId), /immutable/);

    const deactivated = await api.patch(`/api/operator/custody-locations/${location.id}`).set("Cookie", operator.cookie).send({
      revision: renamed.body.location.revision, active: false, reason: "Temporarily close the final custody point.",
    });
    assert.equal(deactivated.status, 200);
    settings = (await api.get("/api/operator/custody-settings").set("Cookie", operator.cookie)).body.settings;
    assert.equal(settings.custodyEnabled, false);
    assert.equal(settings.ready, false);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE event_type='custody_settings_auto_disabled'").get().count, 1);
    assert.equal((await api.post(`/api/moderation/found-item-reports/${reportId}/intake`).set("Cookie", moderator.cookie).send({ revision: 2 })).status, 409);

    const reactivated = await api.patch(`/api/operator/custody-locations/${location.id}`).set("Cookie", operator.cookie).send({
      revision: deactivated.body.location.revision, active: true, reason: "Reopen the staffed custody point.",
    });
    assert.equal(reactivated.status, 200);
    assert.equal((await api.patch("/api/operator/custody-settings").set("Cookie", operator.cookie).send({
      revision: settings.revision, custodyEnabled: true, reason: "Re-enable custody after reopening the location.",
    })).status, 200);
    settings = (await api.get("/api/operator/custody-settings").set("Cookie", operator.cookie)).body.settings;
    const revoked = await api.patch("/api/operator/custody-settings").set("Cookie", operator.cookie).send({
      revision: settings.revision, procedureApproved: false, custodyEnabled: true, reason: "Revoke the custody procedure approval.",
    });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.settings.procedureApproved, false);
    assert.equal(revoked.body.settings.custodyEnabled, false);
  } finally { database.close(); }
});
