import { randomUUID } from "node:crypto";

export function addNotification(database, { participantId, type, targetType, targetId, message }, now) {
  database.prepare(`
    INSERT INTO notifications (id, participant_id, type, target_type, target_id, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), participantId, type, targetType, targetId, message, now.toISOString());
}

export function listNotifications(database, participantId) {
  return database.prepare(`
    SELECT id, type, target_type AS targetType, target_id AS targetId,
      message, created_at AS createdAt
    FROM notifications
    WHERE participant_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(participantId);
}
