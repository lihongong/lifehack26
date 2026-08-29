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

test("Operator gates and Moderator consent and discrepancy review protect a Source Feed", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await launchAs(page, "operator", "Platform Olivia");
  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await launchAs(moderatorPage, "moderator", "Moderator Morgan");

  await page.goto("/operator");
  await page.getByLabel("Participant email").fill("moderator@example.nus.edu.sg");
  await page.getByLabel("Reason", { exact: true }).fill("Trusted Source Feed Moderator");
  await page.getByRole("button", { name: "Enroll Moderator" }).click();

  await page.getByLabel("Written permission approved").check();
  await page.getByLabel("Permission evidence reference").fill("permission-evidence-e2e");
  await page.getByLabel("Privacy review approved").check();
  await page.getByLabel("Privacy review reference").fill("privacy-review-e2e");
  await page.getByLabel("Live ingestion explicitly enabled").check();
  await page.getByLabel("Gate change reason").fill("Approved all Source Feed operating gates");
  await page.getByRole("button", { name: "Save Source Feed gates" }).click();
  await expect(page.getByRole("status")).toContainText("gates updated");
  await expect(page.getByText(/Live enabled/)).toBeVisible();

  await moderatorPage.goto("/moderation/marketplace");
  await moderatorPage.getByLabel("Private source author id").fill("fixture-author-lamp");
  await moderatorPage.getByLabel("Consented display name").fill("Lamp Fixture Author");
  await moderatorPage.getByLabel("Allow public contact link").check();
  await moderatorPage.getByLabel("Consented HTTPS contact URL").fill("https://t.me/lamp_fixture_unavailable");
  await moderatorPage.getByLabel("Private evidence reference").fill("consent-evidence-e2e");
  await moderatorPage.getByLabel("Consent reason").fill("Recorded fictional author consent");
  await moderatorPage.getByRole("button", { name: "Record consent" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("consent recorded");

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/");
  const lamp = publicPage.locator(".listing-card").filter({ hasText: "Adjustable study lamp" });
  await expect(lamp.getByText("By Lamp Fixture Author")).toBeVisible();
  await expect(lamp.getByRole("link", { name: /Message source author on Telegram/ })).toHaveAttribute("href", "https://t.me/lamp_fixture_unavailable");

  await moderatorPage.request.post("/api/dev/source-feeds/replay", { data: { fixture: "marketplace-conflict" } });
  await moderatorPage.reload();
  const discrepancy = moderatorPage.locator(".moderation-list li").filter({ hasText: "Stale Revision" });
  await expect(discrepancy).toBeVisible();
  await discrepancy.getByLabel("Resolution reason").fill("Stored calculator version is newer");
  await discrepancy.getByRole("button", { name: "Retain current" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("retained");

  const consent = moderatorPage.locator(".management-list li").filter({ hasText: "Lamp Fixture Author" });
  await consent.getByLabel("Withdrawal reason").fill("Fixture author withdrew consent");
  await consent.getByRole("button", { name: "Withdraw consent and remove content" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("content removed");
  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { name: "Adjustable study lamp" })).toHaveCount(0);

  await publicContext.close();
  await moderatorContext.close();
});
