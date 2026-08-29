import { randomUUID } from "node:crypto";
import { withImmediateTransaction } from "../db/database.js";
import { deliverEligibleAlerts, updateProfileZone } from "./buffetAlertService.js";

const blockedNames = new Set(["admin", "administrator", "moderator", "univus", "nus", "support"]);

export function normalizeDisplayName(input) {
  const displayName = String(input || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (displayName.length < 3 || displayName.length > 30) throw Object.assign(new Error("Display name must be 3–30 characters."), { status: 422 });
  if (!/^[\p{L}\p{N} ._-]+$/u.test(displayName)) throw Object.assign(new Error("Display name contains unsupported characters."), { status: 422 });
  const key = displayName.toLocaleLowerCase("en-SG");
  if (blockedNames.has(key)) throw Object.assign(new Error("This display name is reserved."), { status: 422 });
  return { displayName, key };
}

export function upsertParticipant(database, identity, now) {
  const existing = database.prepare("SELECT * FROM participants WHERE provider = 'univus' AND external_subject = ?").get(identity.subject);
  if (existing) return existing;
  const id = randomUUID();
  const publicId = randomUUID();
  const timestamp = now.toISOString();
  database.prepare("INSERT INTO participants (id, public_id, provider, external_subject, email, verification_state, created_at, updated_at) VALUES (?, ?, 'univus', ?, ?, 'verified', ?, ?)").run(id, publicId, identity.subject, identity.email.toLowerCase(), timestamp, timestamp);
  return database.prepare("SELECT * FROM participants WHERE id = ?").get(id);
}

export function updateParticipantProfile(database, participantId, { displayName: input, nusZone }, now) {
  const { displayName, key } = normalizeDisplayName(input);
  try {
    let zoneResult;
    withImmediateTransaction(database, () => {
      zoneResult = updateProfileZone(database, participantId, nusZone, now, { deliver: false });
      database.prepare("UPDATE participants SET display_name = ?, display_name_key = ?, updated_at = ? WHERE id = ?")
        .run(displayName, key, now.toISOString(), participantId);
    });
    if (zoneResult.enabled) deliverEligibleAlerts(database, now, undefined, participantId);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) throw Object.assign(new Error("Display name is already taken."), { status: 409 });
    throw error;
  }
  return database.prepare("SELECT * FROM participants WHERE id = ?").get(participantId);
}

export function privateProfile(participant, gemAccount) {
  return { id: participant.id, publicId: participant.public_id, email: participant.email, displayName: participant.display_name, nusZone: participant.nus_zone, buffetAlertsEnabled: Boolean(participant.buffet_alerts_enabled), verificationState: participant.verification_state, gemBalance: gemAccount.balance };
}

export function publicProfile(database, publicId) {
  const participant = database.prepare("SELECT public_id, display_name, verification_state FROM participants WHERE public_id = ? AND display_name IS NOT NULL").get(publicId);
  return participant && { publicId: participant.public_id, displayName: participant.display_name, verificationState: participant.verification_state, avatar: "participant" };
}
