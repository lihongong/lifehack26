import { Router } from "express";
import { buffetFeed } from "../services/buffetService.js";

export function buffetRoutes({ posts, clock }) {
  const router = Router();
  router.get("/", (request, response) => response.json(buffetFeed(posts, request.query, clock.now())));
  return router;
}
