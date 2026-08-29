import { Router } from "express";
import { findListings } from "../services/listingsService.js";
import { hiddenListingIds } from "../services/moderationService.js";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { awardMarketplaceContact } from "../services/marketplaceRewardService.js";
import { replayDemoSoldReply } from "../sourceFeeds/telegramFixtureAdapter.js";
import { hashSourceAuthor } from "../sourceFeeds/sourceFeedDomain.js";

export function listingsRoutes({ database, clock, environment, sourceIdentitySecret }) {
  const router = Router();
  router.get("/", (req, res) => res.json({ listings: findListings(
    database,
    { query: req.query.query, category: req.query.category, sort: req.query.sort },
    hiddenListingIds(database),
    { now: clock.now(), viewer: req.participant, identitySecret: sourceIdentitySecret, demoSoldEnabled: environment !== "production" },
  ) }));
  router.post("/:listingId/contact-reward", requireParticipant, (req, res) => {
    const listing = findListings(database, {}, hiddenListingIds(database), {
      now: clock.now(), includeInternal: true, viewer: req.participant, identitySecret: sourceIdentitySecret,
    }).find(({ id }) => id === req.params.listingId);
    if (!listing) return res.status(404).json({ error: "Marketplace Listing not found." });
    listing.ownerParticipantId = listing.origin === "manual" ? listing.createdByParticipantId
      : listing.authorKeyHash === hashSourceAuthor(listing.feedId, req.participant.external_subject, sourceIdentitySecret)
        ? req.participant.participant_id : null;
    res.json(awardMarketplaceContact(database, req.participant.participant_id, listing, clock.now()));
  });
  if (environment !== "production") router.post("/:listingId/demo-sold", requireParticipant, (req, res) => res.json(
    replayDemoSoldReply(database, req.params.listingId, req.participant, clock.now(), sourceIdentitySecret),
  ));
  return router;
}
