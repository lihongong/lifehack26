import { createApp } from "./app.js";
import { createDatabase } from "./db/database.js";
import { createClock } from "./services/clock.js";
import { replaySourceFixture } from "./sourceFeeds/telegramFixtureAdapter.js";

const environment = process.env.NODE_ENV || "development";
const sourceIdentitySecret = process.env.SOURCE_ID_HASH_SECRET || (environment === "production" ? "" : "fictional-source-fixture-secret");
const database = createDatabase();
const clock = createClock();
if (environment !== "production" && database.prepare("SELECT 1 FROM processed_source_updates LIMIT 1").get() == null) {
  replaySourceFixture(database, "marketplace-baseline", { identitySecret: sourceIdentitySecret });
}
const app = createApp({ database, clock, environment, sourceIdentitySecret });
const port = Number(process.env.PORT || 3000);
app.listen(port, "127.0.0.1", () =>
  console.log(`NUS Exchange backend listening on http://127.0.0.1:${port}`),
);
