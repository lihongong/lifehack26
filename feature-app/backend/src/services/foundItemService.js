import { randomUUID } from "node:crypto";
import { nusZones } from "../data/nusZones.js";
import { withImmediateTransaction } from "../db/database.js";
import { LOST_ITEM_CATEGORIES } from "./lostItemService.js";
import { awardFoundItemHandover } from "./gemService.js";
import { recordAudit, validateReason } from "./privilegeService.js";

const categories = new Set(LOST_ITEM_CATEGORIES);
const zones = new Map(nusZones.map((zone) => [zone.id, zone]));
const statuses = new Set(["pending_review", "rejected", "approved", "handover_arranged", "withdrawn", "closed", "received"]);
const conditions = new Set(["good", "fair", "damaged", "unknown"]);

function fail(message, status = 422, code) {
  throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function text(value, label, minimum, maximum) {
  const result = String(value ?? "").normalize("NFKC").trim();
  if (result.length < minimum || result.length > maximum) fail(`${label} must be ${minimum}-${maximum} characters.`);
  return result;
}

function singaporeDate(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function calendarDate(value, now, label = "Found date") {
  const result = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(new Date(`${result}T00:00:00Z`).getTime()) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) fail(`${label} must use YYYY-MM-DD.`);
  if (result > singaporeDate(now)) fail(`${label} cannot be in the future.`);
  return result;
}

function publicDescription(value) {
  const result = text(value, "Public description", 10, 1200);
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(result)
    || /(?:^|\D)\+?\d(?:[\s().-]*\d){7,14}(?:\D|$)/.test(result)
    || /(?:https?:\/\/|www\.)\S+/i.test(result)
    || /@[a-z0-9_]{4,}/i.test(result)) fail("Public description must not contain contact details.");
  return result;
}

function structured(input, now, descriptionKey = "description") {
  const category = String(input?.category || "");
  const nusZoneId = String(input?.nusZoneId || "");
  if (!categories.has(category)) fail("Found-Item category is invalid.");
  if (!zones.has(nusZoneId)) fail("NUS Zone is invalid.");
  return {
    category,
    foundDate: calendarDate(input?.foundDate, now),
    nusZoneId,
    description: descriptionKey === "publicDescription"
      ? publicDescription(input?.publicDescription)
      : text(input?.[descriptionKey], "Original candidate description", 10, 2000),
  };
}

function submission(input, now) {
  return {
    ...structured(input, now),
    privateIdentifyingDetails: text(input?.privateIdentifyingDetails, "Private Identifying Details", 3, 2000),
  };
}

const privateAad = (reportId, revision) => `found-item-report-private:${reportId}:${revision}`;
const photoAad = (reportId, photoId) => `found-item-report-photo:${reportId}:${photoId}`;
const evidenceAad = (foundItemId, reportId, revision) => `found-item-evidence:${foundItemId}:${reportId}:${revision}`;
const encryptedArgs = (encrypted) => [encrypted.keyVersion, encrypted.nonce, encrypted.ciphertext, encrypted.authenticationTag];

function storePayload(database, cipher, reportId, revision, value) {
  const encrypted = cipher.encrypt(value, privateAad(reportId, revision));
  database.prepare(`
    INSERT INTO found_item_report_private_payloads
      (report_id, revision, key_version, nonce, ciphertext, authentication_tag)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET revision=excluded.revision, key_version=excluded.key_version,
      nonce=excluded.nonce, ciphertext=excluded.ciphertext, authentication_tag=excluded.authentication_tag
  `).run(reportId, revision, ...encryptedArgs(encrypted));
}

function readPayloadRecord(database, cipher, reportId) {
  const row = database.prepare("SELECT * FROM found_item_report_private_payloads WHERE report_id = ?").get(reportId);
  if (!row) fail("Found-Item private payload is unavailable.", 500);
  return { revision: row.revision, value: cipher.decrypt(row, privateAad(reportId, row.revision), { json: true }) };
}

const readPayload = (database, cipher, reportId) => readPayloadRecord(database, cipher, reportId).value;

function insertPhoto(database, cipher, reportId, revision, ordinal, photo) {
  const id = randomUUID();
  const encrypted = cipher.encrypt(photo.bytes, photoAad(reportId, id));
  database.prepare(`
    INSERT INTO found_item_report_photos (
      id, report_id, revision, ordinal, mime_type, width, height, byte_size,
      key_version, nonce, ciphertext, authentication_tag
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, reportId, revision, ordinal, photo.mimeType, photo.width, photo.height, photo.byteSize, ...encryptedArgs(encrypted));
  return id;
}

function photoSummary(row, prefix) {
  return { id: row.id, width: row.width, height: row.height, byteSize: row.byte_size, mimeType: row.mime_type, url: `${prefix}/${row.id}` };
}

function latestReview(database, reportId, decision = null) {
  return database.prepare(`
    SELECT * FROM found_item_report_reviews WHERE report_id = ? ${decision ? "AND decision = ?" : ""}
    ORDER BY revision DESC LIMIT 1
  `).get(reportId, ...(decision ? [decision] : []));
}

function latestAppointment(database, reportId) {
  return database.prepare("SELECT * FROM found_item_handover_appointments WHERE report_id = ? ORDER BY report_revision DESC LIMIT 1").get(reportId);
}

function privateAppointment(row) {
  return row && {
    id: row.id,
    custodyLocation: { id: row.custody_location_id, name: row.location_name_snapshot, nusZone: zones.get(row.nus_zone_id_snapshot) },
    appointmentAt: row.appointment_at,
    instructions: row.instructions_snapshot,
    arrangedAt: row.created_at,
  };
}

function participantReport(database, cipher, row) {
  const payloadRecord = readPayloadRecord(database, cipher, row.id);
  const payload = payloadRecord.value;
  const photos = database.prepare("SELECT * FROM found_item_report_photos WHERE report_id = ? AND revision = ? ORDER BY ordinal, id").all(row.id, payloadRecord.revision)
    .map((photo) => photoSummary(photo, `/api/me/found-item-reports/${row.id}/photos`));
  const review = latestReview(database, row.id);
  const approval = latestReview(database, row.id, "approve");
  const approvedPhotoIds = approval ? database.prepare("SELECT photo_id FROM found_item_report_review_photos WHERE review_id=? ORDER BY photo_id").all(approval.id).map(({ photo_id }) => photo_id) : [];
  const closure = database.prepare("SELECT outcome, reason, created_at FROM found_item_report_closures WHERE report_id = ?").get(row.id);
  const foundItem = database.prepare("SELECT id, received_at FROM found_items WHERE report_id = ?").get(row.id);
  const reward = database.prepare("SELECT amount, created_at FROM gem_ledger WHERE reason = 'FOUND_ITEM_HANDOVER' AND source_type = 'found_item_report' AND source_id = ?").get(row.id);
  return {
    id: row.id, category: row.category, foundDate: row.found_date, nusZone: zones.get(row.nus_zone_id),
    description: payload.description, privateIdentifyingDetails: payload.privateIdentifyingDetails,
    photos, status: row.status, revision: row.revision, fictional: Boolean(row.fictional),
    rejectionReason: row.status === "rejected" ? review?.reason || null : null,
    approvedPublic: approval ? { category: approval.public_category, foundDate: approval.public_found_date, nusZoneId: approval.public_nus_zone_id, description: approval.public_description, approvedPhotoIds } : null,
    closure: closure ? { outcome: closure.outcome, reason: closure.reason, closedAt: closure.created_at } : null,
    appointment: privateAppointment(latestAppointment(database, row.id)),
    intake: foundItem ? { foundItemId: foundItem.id, receivedAt: foundItem.received_at, reward: reward ? { amount: reward.amount, awardedAt: reward.created_at } : null } : null,
    createdAt: row.created_at, updatedAt: row.updated_at, withdrawnAt: row.withdrawn_at || null,
  };
}

function visibleReportRows(database) {
  return database.prepare(`
    SELECT report.*, review.id AS review_id, review.public_category, review.public_found_date,
      review.public_nus_zone_id, review.public_description, review.created_at AS approved_at,
      COALESCE(moderation.hidden, 0) AS hidden
    FROM found_item_reports report
    JOIN found_item_report_reviews review ON review.id = (
      SELECT id FROM found_item_report_reviews candidate
      WHERE candidate.report_id = report.id AND candidate.decision = 'approve'
      ORDER BY candidate.revision DESC LIMIT 1
    )
    LEFT JOIN found_property_moderation moderation
      ON moderation.target_type = 'found_item_report' AND moderation.target_id = report.id
    WHERE report.status IN ('approved', 'handover_arranged') AND COALESCE(moderation.hidden, 0) = 0
  `).all();
}

function publicReport(database, row) {
  const photos = database.prepare(`
    SELECT photo.* FROM found_item_report_review_photos approved
    JOIN found_item_report_photos photo ON photo.id = approved.photo_id
    WHERE approved.review_id = ? ORDER BY photo.ordinal, photo.id
  `).all(row.review_id).map((photo, index) => ({ ...photoSummary(photo, "/api/found-item-report-photos"), alt: `Photo ${index + 1} of reported found property` }));
  return {
    id: row.id, category: row.public_category, foundDate: row.public_found_date,
    nusZone: { id: row.public_nus_zone_id, name: zones.get(row.public_nus_zone_id)?.name },
    description: row.public_description, photos, handoverArranged: row.status === "handover_arranged",
    approvedAt: row.approved_at, fictional: Boolean(row.fictional),
  };
}

function publicFoundItem(database, row) {
  const photos = database.prepare(`
    SELECT photo.* FROM found_item_photos visible
    JOIN found_item_report_photos photo ON photo.id = visible.photo_id
    WHERE visible.found_item_id = ? ORDER BY visible.ordinal, photo.id
  `).all(row.id).map((photo, index) => ({ ...photoSummary(photo, "/api/found-item-photos"), alt: `Photo ${index + 1} of a Found Item in custody` }));
  return {
    id: row.id, category: row.category, foundDate: row.found_date,
    nusZone: { id: row.nus_zone_id, name: zones.get(row.nus_zone_id)?.name },
    description: row.public_description, condition: row.condition, photos,
    receivedAt: row.received_at, fictional: Boolean(row.fictional),
  };
}

function filterPublic(values, filters, dateKey, timeKey) {
  const query = String(filters.query || "").normalize("NFKC").trim().toLowerCase();
  const category = categories.has(filters.category) ? filters.category : "";
  const zone = zones.has(filters.zone) ? filters.zone : "";
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom || "") ? filters.dateFrom : "";
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo || "") ? filters.dateTo : "";
  return values.filter((value) => !query || `${value.category} ${value.nusZone.name} ${value.description}`.toLowerCase().includes(query))
    .filter((value) => !category || value.category === category)
    .filter((value) => !zone || value.nusZone.id === zone)
    .filter((value) => !dateFrom || value[dateKey] >= dateFrom)
    .filter((value) => !dateTo || value[dateKey] <= dateTo)
    .sort((left, right) => right[timeKey].localeCompare(left[timeKey]) || left.id.localeCompare(right.id));
}

export function listPublicFoundItemReports(database, filters = {}) {
  return filterPublic(visibleReportRows(database).map((row) => publicReport(database, row)), filters, "foundDate", "approvedAt");
}

export function getPublicFoundItemReport(database, reportId) {
  const row = visibleReportRows(database).find(({ id }) => id === reportId);
  return row ? publicReport(database, row) : null;
}

export function listPublicFoundItems(database, filters = {}) {
  const rows = database.prepare(`
    SELECT item.* FROM found_items item LEFT JOIN found_property_moderation moderation
      ON moderation.target_type = 'found_item' AND moderation.target_id = item.id
    WHERE COALESCE(moderation.hidden, 0) = 0
  `).all();
  return filterPublic(rows.map((row) => publicFoundItem(database, row)), filters, "foundDate", "receivedAt");
}

export function getPublicFoundItem(database, foundItemId) {
  return listPublicFoundItems(database).find(({ id }) => id === foundItemId) || null;
}

export function createFoundItemReport(database, cipher, participant, input, sanitizedPhotos, now) {
  if (!participant.display_name) fail("Complete your public profile before posting.");
  const value = submission(input, now);
  const id = randomUUID();
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    database.prepare(`INSERT INTO found_item_reports
      (id, author_participant_id, category, found_date, nus_zone_id, status, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending_review', 1, ?, ?)`)
      .run(id, participant.participant_id, value.category, value.foundDate, value.nusZoneId, timestamp, timestamp);
    storePayload(database, cipher, id, 1, value);
    sanitizedPhotos.forEach((photo, index) => insertPhoto(database, cipher, id, 1, index, photo));
  });
  return participantReport(database, cipher, database.prepare("SELECT * FROM found_item_reports WHERE id = ?").get(id));
}

export function listParticipantFoundItemReports(database, cipher, participantId) {
  return database.prepare("SELECT * FROM found_item_reports WHERE author_participant_id = ? ORDER BY updated_at DESC, id").all(participantId)
    .map((row) => participantReport(database, cipher, row));
}

export function replaceFoundItemReport(database, cipher, participantId, reportId, input, retainedPhotoIds, sanitizedPhotos, now) {
  const row = database.prepare("SELECT * FROM found_item_reports WHERE id = ? AND author_participant_id = ?").get(reportId, participantId);
  if (!row) fail("Found-Item Report not found.", 404);
  if (!["pending_review", "rejected"].includes(row.status)) fail("Only pending or rejected Found-Item Reports can be edited.", 409);
  if (!Number.isInteger(Number(input?.revision)) || Number(input.revision) !== row.revision) fail("Found-Item Report revision is stale.", 409);
  const value = submission(input, now);
  const retained = [...new Set(retainedPhotoIds.map(String))];
  const currentPhotos = database.prepare("SELECT id FROM found_item_report_photos WHERE report_id = ? AND revision = ?").all(reportId, row.revision).map(({ id }) => id);
  if (retained.some((id) => !currentPhotos.includes(id))) fail("A retained Found-Item photo is invalid.");
  if (retained.length + sanitizedPhotos.length > 3) fail("A Found-Item Report accepts at most three photos.");
  const revision = row.revision + 1;
  withImmediateTransaction(database, () => {
    database.prepare(`UPDATE found_item_reports SET category=?, found_date=?, nus_zone_id=?, status='pending_review',
      revision=?, updated_at=? WHERE id=?`).run(value.category, value.foundDate, value.nusZoneId, revision, now.toISOString(), reportId);
    storePayload(database, cipher, reportId, revision, value);
    for (const id of currentPhotos.filter((id) => !retained.includes(id))) database.prepare("DELETE FROM found_item_report_photos WHERE id = ?").run(id);
    retained.forEach((id, ordinal) => database.prepare("UPDATE found_item_report_photos SET revision=?, ordinal=? WHERE id=?").run(revision, ordinal, id));
    sanitizedPhotos.forEach((photo, index) => insertPhoto(database, cipher, reportId, revision, retained.length + index, photo));
  });
  return participantReport(database, cipher, database.prepare("SELECT * FROM found_item_reports WHERE id = ?").get(reportId));
}

export function withdrawFoundItemReport(database, participantId, reportId, now) {
  const row = database.prepare("SELECT * FROM found_item_reports WHERE id = ? AND author_participant_id = ?").get(reportId, participantId);
  if (!row) fail("Found-Item Report not found.", 404);
  if (["withdrawn", "closed", "received"].includes(row.status)) fail("Found-Item Report cannot be withdrawn.", 409);
  withImmediateTransaction(database, () => {
    database.prepare("UPDATE found_item_reports SET status='withdrawn', revision=revision+1, withdrawn_at=?, updated_at=? WHERE id=?")
      .run(now.toISOString(), now.toISOString(), reportId);
    recordAudit(database, { eventType: "found_item_report_withdrawn", actorId: participantId, targetType: "found_item_report", targetId: reportId, reason: "Participant withdrew before physical handover", selfDirected: true }, now);
  });
}

export function listModeratorFoundItemReports(database, cipher, status = "pending_review") {
  if (!statuses.has(status)) fail("Found-Item Report status is invalid.");
  return database.prepare("SELECT * FROM found_item_reports WHERE status = ? ORDER BY created_at, id").all(status).map((row) => {
    const value = participantReport(database, cipher, row);
    return { ...value, photos: value.photos.map((photo) => ({ ...photo, url: `/api/moderation/found-item-report-photos/${photo.id}` })) };
  });
}

export function reviewFoundItemReport(database, actorId, reportId, input, now) {
  const row = database.prepare("SELECT * FROM found_item_reports WHERE id = ?").get(reportId);
  if (!row) fail("Found-Item Report not found.", 404);
  if (row.status !== "pending_review") fail("Only pending Found-Item Reports can be reviewed.", 409);
  if (!Number.isInteger(input?.revision) || input.revision !== row.revision) fail("Found-Item Report revision is stale.", 409);
  if (!["approve", "reject"].includes(input?.decision)) fail("Review decision must be approve or reject.");
  const reason = validateReason(input.reason);
  const visible = input.decision === "approve" ? structured(input, now, "publicDescription") : null;
  const approvedPhotoIds = input.decision === "approve" && Array.isArray(input.approvedPhotoIds) ? [...new Set(input.approvedPhotoIds.map(String))] : [];
  const available = database.prepare("SELECT id FROM found_item_report_photos WHERE report_id=? AND revision=?").all(reportId, row.revision).map(({ id }) => id);
  if (approvedPhotoIds.some((id) => !available.includes(id))) fail("An approved Found-Item photo is invalid.");
  const reviewId = randomUUID();
  withImmediateTransaction(database, () => {
    database.prepare(`INSERT INTO found_item_report_reviews
      (id, report_id, revision, decision, public_category, public_found_date, public_nus_zone_id,
       public_description, moderator_participant_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(reviewId, reportId, row.revision, input.decision, visible?.category || null, visible?.foundDate || null,
        visible?.nusZoneId || null, visible?.description || null, actorId, reason, now.toISOString());
    for (const photoId of approvedPhotoIds) database.prepare("INSERT INTO found_item_report_review_photos VALUES (?, ?)").run(reviewId, photoId);
    database.prepare("UPDATE found_item_reports SET status=?, updated_at=? WHERE id=?")
      .run(input.decision === "approve" ? "approved" : "rejected", now.toISOString(), reportId);
    recordAudit(database, { eventType: input.decision === "approve" ? "found_item_report_approved" : "found_item_report_rejected", actorId, targetType: "found_item_report", targetId: reportId, reason, selfDirected: actorId === row.author_participant_id }, now);
  });
  return { id: reportId, status: input.decision === "approve" ? "approved" : "rejected", revision: row.revision };
}

export function closeFoundItemReport(database, actorId, reportId, input, now) {
  const row = database.prepare("SELECT * FROM found_item_reports WHERE id = ?").get(reportId);
  if (!row) fail("Found-Item Report not found.", 404);
  if (["withdrawn", "closed", "received"].includes(row.status)) fail("Found-Item Report cannot be closed.", 409);
  if (!Number.isInteger(input?.revision) || input.revision !== row.revision) fail("Found-Item Report revision is stale.", 409);
  if (!["abandoned", "otherwise_closed"].includes(input?.outcome)) fail("Closure outcome is invalid.");
  if (input.outcome === "abandoned" && !["approved", "handover_arranged"].includes(row.status)) fail("Only approved reports can be abandoned.", 409);
  const reason = validateReason(input.reason);
  withImmediateTransaction(database, () => {
    database.prepare("INSERT INTO found_item_report_closures VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), reportId, input.outcome, actorId, reason, now.toISOString());
    database.prepare("UPDATE found_item_reports SET status='closed', revision=revision+1, updated_at=? WHERE id=?").run(now.toISOString(), reportId);
    recordAudit(database, { eventType: `found_item_report_${input.outcome}`, actorId, targetType: "found_item_report", targetId: reportId, reason, selfDirected: actorId === row.author_participant_id }, now);
  });
  return { id: reportId, status: "closed", outcome: input.outcome };
}

export function getCustodySettings(database) {
  const row = database.prepare("SELECT * FROM custody_settings WHERE id='custody'").get();
  const activeLocations = database.prepare("SELECT COUNT(*) AS count FROM custody_locations WHERE active=1").get().count;
  return { procedureApproved: Boolean(row.procedure_approved), procedureEvidenceReference: row.procedure_evidence_reference, custodyEnabled: Boolean(row.custody_enabled), revision: row.revision, activeLocationCount: activeLocations, ready: Boolean(row.procedure_approved && row.custody_enabled && activeLocations) };
}

export function updateCustodySettings(database, actorId, input, now) {
  const current = database.prepare("SELECT * FROM custody_settings WHERE id='custody'").get();
  if (!Number.isInteger(input?.revision) || input.revision !== current.revision) fail("Custody settings revision is stale.", 409);
  const approved = input.procedureApproved === undefined ? Boolean(current.procedure_approved) : input.procedureApproved;
  if (typeof approved !== "boolean") fail("Procedure approved must be true or false.");
  let evidence = input.procedureEvidenceReference === undefined ? current.procedure_evidence_reference : String(input.procedureEvidenceReference || "").trim();
  if (approved && (evidence.length < 3 || evidence.length > 500)) fail("Procedure evidence reference must be 3-500 characters.");
  if (!approved) evidence = null;
  let enabled = input.custodyEnabled === undefined ? Boolean(current.custody_enabled) : input.custodyEnabled;
  if (typeof enabled !== "boolean") fail("Custody enabled must be true or false.");
  if (!approved) enabled = false;
  if (enabled && !database.prepare("SELECT 1 FROM custody_locations WHERE active=1 LIMIT 1").get()) fail("An active Custody Location is required before enabling custody.", 409);
  const reason = validateReason(input.reason);
  withImmediateTransaction(database, () => {
    database.prepare(`UPDATE custody_settings SET procedure_approved=?, procedure_evidence_reference=?, custody_enabled=?,
      revision=revision+1, updated_by_participant_id=?, updated_at=? WHERE id='custody'`)
      .run(approved ? 1 : 0, evidence, enabled ? 1 : 0, actorId, now.toISOString());
    recordAudit(database, { eventType: "custody_settings_changed", actorId, targetType: "custody_settings", targetId: "custody", reason, selfDirected: false }, now);
  });
  return getCustodySettings(database);
}

function publicLocation(row) {
  return { id: row.id, name: row.name, nusZone: zones.get(row.nus_zone_id), defaultInstructions: row.default_instructions, active: Boolean(row.active), fictional: Boolean(row.fictional), revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listCustodyLocations(database, activeOnly = false) {
  return database.prepare(`SELECT * FROM custody_locations ${activeOnly ? "WHERE active=1" : ""} ORDER BY name, id`).all().map(publicLocation);
}

export function createCustodyLocation(database, actorId, input, now, { fictional = false, id = randomUUID() } = {}) {
  const name = text(input?.name, "Custody Location name", 3, 120);
  const zone = String(input?.nusZoneId || "");
  if (!zones.has(zone)) fail("NUS Zone is invalid.");
  const instructions = text(input?.defaultInstructions, "Default handover instructions", 3, 1000);
  const reason = validateReason(input?.reason);
  withImmediateTransaction(database, () => {
    database.prepare(`INSERT INTO custody_locations
      (id,name,nus_zone_id,default_instructions,active,fictional,revision,created_by_participant_id,updated_by_participant_id,created_at,updated_at)
      VALUES (?,?,?,?,1,?,1,?,?,?,?)`).run(id, name, zone, instructions, fictional ? 1 : 0, actorId, actorId, now.toISOString(), now.toISOString());
    recordAudit(database, { eventType: "custody_location_created", actorId, targetType: "custody_location", targetId: id, reason, selfDirected: false }, now);
  });
  return publicLocation(database.prepare("SELECT * FROM custody_locations WHERE id=?").get(id));
}

export function updateCustodyLocation(database, actorId, locationId, input, now) {
  const current = database.prepare("SELECT * FROM custody_locations WHERE id=?").get(locationId);
  if (!current) fail("Custody Location not found.", 404);
  if (!Number.isInteger(input?.revision) || input.revision !== current.revision) fail("Custody Location revision is stale.", 409);
  const name = input.name === undefined ? current.name : text(input.name, "Custody Location name", 3, 120);
  const zone = input.nusZoneId === undefined ? current.nus_zone_id : String(input.nusZoneId);
  if (!zones.has(zone)) fail("NUS Zone is invalid.");
  const instructions = input.defaultInstructions === undefined ? current.default_instructions : text(input.defaultInstructions, "Default handover instructions", 3, 1000);
  const active = input.active === undefined ? Boolean(current.active) : input.active;
  if (typeof active !== "boolean") fail("Active must be true or false.");
  const reason = validateReason(input.reason);
  withImmediateTransaction(database, () => {
    database.prepare(`UPDATE custody_locations SET name=?,nus_zone_id=?,default_instructions=?,active=?,revision=revision+1,
      updated_by_participant_id=?,updated_at=? WHERE id=?`).run(name, zone, instructions, active ? 1 : 0, actorId, now.toISOString(), locationId);
    const disabledCustody = !active
      && Boolean(database.prepare("SELECT custody_enabled FROM custody_settings WHERE id='custody'").get()?.custody_enabled)
      && !database.prepare("SELECT 1 FROM custody_locations WHERE active=1 AND id<>? LIMIT 1").get(locationId);
    if (disabledCustody) {
      database.prepare("UPDATE custody_settings SET custody_enabled=0,revision=revision+1,updated_by_participant_id=?,updated_at=? WHERE id='custody'").run(actorId, now.toISOString());
      recordAudit(database, { eventType: "custody_settings_auto_disabled", actorId, targetType: "custody_settings", targetId: "custody", reason: "The final active Custody Location was deactivated.", selfDirected: false }, now);
    }
    recordAudit(database, { eventType: active ? "custody_location_updated" : "custody_location_deactivated", actorId, targetType: "custody_location", targetId: locationId, reason, selfDirected: false }, now);
  });
  return publicLocation(database.prepare("SELECT * FROM custody_locations WHERE id=?").get(locationId));
}

function requireCustodyReady(database) {
  if (!getCustodySettings(database).ready) fail("Custody operations are not enabled.", 409, "CUSTODY_GATE_REQUIRED");
}

export function arrangeFoundItemHandover(database, actorId, reportId, input, now) {
  requireCustodyReady(database);
  const row = database.prepare("SELECT * FROM found_item_reports WHERE id=?").get(reportId);
  if (!row) fail("Found-Item Report not found.", 404);
  if (!["approved", "handover_arranged"].includes(row.status)) fail("Only approved Found-Item Reports can receive appointments.", 409);
  if (!Number.isInteger(input?.revision) || input.revision !== row.revision) fail("Found-Item Report revision is stale.", 409);
  const location = database.prepare("SELECT * FROM custody_locations WHERE id=? AND active=1").get(String(input.locationId || ""));
  if (!location) fail("Active Custody Location not found.", 404);
  const appointment = new Date(input.appointmentAt);
  if (Number.isNaN(appointment.getTime()) || appointment <= now) fail("Appointment time must be in the future.");
  const extra = String(input.instructions || "").normalize("NFKC").trim();
  if (extra.length > 1000) fail("Appointment instructions must not exceed 1000 characters.");
  const instructions = extra ? `${location.default_instructions}\n\n${extra}` : location.default_instructions;
  const reason = validateReason(input.reason);
  const revision = row.revision + 1;
  withImmediateTransaction(database, () => {
    database.prepare(`INSERT INTO found_item_handover_appointments
      (id,report_id,report_revision,custody_location_id,location_name_snapshot,nus_zone_id_snapshot,
       instructions_snapshot,appointment_at,moderator_participant_id,reason,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), reportId, revision, location.id, location.name, location.nus_zone_id,
        instructions, appointment.toISOString(), actorId, reason, now.toISOString());
    database.prepare("UPDATE found_item_reports SET status='handover_arranged',revision=?,updated_at=? WHERE id=?").run(revision, now.toISOString(), reportId);
    recordAudit(database, { eventType: row.status === "handover_arranged" ? "found_item_handover_rescheduled" : "found_item_handover_arranged", actorId, targetType: "found_item_report", targetId: reportId, reason, selfDirected: actorId === row.author_participant_id }, now);
  });
  return privateAppointment(latestAppointment(database, reportId));
}

export function intakeFoundItem(database, cipher, actorId, reportId, input, now) {
  requireCustodyReady(database);
  const row = database.prepare("SELECT * FROM found_item_reports WHERE id=?").get(reportId);
  if (!row) fail("Found-Item Report not found.", 404);
  if (row.status !== "handover_arranged") fail("Physical intake requires an arranged handover.", 409);
  if (!Number.isInteger(input?.revision) || input.revision !== row.revision) fail("Found-Item Report revision is stale.", 409);
  if (!conditions.has(input?.condition)) fail("Found Item condition is invalid.");
  const conditionNotes = text(input?.conditionNotes, "Private condition notes", 3, 1000);
  const visible = structured(input, now, "publicDescription");
  const approval = latestReview(database, reportId, "approve");
  const approved = database.prepare("SELECT photo_id FROM found_item_report_review_photos WHERE review_id=?").all(approval.id).map(({ photo_id }) => photo_id);
  const photoIds = Array.isArray(input.approvedPhotoIds) ? [...new Set(input.approvedPhotoIds.map(String))] : [];
  if (photoIds.some((id) => !approved.includes(id))) fail("Intake photos must be a subset of approved report photos.");
  const reason = validateReason(input.reason);
  const payloadRecord = readPayloadRecord(database, cipher, reportId);
  const foundItemId = randomUUID();
  const encryptedEvidence = cipher.encrypt({ ...payloadRecord.value, conditionNotes }, evidenceAad(foundItemId, reportId, payloadRecord.revision));
  withImmediateTransaction(database, () => {
    database.prepare(`INSERT INTO found_items
      (id,report_id,category,found_date,nus_zone_id,public_description,condition,custodian_participant_id,reason,fictional,received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(foundItemId, reportId, visible.category, visible.foundDate, visible.nusZoneId,
        visible.description, input.condition, actorId, reason, row.fictional, now.toISOString());
    database.prepare(`INSERT INTO found_item_private_evidence
      (found_item_id,source_report_revision,key_version,nonce,ciphertext,authentication_tag) VALUES (?,?,?,?,?,?)`)
      .run(foundItemId, payloadRecord.revision, ...encryptedArgs(encryptedEvidence));
    photoIds.forEach((photoId, ordinal) => database.prepare("INSERT INTO found_item_photos VALUES (?,?,?)").run(foundItemId, photoId, ordinal));
    database.prepare("UPDATE found_item_reports SET status='received',revision=revision+1,updated_at=? WHERE id=?").run(now.toISOString(), reportId);
    database.prepare("UPDATE comments SET post_type='found_item',post_id=? WHERE post_type='found_item_report' AND post_id=? AND parent_comment_id IS NULL").run(foundItemId, reportId);
    database.prepare("UPDATE comments SET post_type='found_item',post_id=? WHERE post_type='found_item_report' AND post_id=?").run(foundItemId, reportId);
    database.prepare("UPDATE content_reports SET target_type='found_item',target_id=?,target_post_id=? WHERE target_type='found_item_report' AND target_id=?").run(foundItemId, foundItemId, reportId);
    database.prepare("UPDATE content_reports SET target_post_id=? WHERE target_post_id=?").run(foundItemId, reportId);
    const moderation = database.prepare("SELECT * FROM found_property_moderation WHERE target_type='found_item_report' AND target_id=?").get(reportId);
    if (moderation) database.prepare("INSERT INTO found_property_moderation VALUES ('found_item',?,?,?,?,?)")
      .run(foundItemId, moderation.hidden, moderation.reason, moderation.updated_by_participant_id, moderation.updated_at);
    awardFoundItemHandover(database, row.author_participant_id, reportId, now);
    recordAudit(database, { eventType: "found_item_received_into_custody", actorId, targetType: "found_item", targetId: foundItemId, reason, selfDirected: actorId === row.author_participant_id }, now);
  });
  return { foundItem: getPublicFoundItem(database, foundItemId), reward: { amount: 20, participantId: row.author_participant_id, reportId } };
}

function decryptPhoto(database, cipher, photoId, condition, args = []) {
  const row = database.prepare(`SELECT photo.* FROM found_item_report_photos photo ${condition}`).get(...args, photoId);
  if (!row) fail("Found-Item photo not found.", 404);
  return { ...photoSummary(row, ""), bytes: cipher.decrypt(row, photoAad(row.report_id, row.id)) };
}

export const getParticipantFoundItemPhoto = (database, cipher, participantId, reportId, photoId) => decryptPhoto(database, cipher, photoId,
  "JOIN found_item_reports report ON report.id=photo.report_id WHERE report.author_participant_id=? AND report.id=? AND photo.id=?", [participantId, reportId]);
export const getModeratorFoundItemPhoto = (database, cipher, photoId) => decryptPhoto(database, cipher, photoId, "WHERE photo.id=?");
export const getPublicFoundItemReportPhoto = (database, cipher, photoId) => decryptPhoto(database, cipher, photoId, `
  JOIN found_item_report_review_photos approved ON approved.photo_id=photo.id
  JOIN found_item_report_reviews review ON review.id=approved.review_id AND review.decision='approve'
  JOIN found_item_reports report ON report.id=review.report_id AND report.status IN ('approved','handover_arranged')
  LEFT JOIN found_property_moderation moderation ON moderation.target_type='found_item_report' AND moderation.target_id=report.id
  WHERE COALESCE(moderation.hidden,0)=0 AND photo.id=?`);
export const getPublicFoundItemPhoto = (database, cipher, photoId) => decryptPhoto(database, cipher, photoId, `
  JOIN found_item_photos visible ON visible.photo_id=photo.id
  JOIN found_items item ON item.id=visible.found_item_id
  LEFT JOIN found_property_moderation moderation ON moderation.target_type='found_item' AND moderation.target_id=item.id
  WHERE COALESCE(moderation.hidden,0)=0 AND photo.id=?`);

export function foundPropertyEvidence(database, targetType, targetId) {
  const value = targetType === "found_item_report" ? getPublicFoundItemReport(database, targetId) : getPublicFoundItem(database, targetId);
  if (!value) fail("Reported content not found.", 404);
  return { postId: value.id, label: `${value.category} found in ${value.nusZone.name}`, text: value.description };
}

export function hideFoundProperty(database, actorId, targetType, targetId, reason, now) {
  const value = targetType === "found_item_report" ? getPublicFoundItemReport(database, targetId) : getPublicFoundItem(database, targetId);
  const report = targetType === "found_item_report" ? database.prepare("SELECT author_participant_id FROM found_item_reports WHERE id=?").get(targetId)
    : database.prepare("SELECT report.author_participant_id FROM found_items item JOIN found_item_reports report ON report.id=item.report_id WHERE item.id=?").get(targetId);
  if (!value) return { outcome: "already_unavailable", authorParticipantId: report?.author_participant_id || null };
  database.prepare(`INSERT INTO found_property_moderation
    (target_type,target_id,hidden,reason,updated_by_participant_id,updated_at) VALUES (?,?,1,?,?,?)
    ON CONFLICT(target_type,target_id) DO UPDATE SET hidden=1,reason=excluded.reason,updated_by_participant_id=excluded.updated_by_participant_id,updated_at=excluded.updated_at`)
    .run(targetType, targetId, reason, actorId, now.toISOString());
  return { outcome: "hidden", authorParticipantId: report?.author_participant_id || null };
}

export function seedCustodyLocation(database) {
  database.prepare(`INSERT OR IGNORE INTO custody_locations
    (id,name,nus_zone_id,default_instructions,active,fictional,revision,created_by_participant_id,updated_by_participant_id,created_at,updated_at)
    VALUES ('fixture-custody-location','Fictional Central Library service desk','central',
      'Bring the arranged handover reference and wait for the Custodian to verify physical intake.',1,1,1,NULL,NULL,
      '2026-08-29T00:00:00Z','2026-08-29T00:00:00Z')`).run();
}
