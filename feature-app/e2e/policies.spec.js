import { test, expect } from "@playwright/test";

async function launchAndOnboard(page) {
  await page.goto("/univus/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: /Open Hackathon App/ }).click();
  const app = await popupPromise;
  await app.waitForURL(/\/profile\/setup$/);
  await app.getByLabel("Public display name").fill("Policy Participant");
  await app.getByRole("button", { name: "Complete profile" }).click();
  await expect(app).toHaveURL(/\/profile$/);
  return app;
}

test("policy acceptance gates protected actions and scoped renewal preserves public browsing", async ({ page }) => {
  await page.request.post("/api/dev/reset");
  const app = await launchAndOnboard(page);

  await app.getByRole("button", { name: "Comments" }).click();
  await expect(app).toHaveURL(/\/policies\?action=comments/);
  await expect(app.getByRole("heading", { name: "Review community policies" })).toBeVisible();
  await expect(app.getByRole("status").filter({ hasText: "Acceptance required to continue with Comments" })).toBeVisible();
  await expect(app.getByRole("button", { name: "Accept and continue" })).toBeDisabled();

  await app.getByLabel(/accept these Terms/).check();
  await expect(app.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
  await app.getByLabel(/accept this Privacy Notice/).check();
  await app.getByRole("button", { name: "Accept and continue" }).click();
  await expect(app).toHaveURL(/\/profile\?retryAction=comments/);
  await expect(app.getByRole("status").filter({ hasText: "Comments is ready" })).toBeVisible();

  const initialHistory = app.locator(".acceptance-history");
  await expect(initialHistory.getByText(/Terms · version 2026-08-29/)).toBeVisible();
  await expect(initialHistory.getByText(/Privacy · version 2026-08-29/)).toBeVisible();

  await app.request.post("/api/dev/policies/activate", { data: { type: "terms", version: "2026-09-15" } });
  await app.getByRole("button", { name: "Claims" }).click();
  await expect(app.getByRole("status").filter({ hasText: "Claims is ready" })).toBeVisible();

  await app.goto("/");
  await expect(app.getByRole("heading", { name: "Marketplace listings" })).toBeVisible();
  await app.goto("/profile");
  await app.getByRole("button", { name: "Comments" }).click();
  await expect(app).toHaveURL(/\/policies\?action=comments/);
  await expect(app.getByText("VERSION 2026-09-15")).toBeVisible();
  await expect(app.getByText("Already accepted")).toHaveCount(1);
  await expect(app.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
  await app.getByLabel(/accept these Terms/).check();
  await app.getByRole("button", { name: "Accept and continue" }).click();

  await expect(app.getByRole("status").filter({ hasText: "Comments is ready" })).toBeVisible();
  const renewedHistory = app.locator(".acceptance-history");
  await expect(renewedHistory.getByText(/Terms · version 2026-09-15/)).toBeVisible();
  await expect(renewedHistory.locator("li")).toHaveCount(3);
});

test("anonymous protected actions expose an accessible rejection while Marketplace remains public", async ({ page }) => {
  await page.request.post("/api/dev/reset");
  const response = await page.request.post("/api/protected-actions/posting");
  expect(response.status()).toBe(401);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketplace listings" })).toBeVisible();
});
