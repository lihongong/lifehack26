import { test, expect } from "@playwright/test";

async function launchAs(page, identity, displayName) {
  const response = await page.request.post("/api/integrations/univus/launch", { headers: { "x-demo-identity": identity } });
  const { launchUrl } = await response.json();
  await page.goto(launchUrl);
  if (new URL(page.url()).pathname === "/profile/setup") {
    await page.getByLabel("Public display name").fill(displayName);
    await page.getByRole("button", { name: "Complete profile" }).click();
  }
}

test("Operator manages a Moderator who reverses a self-directed Marketplace action", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await launchAs(page, "operator", "Platform Olivia");

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await launchAs(moderatorPage, "moderator", "Moderator Morgan");

  await page.goto("/operator");
  await page.getByLabel("Participant email").fill("moderator@example.nus.edu.sg");
  await page.getByLabel("Reason", { exact: true }).fill("Trusted campus operations volunteer");
  await page.getByRole("button", { name: "Enroll Moderator" }).click();
  await expect(page.getByRole("status")).toHaveText("Moderator enrolled.");

  const forbiddenAudit = await moderatorPage.request.get("/api/operator/audit");
  expect(forbiddenAudit.status()).toBe(403);
  await moderatorPage.goto("/moderation/marketplace");
  const calculator = moderatorPage.locator("li").filter({ hasText: "TI-84 Plus calculator" });
  await calculator.getByLabel("Reason").fill("Reviewing my own outdated source post");
  await calculator.getByRole("button", { name: "Hide listing" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("hidden");

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/");
  await expect(publicPage.getByRole("heading", { name: "TI-84 Plus calculator" })).toHaveCount(0);

  await calculator.getByLabel("Reason").fill("Review complete and listing is current");
  await calculator.getByRole("button", { name: "Restore listing" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("restored");

  await page.reload();
  const hiddenAudit = page.locator(".audit-log li").filter({ hasText: "Marketplace Listing Hidden" });
  await expect(hiddenAudit.getByText("Self-directed")).toBeVisible();
  const moderator = page.locator(".management-list li").filter({ hasText: "moderator@example.nus.edu.sg" });
  await moderator.getByLabel("Removal reason").fill("Moderator rotation completed");
  await moderator.getByRole("button", { name: "Remove Moderator" }).click();
  await expect(page.getByRole("status")).toContainText("sessions revoked");

  await moderatorPage.reload();
  await expect(moderatorPage).toHaveURL(/\/$/);
  expect((await moderatorPage.request.get("/api/moderation/marketplace")).status()).toBe(401);
  await publicContext.close();
  await moderatorContext.close();
});
