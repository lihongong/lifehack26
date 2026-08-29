import { withImmediateTransaction } from "../db/database.js";
import { hashSourceAuthor } from "../sourceFeeds/sourceFeedDomain.js";
import { awardGems, GEM_REASONS, getGemAccount } from "./gemService.js";

const saleReasons = [GEM_REASONS.marketplaceSaleBuyer, GEM_REASONS.marketplaceSaleSeller];

export function awardMarketplaceContact(database, participantId, listing, now) {
  if (!listing.contactUrl) throw Object.assign(new Error("Seller contact is not available."), { status: 409 });
  if (listing.ownerParticipantId === participantId) throw Object.assign(new Error("You cannot collect Gems for contacting your own listing."), { status: 409 });
  const reward = withImmediateTransaction(database, () => awardGems(database, {
    participantId,
    amount: 1,
    reason: GEM_REASONS.marketplaceContact,
    sourceType: "marketplace_listing",
    sourceId: listing.id,
    now,
    dailyLimit: 3,
  }));
  return { reward, gemBalance: getGemAccount(database, participantId).balance };
}

export function processMarketplaceSale(database, seller, listingId, now, identitySecret) {
  const listing = database.prepare(`
    SELECT listing.id, post.feed_id AS feedId, post.author_key_hash AS authorKeyHash
    FROM marketplace_listings listing JOIN source_posts post ON post.id = listing.source_post_id
    WHERE listing.id = ? AND post.deleted = 0
  `).get(listingId);
  if (!listing) throw Object.assign(new Error("Marketplace Listing not found."), { status: 404 });
  if (listing.authorKeyHash !== hashSourceAuthor(listing.feedId, seller.external_subject, identitySecret)) {
    throw Object.assign(new Error("Only the source author can simulate a sold reply."), { status: 403 });
  }
  if (database.prepare("SELECT 1 FROM marketplace_sales WHERE listing_id = ?").get(listingId)) {
    throw Object.assign(new Error("Marketplace Listing is already sold."), { status: 409 });
  }
  const buyer = database.prepare(`
    SELECT participant_id AS participantId FROM gem_ledger
    WHERE reason = ? AND source_type = 'marketplace_listing' AND source_id = ? AND participant_id <> ?
    ORDER BY created_at DESC, id DESC LIMIT 1
  `).get(GEM_REASONS.marketplaceContact, listingId, seller.participant_id);
  if (!buyer) throw Object.assign(new Error("No eligible buyer contact was found for this listing."), { status: 409 });

  const result = withImmediateTransaction(database, () => {
    database.prepare("INSERT INTO marketplace_sales VALUES (?, ?, ?, ?)")
      .run(listingId, buyer.participantId, seller.participant_id, now.toISOString());
    const buyerReward = awardGems(database, {
      participantId: buyer.participantId, amount: 30, reason: GEM_REASONS.marketplaceSaleBuyer,
      sourceType: "marketplace_sale", sourceId: listingId, now, dailyLimit: 3, dailyReasons: saleReasons,
    });
    const sellerReward = awardGems(database, {
      participantId: seller.participant_id, amount: 30, reason: GEM_REASONS.marketplaceSaleSeller,
      sourceType: "marketplace_sale", sourceId: listingId, now, dailyLimit: 3, dailyReasons: saleReasons,
    });
    return { buyerReward, sellerReward };
  });
  return {
    sale: { listingId, buyerParticipantId: buyer.participantId, sellerParticipantId: seller.participant_id },
    ...result,
    gemBalance: getGemAccount(database, seller.participant_id).balance,
  };
}
