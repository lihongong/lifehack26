import { Router } from "express";
import { findListings } from "../services/listingsService.js";
import { hiddenListingIds } from "../services/moderationService.js";

export function listingsRoutes({ database }) {
  const router = Router();
  router.get("/", (req, res) =>
    res.json({
      listings: findListings(database, { query: req.query.query, category: req.query.category, sort: req.query.sort }, hiddenListingIds(database)),
    }),
  );
  return router;
}
