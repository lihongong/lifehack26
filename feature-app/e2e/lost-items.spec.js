import { test, expect } from "@playwright/test";

async function launchAs(page, identity, displayName, acceptPolicies = true) {
  const response = await page.request.post("/api/integrations/univus/launch", { headers: { "x-demo-identity": identity } });
  const { launchUrl } = await response.json();
  await page.goto(launchUrl);
  if (new URL(page.url()).pathname === "/profile/setup") {
    await page.getByLabel("Public display name").fill(displayName);
    await page.getByRole("button", { name: "Complete profile" }).click();
  }
  if (acceptPolicies) {
    const { policies } = await (await page.request.get("/api/policies/active")).json();
    const versionIds = policies.filter(({ accepted }) => !accepted).map(({ id }) => id);
    if (versionIds.length) await page.request.post("/api/me/policy-acceptances", { data: { versionIds } });
  }
}

const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("Participant submission becomes a sanitized public Lost-Item Post and withdrawal removes every public surface", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await launchAs(page, "participant", "Lost Item Author");
  await page.goto("/lost-and-found");
  await expect(page.getByRole("heading", { name: "Lost & Found" })).toBeVisible();
  await expect(page.getByText("Fictional demo post")).toHaveCount(1);
  await page.getByRole("button", { name: /I lost something/ }).click();

  const form = page.locator("#lost-item-form");
  await form.getByLabel("Category").selectOption("Bags");
  await form.getByLabel("Lost date").fill("2026-08-29");
  await form.getByLabel("NUS Zone").selectOption("utown");
  await form.getByLabel(/What did you lose/).fill("ORIGINAL-E2E-CANARY navy bag left near the study spaces after lunch.");
  await form.getByLabel(/Private identifying details/i).fill("PRIVATE-E2E-CANARY contains a unique fictional ownership marker.");
  await form.getByLabel(/^Photos/).setInputFiles({ name: "FILENAME-E2E-CANARY.png", mimeType: "image/png", buffer: onePixelPng });
  await form.getByRole("button", { name: "Submit lost-item post" }).click();
  await expect(page.getByRole("status")).toContainText("submitted privately");
  await expect(page.getByText("pending review", { exact: true })).toBeVisible();

  const operatorContext = await browser.newContext();
  const operatorPage = await operatorContext.newPage();
  await launchAs(operatorPage, "operator", "Operator Olive", false);
  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await launchAs(moderatorPage, "moderator", "Review Morgan", false);
  expect((await operatorPage.request.post("/api/operator/moderators", { data: { email: "moderator@example.nus.edu.sg", reason: "Review Lost-Item fixture workflow." } })).status()).toBe(201);

  await moderatorPage.goto("/moderation/marketplace");
  const reviewCard = moderatorPage.locator(".lost-item-review-list > li").filter({ hasText: "ORIGINAL-E2E-CANARY" });
  await expect(reviewCard.getByText("PRIVATE-E2E-CANARY", { exact: false })).toBeVisible();
  await expect(reviewCard.getByRole("img", { name: /awaiting visual review/ })).toBeVisible();
  await reviewCard.getByLabel("Sanitized public description").fill("Navy bag reported lost near the UTown study spaces after lunch.");
  await reviewCard.getByLabel("Immutable review reason").fill("Sanitized text and approved the metadata-free photo.");
  await reviewCard.getByRole("button", { name: "Publish sanitized post" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("published");

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/lost-and-found");
  await publicPage.getByRole("searchbox", { name: "Search Lost-Item Posts" }).fill("navy bag");
  const publicCard = publicPage.locator(".lost-item-card").filter({ hasText: "Navy bag reported lost" });
  await expect(publicCard).toBeVisible();
  await expect(publicCard.getByRole("img", { name: /lost bags item/ })).toBeVisible();
  await expect(publicPage.getByText(/ORIGINAL-E2E-CANARY|PRIVATE-E2E-CANARY|FILENAME-E2E-CANARY/)).toHaveCount(0);
  const publicPayload = JSON.stringify(await (await publicPage.request.get("/api/lost-item-posts?query=navy%20bag")).json());
  expect(publicPayload).not.toContain("E2E-CANARY");
  const photoUrl = (await (await publicPage.request.get("/api/lost-item-posts?query=navy%20bag")).json()).posts[0].photos[0].url;

  const reporterContext = await browser.newContext();
  const reporterPage = await reporterContext.newPage();
  await launchAs(reporterPage, "reporter", "Reporter Rowan");
  await reporterPage.goto("/lost-and-found");
  const reporterCard = reporterPage.locator(".lost-item-card").filter({ hasText: "Navy bag reported lost" });
  await reporterCard.getByRole("button", { name: "Show Comments" }).click();
  await reporterCard.getByLabel("Add a Comment").fill("I may have seen this near the UTown entrance.");
  await reporterCard.getByRole("button", { name: "Post Comment" }).click();
  await expect(reporterCard.getByText("I may have seen this")).toBeVisible();
  await reporterCard.getByRole("button", { name: "Report Lost-Item Post" }).click();
  await reporterCard.getByRole("button", { name: "Submit Content Report" }).click();
  await expect(reporterCard.getByRole("status")).toContainText("sent to Moderators");

  await page.reload();
  await page.getByRole("button", { name: /I lost something/ }).click();
  const mine = page.locator(".my-lost-items li").filter({ hasText: "ORIGINAL-E2E-CANARY" });
  await mine.getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByRole("status")).toContainText("withdrawn");
  await publicPage.reload();
  await expect(publicPage.getByText("Navy bag reported lost")).toHaveCount(0);
  expect((await publicPage.request.get(photoUrl)).status()).toBe(404);

  await reporterContext.close();
  await publicContext.close();
  await moderatorContext.close();
  await operatorContext.close();
});
