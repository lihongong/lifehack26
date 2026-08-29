import { randomUUID } from "node:crypto";
import { singaporeDate } from "./clock.js";

export const GEM_REASONS = Object.freeze({
  buffetGoing: "BUFFET_GOING",
  marketplaceContact: "MARKETPLACE_CONTACT",
  marketplaceSaleBuyer: "MARKETPLACE_SALE_BUYER",
  marketplaceSaleSeller: "MARKETPLACE_SALE_SELLER",
  foundItemReport: "FOUND_ITEM_REPORT",
});

export function getGemAccount(database, participantId) {
  const { balance } = database.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM gem_ledger WHERE participant_id = ?").get(participantId);
  const entries = database.prepare("SELECT id, amount, reason, singapore_date AS singaporeDate, source_type AS sourceType, source_id AS sourceId, created_at AS createdAt FROM gem_ledger WHERE participant_id = ? ORDER BY created_at DESC").all(participantId);
  return { balance, entries };
}

export function awardGems(database, { participantId, amount, reason, sourceType, sourceId, now, dailyLimit = null, dailyReasons = [reason] }) {
  const existing = database.prepare(`
    SELECT 1 FROM gem_ledger
    WHERE participant_id = ? AND reason = ? AND source_type = ? AND source_id = ?
  `).get(participantId, reason, sourceType, sourceId);
  const date = singaporeDate(now);
  const placeholders = dailyReasons.map(() => "?").join(",");
  const dailyCount = database.prepare(`
    SELECT COUNT(*) AS count FROM gem_ledger
    WHERE participant_id = ? AND singapore_date = ? AND reason IN (${placeholders})
  `).get(participantId, date, ...dailyReasons).count;
  if (existing) return { awarded: false, status: "already_collected", amount: 0, dailyCount, dailyLimit };
  if (dailyLimit !== null && dailyCount >= dailyLimit) return { awarded: false, status: "daily_limit_reached", amount: 0, dailyCount, dailyLimit };
  database.prepare(`
    INSERT INTO gem_ledger (id, participant_id, amount, reason, singapore_date, source_type, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), participantId, amount, reason, date, sourceType, sourceId, now.toISOString());
  return { awarded: true, status: "awarded", amount, dailyCount: dailyCount + 1, dailyLimit };
}

export function awardFoundItemReport(database, participantId, reportId, now) {
  return awardGems(database, {
    participantId,
    amount: 20,
    reason: GEM_REASONS.foundItemReport,
    sourceType: "found_item_report",
    sourceId: reportId,
    now,
  });
}
