import { createLostItemPost, reviewLostItemPost } from "./lostItemService.js";

const fixtureParticipants = Object.freeze([
  {
    id: "fixture-lost-item-author",
    publicId: "fixture-lost-author",
    subject: "fixture-lost-author-subject",
    email: "fixture-lost-author@example.invalid",
    displayName: "Fixture Participant",
  },
  {
    id: "fixture-lost-item-reviewer",
    publicId: "fixture-lost-reviewer",
    subject: "fixture-lost-reviewer-subject",
    email: "fixture-lost-reviewer@example.invalid",
    displayName: "Fixture Reviewer",
  },
]);

function insertParticipant(database, participant, now) {
  database.prepare(`
    INSERT OR IGNORE INTO participants (
      id, public_id, provider, external_subject, email, display_name,
      display_name_key, nus_zone, verification_state, created_at, updated_at
    ) VALUES (?, ?, 'fixture', ?, ?, ?, ?, 'central', 'verified', ?, ?)
  `).run(
    participant.id,
    participant.publicId,
    participant.subject,
    participant.email,
    participant.displayName,
    participant.displayName.toLowerCase(),
    now.toISOString(),
    now.toISOString(),
  );
}

function actor(participant) {
  return {
    participant_id: participant.id,
    display_name: participant.displayName,
  };
}

export function seedLostItemFixtures(database, cipher) {
  if (database.prepare("SELECT 1 FROM lost_item_posts LIMIT 1").get()) return;
  const createdAt = new Date("2026-08-29T02:00:00.000Z");
  const reviewedAt = new Date("2026-08-29T03:00:00.000Z");
  for (const participant of fixtureParticipants) insertParticipant(database, participant, createdAt);

  const published = createLostItemPost(database, cipher, actor(fixtureParticipants[0]), {
    category: "Keys",
    lostDate: "2026-08-28",
    nusZoneId: "central",
    description: "A small keyring was misplaced near the Central Library entrance. Original fixture notes remain private.",
    privateIdentifyingDetails: "FICTIONAL PRIVATE FIXTURE: three keys and an internal ownership marker.",
  }, [], createdAt, { fictional: true, id: "fixture-lost-item-published" });
  reviewLostItemPost(database, fixtureParticipants[1].id, published.id, {
    revision: published.revision,
    decision: "publish",
    publicDescription: "Small keyring reported lost near the Central Library entrance.",
    approvedPhotoIds: [],
    reason: "Reviewed fictional fixture for the public Lost & Found demonstration.",
  }, reviewedAt);

  createLostItemPost(database, cipher, actor(fixtureParticipants[0]), {
    category: "Electronics",
    lostDate: "2026-08-29",
    nusZoneId: "computing",
    description: "A fictional electronic accessory was misplaced in Computing and awaits review.",
    privateIdentifyingDetails: "FICTIONAL PRIVATE FIXTURE: unique ownership detail visible only to authorized reviewers.",
  }, [], createdAt, { fictional: true, id: "fixture-lost-item-pending" });
}
