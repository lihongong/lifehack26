import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listingsRoutes } from "./routes/listingsRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { devRoutes } from "./routes/devRoutes.js";
import { integrationRoutes } from "./routes/integrationRoutes.js";
import { profileRoutes } from "./routes/profileRoutes.js";
import { policyRoutes } from "./routes/policyRoutes.js";
import { protectedActionRoutes } from "./routes/protectedActionRoutes.js";
import { privilegeRoutes } from "./routes/privilegeRoutes.js";
import { moderationRoutes } from "./routes/moderationRoutes.js";
import { commentRoutes } from "./routes/commentRoutes.js";
import { reportRoutes } from "./routes/reportRoutes.js";
import { lostItemRoutes } from "./routes/lostItemRoutes.js";
import { foundItemRoutes } from "./routes/foundItemRoutes.js";
import { buffetRoutes } from "./routes/buffetRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { participantMiddleware } from "./middleware/requireParticipant.js";
import { createDatabase } from "./db/database.js";
import { createClock } from "./services/clock.js";
import { createUnivusAdapter } from "./integrations/univusAdapter.js";
import { createDemoBuffetPosts } from "./data/demoBuffetPosts.js";
import { createLostItemCipher, DEMO_LOST_ITEM_PRIVATE_DATA_KEY } from "./services/lostItemCrypto.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const frontendDist = join(backendRoot, "../frontend/dist");
const mockHomepage = join(backendRoot, "../../uNivUS homepage");

export function createApp({
  database = createDatabase(),
  clock = createClock(),
  environment = process.env.NODE_ENV || "development",
  univusAdapter = createUnivusAdapter(environment),
  platformOperatorSubject = process.env.PLATFORM_OPERATOR_SUBJECT || "",
  sourceIdentitySecret = process.env.SOURCE_ID_HASH_SECRET ||
    (environment === "production" ? "" : "fictional-source-fixture-secret"),
  lostItemPrivateDataKey = process.env.LOST_ITEM_PRIVATE_DATA_KEY ||
    (environment === "production" ? "" : DEMO_LOST_ITEM_PRIVATE_DATA_KEY),
  buffetPosts,
  buffetAnchor,
} = {}) {
  const app = express();
  const lostItemCipher = createLostItemCipher(lostItemPrivateDataKey);
  const configuredAnchor = new Date(buffetAnchor || process.env.BUFFET_DEMO_ANCHOR || clock.now());
  const anchoredBuffetPosts =
    buffetPosts ||
    createDemoBuffetPosts(Number.isNaN(configuredAnchor.getTime()) ? clock.now() : configuredAnchor);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(participantMiddleware({ database, clock }));
  app.use("/api/listings", listingsRoutes({ database, clock }));
  app.use("/api/buffets", buffetRoutes({ posts: anchoredBuffetPosts, clock }));
  app.use("/api/integrations", integrationRoutes({ database, clock, univusAdapter }));
  app.use("/api/auth", authRoutes({ database, clock, environment, platformOperatorSubject }));
  app.use("/api", profileRoutes({ database, clock }));
  app.use("/api", policyRoutes({ database, clock }));
  app.use("/api/protected-actions", protectedActionRoutes({ database }));
  app.use("/api/operator", privilegeRoutes({ database, clock }));
  app.use("/api/moderation", moderationRoutes({ database, clock, sourceIdentitySecret, lostItemCipher }));
  app.use("/api", commentRoutes({ database, clock }));
  app.use("/api", reportRoutes({ database, clock }));
  app.use("/api", lostItemRoutes({ database, clock, lostItemCipher }));
  app.use("/api", foundItemRoutes({ database, clock, lostItemCipher }));
  app.use("/api/dev", devRoutes({ database, clock, environment, sourceIdentitySecret, lostItemCipher }));
  if (environment !== "production") app.use("/univus", express.static(mockHomepage));
  app.use(express.static(frontendDist));
  app.get("*splat", (_request, response) => response.sendFile(join(frontendDist, "index.html")));
  app.use(errorHandler);
  return app;
}
