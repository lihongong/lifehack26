import { randomUUID } from "node:crypto";
import { singaporeDate } from "./clock.js";

export function awardDailyLogin(database, participantId, now) {
  const timestamp = now.toISOString();
  const result = database.prepare("INSERT OR IGNORE INTO gem_ledger (id, participant_id, amount, reason, singapore_date, created_at) VALUES (?, ?, 5, 'DAILY_LOGIN', ?, ?)").run(randomUUID(), participantId, singaporeDate(now), timestamp);
  return result.changes === 1;
}

export function getGemAccount(database, participantId) {
  const { balance } = database.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM gem_ledger WHERE participant_id = ?").get(participantId);
  const entries = database.prepare("SELECT id, amount, reason, singapore_date AS singaporeDate, created_at AS createdAt FROM gem_ledger WHERE participant_id = ? ORDER BY created_at DESC").all(participantId);
  return { balance, entries };
}
