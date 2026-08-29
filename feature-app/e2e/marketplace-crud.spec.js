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

async function enrollModerator(operatorPage, moderatorPage) {
  await launchAs(operatorPage, "operator", "Platform Olivia");
  await launchAs(moderatorPage, "moderator", "Moderator Morgan");
  await operatorPage.goto("/operator");
  await operatorPage.getByLabel("Participant email").fill("moderator@example.nus.edu.sg");
  await operatorPage.getByLabel("Reason", { exact: true }).fill("Trusted Marketplace operations volunteer");
  await operatorPage.getByRole("button", { name: "Enroll Moderator" }).click();
  await expect(operatorPage.getByRole("status")).toHaveText("Moderator enrolled.");
}

test("Moderator creates and deletes a manual Marketplace Listing", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  const moderatorContext = await browser.newContext({ viewport: page.viewportSize() });
  const moderatorPage = await moderatorContext.newPage();
  await enrollModerator(page, moderatorPage);

  await moderatorPage.goto("/moderation/marketplace");
  const form = moderatorPage.locator(".manual-listing-form");
  await expect(form).toBeVisible();
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const categoryBounds = await moderatorPage.getByLabel("Listing category").boundingBox();
  const priceBounds = await moderatorPage.getByLabel("Whole SGD price").boundingBox();
  if (page.viewportSize().width <= 430) expect(priceBounds.y - categoryBounds.y).toBeGreaterThan(20);
  else expect(Math.abs(priceBounds.y - categoryBounds.y)).toBeLessThan(8);
  await moderatorPage.getByLabel("Listing title").fill("Desk fan");
  await moderatorPage.getByLabel("Listing category").selectOption("Room & Living");
  await moderatorPage.getByLabel("Whole SGD price").fill("24");
  await moderatorPage.getByLabel("Public description", { exact: true }).fill("Quiet USB desk fan in good working condition.");
  await moderatorPage.getByLabel("Publication reason").fill("Verified community submission");
  await moderatorPage.getByRole("button", { name: "Publish manual listing" }).click();
  await expect(moderatorPage.getByRole("status")).toHaveText("Desk fan published.");

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/");
  await expect(publicPage.getByRole("heading", { name: "Desk fan" })).toBeVisible();
  await expect(publicPage.getByText("Added by a Community Exchange Moderator")).toBeVisible();

  const listing = moderatorPage.locator("li").filter({ hasText: "Desk fan" });
  await listing.getByLabel("Deletion reason").fill("Item is no longer available");
  await listing.getByRole("button", { name: "Delete manual listing" }).click();
  await expect(moderatorPage.getByRole("status")).toHaveText("Desk fan deleted.");
  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { name: "Desk fan" })).toHaveCount(0);

  await moderatorContext.close();
  await publicContext.close();
});
