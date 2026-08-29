import { createHash, randomBytes } from "node:crypto";
import { awardDailyLogin, getGemAccount } from "./gemService.js";
import { privateProfile, upsertParticipant } from "./participantService.js";
import { bootstrapPlatformOperator } from "./privilegeService.js";

const SESSION_COOKIE = "univus_session";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export function createLaunchAssertion(database, identity, now) {
  const rawToken = token();
  const expiresAt = new Date(now.getTime() + 60_000);
  database.prepare("INSERT INTO launch_assertions (token_hash, external_subject, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(hash(rawToken), identity.subject, identity.email.toLowerCase(), expiresAt.toISOString(), now.toISOString());
  return rawToken;
}

export function consumeLaunchAssertion(database, rawToken, now) {
  const record = database.prepare("SELECT * FROM launch_assertions WHERE token_hash = ?").get(hash(String(rawToken || "")));
  if (!record || record.consumed_at || record.expires_at <= now.toISOString()) throw Object.assign(new Error("Launch link is invalid or expired."), { status: 401 });
  database.prepare("UPDATE launch_assertions SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL").run(now.toISOString(), record.token_hash);
  return { subject: record.external_subject, email: record.email };
}

export function createSession(database, participantId, now) {
  const rawToken = token();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  database.prepare("INSERT INTO sessions (token_hash, participant_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(hash(rawToken), participantId, expiresAt.toISOString(), now.toISOString());
  return { rawToken, expiresAt };
}

export function completeLaunch(database, rawToken, now, platformOperatorSubject = "") {
  database.exec("BEGIN IMMEDIATE");
  try {
    const identity = consumeLaunchAssertion(database, rawToken, now);
    const participant = upsertParticipant(database, identity, now);
    bootstrapPlatformOperator(database, participant, identity, platformOperatorSubject, now);
    awardDailyLogin(database, participant.id, now);
    const session = createSession(database, participant.id, now);
    database.exec("COMMIT");
    return { participant, session };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function readCookie(request, name = SESSION_COOKIE) {
  const values = Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim().split("=")).filter(([key]) => key));
  return values[name] ? decodeURIComponent(values[name]) : null;
}

export function resolveSession(database, rawToken, now) {
  if (!rawToken) return null;
  const row = database.prepare("SELECT s.token_hash, s.participant_id, p.*, COALESCE(pr.role, 'participant') AS role FROM sessions s JOIN participants p ON p.id = s.participant_id LEFT JOIN privileged_roles pr ON pr.participant_id = p.id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?").get(hash(rawToken), now.toISOString());
  if (!row) return null;
  awardDailyLogin(database, row.participant_id, now);
  return row;
}

export function sessionPayload(database, participant) {
  return { ...privateProfile(participant, getGemAccount(database, participant.participant_id || participant.id)), role: participant.role || database.prepare("SELECT COALESCE((SELECT role FROM privileged_roles WHERE participant_id = ?), 'participant') AS role").get(participant.id).role };
}

export function revokeSession(database, rawToken, now) {
  if (rawToken) database.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?").run(now.toISOString(), hash(rawToken));
}

export function setSessionCookie(response, session, production) {
  response.cookie(SESSION_COOKIE, session.rawToken, { httpOnly: true, sameSite: "lax", secure: production, expires: session.expiresAt, path: "/" });
}

export function clearSessionCookie(response, production) {
  response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: production, path: "/" });
}
