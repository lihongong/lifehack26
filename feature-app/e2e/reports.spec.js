import { test, expect } from "@playwright/test";

async function launchAs(page, identity, displayName) {
  const response = await page.request.post("/api/integrations/univus/launch", {
    headers: { "x-demo-identity": identity },
  });
  const { launchUrl } = await response.json();
  await page.goto(launchUrl);
  if (new URL(page.url()).pathname === "/profile/setup") {
    await page.getByLabel("Public display name").fill(displayName);
    await page.getByRole("button", { name: "Complete profile" }).click();
  }
  const active = await page.request.get("/api/policies/active");
  const { policies } = await active.json();
  const unaccepted = policies.filter(({ accepted }) => !accepted).map(({ id }) => id);
  if (unaccepted.length) {
    await page.request.post("/api/me/policy-acceptances", { data: { versionIds: unaccepted } });
  }
}

test("Participant report reaches Moderator review, hides the Comment, and sends notifications", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await launchAs(page, "participant", "Author Arden");
  await page.goto("/");
  const authorCalculator = page.locator(".listing-card").filter({ hasText: "TI-84 Plus calculator" });
  await authorCalculator.getByRole("button", { name: "Show Comments" }).click();
  await authorCalculator.getByLabel("Add a Comment").fill("This Comment needs a safety review.");
  await authorCalculator.getByRole("button", { name: "Post Comment" }).click();
  await expect(authorCalculator.getByText("This Comment needs a safety review.")).toBeVisible();
  const commentComposer = authorCalculator.getByLabel("Add a Comment");
  await expect(commentComposer).toHaveValue("");
  await commentComposer.fill("This second Comment needs direct moderation.");
  await authorCalculator.getByRole("button", { name: "Post Comment" }).click();
  await expect(authorCalculator.getByText("This second Comment needs direct moderation.")).toBeVisible();

  const reporterContext = await browser.newContext();
  const reporterPage = await reporterContext.newPage();
  await launchAs(reporterPage, "reporter", "Reporter Robin");
  await reporterPage.goto("/");
  const reporterCalculator = reporterPage.locator(".listing-card").filter({ hasText: "TI-84 Plus calculator" });
  await reporterCalculator.getByRole("button", { name: "Show Comments" }).click();
  const reportedComment = reporterCalculator.locator(".comment-item").filter({ hasText: "This Comment needs a safety review." });
  await reportedComment.getByRole("button", { name: "Report Comment by Author Arden" }).click();
  await reportedComment.getByLabel("Report reason").selectOption("safety");
  await reportedComment.getByRole("button", { name: "Submit Content Report" }).click();
  await expect(reportedComment.getByRole("status")).toContainText("sent to Moderators");

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await launchAs(moderatorPage, "moderator", "Moderator Morgan");
  const operatorContext = await browser.newContext();
  const operatorPage = await operatorContext.newPage();
  await launchAs(operatorPage, "operator", "Platform Olivia");
  await operatorPage.request.post("/api/operator/moderators", {
    data: { email: "moderator@example.nus.edu.sg", reason: "Content safety review" },
  });

  await moderatorPage.goto("/moderation/marketplace");
  const report = moderatorPage.locator(".report-list li").filter({ hasText: "This Comment needs a safety review." });
  await expect(report.getByText("Safety", { exact: true })).toBeVisible();
  await report.getByLabel("Resolution reason").fill("Unsafe guidance should not remain public");
  await report.getByRole("button", { name: "Hide content" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("Content hidden");

  const directComment = moderatorPage.locator(".comment-moderation-list li").filter({ hasText: "This second Comment needs direct moderation." });
  await directComment.getByLabel("Moderation reason").fill("Direct safety review");
  await directComment.getByRole("button", { name: "Hide Comment" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("Comment hidden");

  await reporterPage.goto("/profile");
  await expect(reporterPage.getByText(/Content Report was resolved/)).toBeVisible();
  await page.goto("/");
  const publicCalculator = page.locator(".listing-card").filter({ hasText: "TI-84 Plus calculator" });
  await publicCalculator.getByRole("button", { name: "Show Comments" }).click();
  await expect(publicCalculator.getByText("Comment hidden by a Moderator.")).toHaveCount(2);
  await page.goto("/profile");
  await expect(page.getByText("Your Comment was hidden by a Moderator.")).toHaveCount(2);

  await operatorContext.close();
  await moderatorContext.close();
  await reporterContext.close();
});
