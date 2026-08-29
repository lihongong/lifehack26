import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start --prefix ../backend",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: { NODE_ENV: "test", DATABASE_PATH: ":memory:", PLATFORM_OPERATOR_SUBJECT: "mock-univus-bryan-001" },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
