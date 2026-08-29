import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.PLAYWRIGHT_TEST_PORT || "3000";

export default defineConfig({
  testDir: ".",
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${testPort}`, trace: "retain-on-failure" },
  webServer: {
    command: "node ../backend/src/server.js",
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: false,
    env: { NODE_ENV: "test", PORT: testPort, DATABASE_PATH: ":memory:", PLATFORM_OPERATOR_SUBJECT: "mock-univus-bryan-001", BUFFET_DEMO_ANCHOR: "2026-08-30T04:00:00Z" },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
