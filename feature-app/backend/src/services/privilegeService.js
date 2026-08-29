import { randomUUID } from "node:crypto";

export function validateReason(input) {
  const reason = String(input || "").trim();
  if (reason.length < 3 || reason.length > 500) throw Object.assign(new Error("Reason must be 3-500 characters."), { status: 422 });
  return reason;
}

export function recordAudit(database, { eventType, actorId, targetType, targetId, reason, selfDirected }, now) {
  database.prepare("INSERT INTO audit_log (id, event_type, actor_participant_id, target_type, target_id, reason, self_directed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), eventType, actorId, targetType, targetId, reason, selfDirected ? 1 : 0, now.toISOString());
}

export function bootstrapPlatformOperator(database, participant, identity, configuredSubject, now) {
  if (!configuredSubject || identity.subject !== configuredSubject) return false;
  if (database.prepare("SELECT 1 FROM privileged_roles WHERE role = 'platform_operator'").get()) return false;
  database.prepare("INSERT INTO privileged_roles (participant_id, role, granted_by_participant_id, granted_at) VALUES (?, 'platform_operator', ?, ?)")
    .run(participant.id, participant.id, now.toISOString());
  recordAudit(database, {
    eventType: "platform_operator_bootstrapped",
    actorId: participant.id,
    targetType: "participant",
    targetId: participant.id,
    reason: "Deployment-configured Platform Operator bootstrap",
    selfDirected: true,
  }, now);
  return true;
}

export function listModerators(database) {
  return database.prepare(`
    SELECT p.id, p.email, p.display_name AS displayName, pr.granted_at AS grantedAt
    FROM privileged_roles pr JOIN participants p ON p.id = pr.participant_id
    WHERE pr.role = 'moderator' ORDER BY pr.granted_at, p.email
  `).all();
}

export function enrollModerator(database, actorId, emailInput, reasonInput, now) {
  const email = String(emailInput || "").trim().toLowerCase();
  const reason = validateReason(reasonInput);
  const participant = database.prepare("SELECT id, email, display_name AS displayName FROM participants WHERE email = ?").get(email);
  if (!participant) throw Object.assign(new Error("Participant not found."), { status: 404 });
  if (database.prepare("SELECT role FROM privileged_roles WHERE participant_id = ?").get(participant.id)) {
    throw Object.assign(new Error("Participant already has a privileged role."), { status: 409 });
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT INTO privileged_roles (participant_id, role, granted_by_participant_id, granted_at) VALUES (?, 'moderator', ?, ?)")
      .run(participant.id, actorId, now.toISOString());
    recordAudit(database, { eventType: "moderator_enrolled", actorId, targetType: "participant", targetId: participant.id, reason, selfDirected: actorId === participant.id }, now);
    database.exec("COMMIT");
    return participant;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function removeModerator(database, actorId, participantId, reasonInput, now) {
  const reason = validateReason(reasonInput);
  const moderator = database.prepare("SELECT participant_id FROM privileged_roles WHERE participant_id = ? AND role = 'moderator'").get(participantId);
  if (!moderator) throw Object.assign(new Error("Moderator not found."), { status: 404 });
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM privileged_roles WHERE participant_id = ? AND role = 'moderator'").run(participantId);
    database.prepare("UPDATE sessions SET revoked_at = ? WHERE participant_id = ? AND revoked_at IS NULL").run(now.toISOString(), participantId);
    recordAudit(database, { eventType: "moderator_removed", actorId, targetType: "participant", targetId: participantId, reason, selfDirected: actorId === participantId }, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getAuditLog(database) {
  return database.prepare(`
    SELECT a.id, a.event_type AS eventType, a.target_type AS targetType, a.target_id AS targetId,
      a.reason, a.self_directed AS selfDirected, a.created_at AS createdAt,
      p.display_name AS actorDisplayName, p.email AS actorEmail
    FROM audit_log a JOIN participants p ON p.id = a.actor_participant_id
    ORDER BY a.created_at DESC, a.id DESC
  `).all().map((entry) => ({ ...entry, selfDirected: Boolean(entry.selfDirected) }));
}
