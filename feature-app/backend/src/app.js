import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import listingsRoutes from "./routes/listingsRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use("/api/listings", listingsRoutes);
app.use(express.static(join(backendRoot, "../frontend/dist")));
app.get("*splat", (_request, response) =>
  response.sendFile(join(backendRoot, "../frontend/dist/index.html")),
);
app.use(errorHandler);
export default app;
