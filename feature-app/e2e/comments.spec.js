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

test("Participants discuss a Marketplace Listing with privacy warning and removed-parent placeholder", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await launchAs(page, "participant", "Comment Casey");
  await page.goto("/");

  const calculator = page.locator(".listing-card").filter({ hasText: "TI-84 Plus calculator" });
  await calculator.getByRole("button", { name: "Show Comments" }).click();
  await calculator.getByLabel("Add a Comment").fill("Email me at casey@example.com");
  await calculator.getByRole("button", { name: "Post Comment" }).click();
  await expect(calculator.getByRole("alert")).toContainText("contact details");
  await calculator.getByRole("button", { name: "Share publicly" }).click();
  await expect(calculator.getByText("Email me at casey@example.com")).toBeVisible();

  const replierContext = await browser.newContext();
  const replierPage = await replierContext.newPage();
  await launchAs(replierPage, "moderator", "Reply Riley");
  await replierPage.goto("/");
  const replierCalculator = replierPage.locator(".listing-card").filter({ hasText: "TI-84 Plus calculator" });
  await replierCalculator.getByRole("button", { name: "Show Comments" }).click();
  await replierCalculator.getByRole("button", { name: "Reply to Comment Casey" }).click();
  await replierCalculator.getByLabel("Reply to Comment Casey").fill("The cover is included.");
  await replierCalculator.getByRole("button", { name: "Post Reply" }).click();
  await expect(replierCalculator.getByText("The cover is included.")).toBeVisible();

  await calculator.getByRole("button", { name: "Edit Comment" }).click();
  await calculator.getByRole("textbox", { name: "Edit Comment" }).fill("Contact details removed.");
  await calculator.getByRole("button", { name: "Save Comment" }).click();
  await expect(calculator.getByText("Edited")).toBeVisible();
  await calculator.getByRole("button", { name: "Delete Comment" }).click();
  await expect(calculator.getByText("Comment removed by author.")).toBeVisible();
  await expect(calculator.getByText("The cover is included.")).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("Reply Riley replied to your Comment.")).toBeVisible();
  await replierContext.close();
});
