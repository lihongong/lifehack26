import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeTelegramUpdate } from "./sourceFeedDomain.js";
import { ingestSourceUpdate, recordSourceAuthorConsent, withdrawSourceAuthorConsent } from "../services/sourceFeedService.js";

const fixtureUrls = Object.freeze({
  "marketplace-baseline": new URL("./fixtures/marketplace-baseline.json", import.meta.url),
  "consent-lifecycle": new URL("./fixtures/consent-lifecycle.json", import.meta.url),
  "marketplace-conflict": new URL("./fixtures/marketplace-conflict.json", import.meta.url),
  "marketplace-unparseable": new URL("./fixtures/marketplace-unparseable.json", import.meta.url),
});

export function fixtureNames() {
  return Object.keys(fixtureUrls);
}

export function loadSourceFixture(name) {
  const url = fixtureUrls[name];
  if (!url) throw Object.assign(new Error("Source fixture is not allowlisted."), { status: 404 });
  const fixture = JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
  if (fixture.schemaVersion !== 1 || fixture.name !== name || !fixture.feedId || !Array.isArray(fixture.steps)) {
    throw Object.assign(new Error("Source fixture has an unsupported schema."), { status: 422 });
  }
  return fixture;
}

export function replaySourceFixture(database, name, { identitySecret, moderatorActorId = null } = {}) {
  const fixture = loadSourceFixture(name);
  const consentIds = new Map();
  const outcomes = [];
  for (const step of fixture.steps) {
    const now = new Date(step.at);
    if (Number.isNaN(now.getTime())) throw Object.assign(new Error("Fixture step timestamp is invalid."), { status: 422 });
    if (step.type === "telegram_update") {
      const event = normalizeTelegramUpdate(step.update, { feedId: fixture.feedId, fictional: true, media: step.media || null });
      outcomes.push({ updateId: event.updateId, ...ingestSourceUpdate(database, fixture.feedId, event, now, identitySecret) });
      continue;
    }
    if (!moderatorActorId) throw Object.assign(new Error("Consent fixture steps require a Moderator actor."), { status: 422 });
    if (step.type === "consent_grant") {
      const consent = recordSourceAuthorConsent(database, moderatorActorId, fixture.feedId, step.consent, now, identitySecret);
      consentIds.set(step.key, consent.id);
      outcomes.push({ consent: step.key, status: "granted" });
      continue;
    }
    if (step.type === "consent_withdraw") {
      const consentId = consentIds.get(step.key);
      if (!consentId) throw Object.assign(new Error("Fixture consent withdrawal has no matching grant."), { status: 422 });
      withdrawSourceAuthorConsent(database, moderatorActorId, fixture.feedId, consentId, step.reason, now);
      outcomes.push({ consent: step.key, status: "withdrawn" });
      continue;
    }
    throw Object.assign(new Error("Fixture step type is unsupported."), { status: 422 });
  }
  return { fixture: name, feedId: fixture.feedId, outcomes };
}

export function sourceFixtureSnapshot(database) {
  return {
    listings: database.prepare(`
      SELECT l.id, l.title, l.category, l.price, l.description,
        l.source_updated_at AS sourceTime, life.expires_at AS expiresAt
      FROM marketplace_listings l
      JOIN marketplace_listing_lifecycle life ON life.listing_id = l.id
      ORDER BY l.id
    `).all(),
    discrepancies: database.prepare(`
      SELECT discrepancy_type AS type, status, redacted FROM source_discrepancies ORDER BY update_id
    `).all().map((row) => ({ ...row, redacted: Boolean(row.redacted) })),
    processedUpdates: database.prepare("SELECT COUNT(*) AS count FROM processed_source_updates").get().count,
    tombstones: database.prepare("SELECT reason, COUNT(*) AS count FROM source_deletion_tombstones GROUP BY reason ORDER BY reason").all(),
  };
}
