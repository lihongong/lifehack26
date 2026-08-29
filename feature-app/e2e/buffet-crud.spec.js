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
}

async function enrollModerator(operatorPage, moderatorPage) {
  await launchAs(operatorPage, "operator", "Platform Olivia");
  await launchAs(moderatorPage, "moderator", "Moderator Morgan");
  await operatorPage.goto("/operator");
  await operatorPage.getByLabel("Participant email").fill("moderator@example.nus.edu.sg");
  await operatorPage.getByLabel("Reason", { exact: true }).fill("Trusted Buffet operations volunteer");
  await operatorPage.getByRole("button", { name: "Enroll Moderator" }).click();
  await expect(operatorPage.getByRole("status")).toHaveText("Moderator enrolled.");
}

test("Moderator creates and deletes a manual Buffet Post", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await page.request.post("/api/dev/clock", { data: { now: anchor } });
  const moderatorContext = await browser.newContext({ viewport: page.viewportSize(), timezoneId: "America/Los_Angeles" });
  const moderatorPage = await moderatorContext.newPage();
  await enrollModerator(page, moderatorPage);

  await moderatorPage.goto("/moderation/marketplace");
  const form = moderatorPage.locator(".manual-buffet-form");
  await expect(form).toBeVisible();
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await moderatorPage.getByLabel("Buffet Post title").fill("Late seminar bentos");
  await moderatorPage.getByLabel("Buffet Post description").fill("Twelve sealed vegetarian bentos remain after the evening seminar.");
  await moderatorPage.getByLabel("Reported location").fill("LT27 foyer");
  await moderatorPage.getByLabel("Buffet Post NUS Zone").selectOption("science");
  await moderatorPage.getByLabel("Collection deadline").fill("2026-08-30T13:30");
  await moderatorPage.getByLabel("Reason for publishing Buffet Post").fill("Verified by the event organizer");
  await moderatorPage.getByRole("button", { name: "Publish Buffet Post" }).click();
  await expect(moderatorPage.getByRole("status").filter({ hasText: "Late seminar bentos published." })).toBeVisible();

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/buffets");
  const publicPost = publicPage.getByRole("article").filter({ hasText: "Late seminar bentos" });
  await expect(publicPost.getByRole("heading", { name: "Late seminar bentos" })).toBeVisible();
  await expect(publicPost.getByText("Added by a ShareNUS Moderator")).toBeVisible();
  await expect(publicPost.getByText(/Collect by 30 Aug 2026, 1:30 pm/)).toBeVisible();
  await expect(publicPost.getByText("Deadline set by a ShareNUS Moderator")).toBeVisible();
  await expect(publicPost.getByRole("button", { name: "Show Comments" })).toBeVisible();

  await moderatorPage.goto("/buffets");
  const moderatorPost = moderatorPage.getByRole("article").filter({ hasText: "Late seminar bentos" });
  await moderatorPost.getByRole("button", { name: "Show Comments" }).click();
  await moderatorPost.getByLabel("Add a Comment").fill("Are these bentos still available?");
  await moderatorPost.getByRole("button", { name: "Post Comment" }).click();
  await expect(moderatorPage).toHaveURL(/\/policies\?action=comments&returnTo=%2Fbuffets/);
  await moderatorPage.goto("/moderation/marketplace");

  const managedPost = moderatorPage.locator(".manual-buffet-list li").filter({ hasText: "Late seminar bentos" });
  await managedPost.getByLabel("Buffet deletion reason").fill("Collection has ended");
  await managedPost.getByRole("button", { name: "Delete manual Buffet Post" }).click();
  await expect(moderatorPage.getByRole("status").filter({ hasText: "Late seminar bentos deleted." })).toBeVisible();
  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { name: "Late seminar bentos" })).toHaveCount(0);

  await moderatorContext.close();
  await publicContext.close();
});
