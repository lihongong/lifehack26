import { createApp } from "./app.js";
import { createDatabase } from "./db/database.js";
import { createClock } from "./services/clock.js";
import { replaySourceFixture, seedDemoMarketplaceConsents, seedDemoMarketplaceRewards } from "./sourceFeeds/telegramFixtureAdapter.js";
import { createLostItemCipher, DEMO_LOST_ITEM_PRIVATE_DATA_KEY } from "./services/lostItemCrypto.js";
import { seedLostItemFixtures } from "./services/lostItemFixture.js";
import { seedCustodyLocation } from "./services/foundItemService.js";

const environment = process.env.NODE_ENV || "development";
const sourceIdentitySecret = process.env.SOURCE_ID_HASH_SECRET || (environment === "production" ? "" : "fictional-source-fixture-secret");
const lostItemPrivateDataKey = process.env.LOST_ITEM_PRIVATE_DATA_KEY ||
  (environment === "production" ? "" : DEMO_LOST_ITEM_PRIVATE_DATA_KEY);
const database = createDatabase();
const clock = createClock();
if (environment !== "production") replaySourceFixture(database, "marketplace-baseline", { identitySecret: sourceIdentitySecret });
if (environment !== "production") seedDemoMarketplaceConsents(database, sourceIdentitySecret);
if (environment !== "production") seedDemoMarketplaceRewards(database, sourceIdentitySecret);
if (environment !== "production") seedLostItemFixtures(database, createLostItemCipher(lostItemPrivateDataKey));
if (environment !== "production") seedCustodyLocation(database);
const app = createApp({ database, clock, environment, sourceIdentitySecret, lostItemPrivateDataKey });
const port = Number(process.env.PORT || 3000);
app.listen(port, "127.0.0.1", () =>
  console.log(`ShareNUS listening on http://127.0.0.1:${port}`),
);
