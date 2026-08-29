import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import listingsRoutes from "./routes/listingsRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { devRoutes } from "./routes/devRoutes.js";
import { integrationRoutes } from "./routes/integrationRoutes.js";
import { profileRoutes } from "./routes/profileRoutes.js";
import { policyRoutes } from "./routes/policyRoutes.js";
import { protectedActionRoutes } from "./routes/protectedActionRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { participantMiddleware } from "./middleware/requireParticipant.js";
import { createDatabase } from "./db/database.js";
import { createClock } from "./services/clock.js";
import { createUnivusAdapter } from "./integrations/univusAdapter.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const frontendDist = join(backendRoot, "../frontend/dist");
const mockHomepage = join(backendRoot, "../../uNivUS homepage");

export function createApp({ database = createDatabase(), clock = createClock(), environment = process.env.NODE_ENV || "development", univusAdapter = createUnivusAdapter(environment) } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(participantMiddleware({ database, clock }));
  app.use("/api/listings", listingsRoutes);
  app.use("/api/integrations", integrationRoutes({ database, clock, univusAdapter }));
  app.use("/api/auth", authRoutes({ database, clock, environment }));
  app.use("/api", profileRoutes({ database, clock }));
  app.use("/api", policyRoutes({ database, clock }));
  app.use("/api/protected-actions", protectedActionRoutes({ database }));
  app.use("/api/dev", devRoutes({ database, clock, environment }));
  if (environment !== "production") app.use("/univus", express.static(mockHomepage));
  app.use(express.static(frontendDist));
  app.get("*splat", (_request, response) => response.sendFile(join(frontendDist, "index.html")));
  app.use(errorHandler);
  return app;
}

export default createApp();
