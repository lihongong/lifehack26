import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start --prefix ../backend",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: { NODE_ENV: "test", DATABASE_PATH: ":memory:", PLATFORM_OPERATOR_SUBJECT: "mock-univus-bryan-001", BUFFET_DEMO_ANCHOR: "2026-08-30T04:00:00Z" },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
