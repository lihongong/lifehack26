import { nusZones, publicZones, ZONE_GRAPH_VERSION } from "../data/nusZones.js";
import { withImmediateTransaction } from "../db/database.js";
import { awardGems, GEM_REASONS, getGemAccount } from "./gemService.js";

const FALLBACK_EXPIRY_MS = 2 * 60 * 60 * 1000;
const freshnessValues = new Set(["active", "30", "60"]);
const zoneIds = new Set(nusZones.map(({ id }) => id));

export function buffetPostExpiry(post) {
  return post.collectionDeadline || new Date(new Date(post.sourceTime).getTime() + FALLBACK_EXPIRY_MS).toISOString();
}

function publicPost(post) {
  const zone = nusZones.find(({ id }) => id === post.zoneId);
  const expiresAt = buffetPostExpiry(post);
  return {
    id: post.id,
    referenceId: post.referenceId || post.internalId || post.id,
    title: post.title,
    description: post.description,
    source: post.source,
    sourceTime: post.sourceTime,
    reportedLocation: post.reportedLocation,
    zone: zone ? { id: zone.id, name: zone.name } : null,
    expiresAt,
    expiryBasis: post.fictional ? "demo" : post.collectionDeadline ? "stated" : "fallback",
    fictional: Boolean(post.fictional),
    persistentDemo: Boolean(post.fictional),
    origin: post.origin || "source_feed",
  };
}

export function getPublicBuffetPost(database, referenceId, now = new Date()) {
  const reference = database.prepare("SELECT id, origin FROM buffet_post_refs WHERE public_id = ?").get(referenceId);
  if (!reference) return null;
  const row = reference.origin === "manual"
    ? database.prepare(`
      SELECT id, id AS internalId, title, description, 'ShareNUS' AS source,
        created_at AS sourceTime, reported_location AS reportedLocation, zone_id AS zoneId,
        collection_deadline AS collectionDeadline, 0 AS fictional, 'manual' AS origin
      FROM manual_buffet_posts WHERE id = ? AND deleted_at IS NULL AND collection_deadline > ?
    `).get(reference.id, now.toISOString())
    : database.prepare(`
      SELECT id AS internalId, source_post_id AS id, title, description, source_name AS source,
        source_time AS sourceTime, reported_location AS reportedLocation, zone_id AS zoneId,
        collection_deadline AS collectionDeadline, fictional, 'source_feed' AS origin
      FROM buffet_posts WHERE id = ?
    `).get(reference.id);
  if (!row) return null;
  row.referenceId = referenceId;
  const state = database.prepare("SELECT state FROM buffet_post_states WHERE buffet_post_id = ?").get(reference.id)?.state || "active";
  if (state === "confirmed_expired") return null;
  return findBuffetPosts([row], {}, now)[0] || null;
}

export function findBuffetPosts(posts, { query = "", zone = "all", freshness = "active" } = {}, now = new Date()) {
  const safeZone = zoneIds.has(zone) || zone === "unclear" ? zone : "all";
  const safeFreshness = freshnessValues.has(freshness) ? freshness : "active";
  const needle = String(query).normalize("NFKC").trim().toLocaleLowerCase("en-SG");
  const cutoff = safeFreshness === "active" ? null : now.getTime() - Number(safeFreshness) * 60_000;
  return posts.map(publicPost).filter((post) => {
    if (!post.persistentDemo && new Date(post.expiresAt) <= now) return false;
    if (cutoff && new Date(post.sourceTime).getTime() < cutoff) return false;
    if (safeZone === "unclear" ? post.zone : safeZone !== "all" && post.zone?.id !== safeZone) return false;
    const aliases = post.zone ? nusZones.find(({ id }) => id === post.zone.id).aliases.join(" ") : "location unclear";
    return !needle || `${post.title} ${post.description} ${post.reportedLocation} ${post.zone?.name || ""} ${aliases}`.toLocaleLowerCase("en-SG").includes(needle);
  }).sort((left, right) => new Date(right.sourceTime) - new Date(left.sourceTime) || left.id.localeCompare(right.id));
}

export function buffetFeed(databasePosts, filters, now, states = new Map(), collectedIds = new Set()) {
  const posts = findBuffetPosts(databasePosts, filters, now)
    .filter((post) => states.get(post.referenceId) !== "confirmed_expired")
    .map((post) => ({ ...post, possiblyGone: states.get(post.referenceId) === "possibly_gone", going: collectedIds.has(post.referenceId) }));
  return { posts, zones: publicZones(), zoneGraphVersion: ZONE_GRAPH_VERSION, serverNow: now.toISOString() };
}

export function recordBuffetGoing(database, participantId, referenceId, now) {
  const reward = withImmediateTransaction(database, () => {
    const post = database.prepare(`
      SELECT bp.*, ref.origin, manual.deleted_at AS manual_deleted_at,
        COALESCE(state.state, 'active') AS state
      FROM buffet_post_refs ref
      JOIN buffet_posts bp ON bp.id = ref.id
      LEFT JOIN manual_buffet_posts manual ON manual.id = ref.id
      LEFT JOIN buffet_post_states state ON state.buffet_post_id = bp.id
      WHERE ref.public_id = ?
    `).get(referenceId);
    if (!post) throw Object.assign(new Error("Buffet Post not found."), { status: 404 });
    if ((post.origin === "manual" && post.manual_deleted_at) || post.state === "confirmed_expired" || (!post.fictional && new Date(buffetPostExpiry({ sourceTime: post.source_time, collectionDeadline: post.collection_deadline })) <= now)) {
      throw Object.assign(new Error("Buffet Post is no longer available."), { status: 409 });
    }
    return awardGems(database, {
      participantId,
      amount: 2,
      reason: GEM_REASONS.buffetGoing,
      sourceType: "buffet_post",
      sourceId: referenceId,
      now,
      dailyLimit: 3,
    });
  });
  return { reward, gemBalance: getGemAccount(database, participantId).balance };
}
