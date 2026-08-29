import { Router } from "express";
import { buffetFeed } from "../services/buffetService.js";
import { buffetPostStates, listPersistedBuffetPosts } from "../services/buffetAlertService.js";

export function buffetRoutes({ database, clock }) {
  const router = Router();
  router.get("/", (request, response) => response.json(buffetFeed(
    listPersistedBuffetPosts(database), request.query, clock.now(), buffetPostStates(database),
  )));
  return router;
}
