import { Router } from "express";
import { findListings } from "../services/listingsService.js";
const router = Router();
router.get("/", (req, res) =>
  res.json({
    listings: findListings({ query: req.query.query, category: req.query.category, sort: req.query.sort }),
  }),
);
export default router;
