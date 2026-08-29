import { test, expect } from "@playwright/test";

const anchor = "2026-08-30T04:00:00Z";

async function launchAs(page, identity, displayName) {
  const response = await page.request.post("/api/integrations/univus/launch", { headers: { "x-demo-identity": identity } });
  const { launchUrl } = await response.json();
  await page.goto(launchUrl);
  if (new URL(page.url()).pathname === "/profile/setup") {
    await page.getByLabel("Public display name").fill(displayName);
    await page.getByRole("button", { name: "Complete profile" }).click();
  }
  const active = await page.request.get("/api/policies/active");
  const { policies } = await active.json();
  const versionIds = policies.filter(({ accepted }) => !accepted).map(({ id }) => id);
  if (versionIds.length) await page.request.post("/api/me/policy-acceptances", { data: { versionIds } });
}

async function enableCentral(page) {
  await page.goto("/buffets");
  const zone = page.getByRole("combobox", { name: "Buffet Alert NUS Zone" });
  await expect(zone).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: "Enable Buffet Alerts" })).not.toBeChecked();
  await zone.selectOption("central");
  await page.getByRole("checkbox", { name: "Enable Buffet Alerts" }).check();
  await page.getByRole("button", { name: "Save Buffet Alert settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Buffet Alerts enabled" })).toBeVisible();
}

test("Participant enables deduplicated same-zone and Nearby Zone alerts and records helpful feedback", async ({ page }) => {
  await page.request.post("/api/dev/reset");
  await page.request.post("/api/dev/clock", { data: { now: anchor } });
  await launchAs(page, "participant", "Buffet Priya");
  await enableCentral(page);

  await expect(page.getByText("Matches a Nearby Zone")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Mark helpful" })).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Pastries and fruit cups" }).locator("..").getByRole("button", { name: "Mark helpful" })).toHaveCount(0);
  const before = await page.request.get("/api/buffet-alerts");
  expect((await before.json()).alerts).toHaveLength(3);
  await page.getByRole("button", { name: "Check for Buffet Alerts" }).click();
  await expect(page.getByRole("status").filter({ hasText: "up to date" })).toBeVisible();
  const after = await page.request.get("/api/buffet-alerts");
  expect((await after.json()).alerts).toHaveLength(3);

  const science = page.getByRole("article").filter({ hasText: "Vegetarian bento boxes" });
  await science.getByRole("button", { name: "Mark helpful" }).click();
  await expect(science.getByText("Helpful Alert recorded: helpful.")).toBeVisible();
  await page.goto("/profile");
  await expect(page.locator(".notifications li")).toHaveCount(3);
  await expect(page.locator(".notifications").getByText("Nearby Zone: Vegetarian bento boxes")).toBeVisible();
  await expect(page.getByText("0 Gems")).toBeVisible();
});

test("food-gone feedback suppresses delivery, a Moderator restores it, and the audit is visible", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await page.request.post("/api/dev/clock", { data: { now: anchor } });
  await launchAs(page, "participant", "Buffet Priya");
  await enableCentral(page);
  const science = page.getByRole("article").filter({ hasText: "Vegetarian bento boxes" });
  await science.getByRole("button", { name: "Report food gone" }).click();
  await expect(science.getByText(/Possibly gone/)).toBeVisible();

  const reporterContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  await launchAs(reporter, "reporter", "Buffet Rowan");
  await enableCentral(reporter);
  await expect(reporter.getByRole("article").filter({ hasText: "Vegetarian bento boxes" }).getByRole("button", { name: "Mark helpful" })).toHaveCount(0);

  const moderatorContext = await browser.newContext();
  const moderator = await moderatorContext.newPage();
  await launchAs(moderator, "moderator", "Moderator Morgan");
  const operatorContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  await launchAs(operator, "operator", "Platform Olivia");
  await operator.request.post("/api/operator/moderators", { data: { email: "moderator@example.nus.edu.sg", reason: "Buffet safety review" } });

  await moderator.goto("/moderation/marketplace");
  const review = moderator.locator(".buffet-review-list li").filter({ hasText: "Vegetarian bento boxes" });
  await expect(review.getByText("1 food-gone signal")).toBeVisible();
  await review.getByLabel(/Buffet review reason/).fill("Food remains available after a direct check");
  await review.getByRole("button", { name: "Restore Buffet Post" }).click();
  await expect(moderator.getByRole("status").filter({ hasText: "Buffet Post restored" })).toBeVisible();

  await operator.goto("/buffets");
  const operatorZone = operator.getByRole("combobox", { name: "Buffet Alert NUS Zone" });
  await operatorZone.selectOption("central");
  await operator.getByRole("checkbox", { name: "Enable Buffet Alerts" }).check();
  await operator.getByRole("button", { name: "Save Buffet Alert settings" }).click();
  await expect(operator.getByRole("article").filter({ hasText: "Vegetarian bento boxes" }).getByRole("button", { name: "Mark helpful" })).toBeVisible();
  await operator.goto("/operator");
  await expect(operator.locator(".audit-log li").filter({ hasText: "Buffet Post Restored" })).toBeVisible();

  await operatorContext.close();
  await moderatorContext.close();
  await reporterContext.close();
});

test("Moderator can confirm a reported Buffet Post expired through the visible review", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await page.request.post("/api/dev/clock", { data: { now: anchor } });
  await launchAs(page, "participant", "Buffet Priya");
  await enableCentral(page);
  const business = page.getByRole("article").filter({ hasText: "Sandwich platters" });
  await business.getByRole("button", { name: "Report food gone" }).click();

  const moderatorContext = await browser.newContext();
  const moderator = await moderatorContext.newPage();
  await launchAs(moderator, "moderator", "Moderator Morgan");
  const operatorContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  await launchAs(operator, "operator", "Platform Olivia");
  await operator.request.post("/api/operator/moderators", { data: { email: "moderator@example.nus.edu.sg", reason: "Buffet expiry review" } });
  await moderator.goto("/moderation/marketplace");
  const review = moderator.locator(".buffet-review-list li").filter({ hasText: "Sandwich platters" });
  await review.getByLabel(/Buffet review reason/).fill("Collection is confirmed complete");
  await review.getByRole("button", { name: "Confirm expired" }).click();
  await expect(moderator.getByRole("status").filter({ hasText: "confirmed expired" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sandwich platters" })).toHaveCount(0);
  await operator.goto("/operator");
  await expect(operator.locator(".audit-log li").filter({ hasText: "Buffet Post Expired" })).toBeVisible();
  await operatorContext.close();
  await moderatorContext.close();
});
