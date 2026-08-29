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

test("submission awards 20 Gems and physical handover preserves the report and Comments", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await launchAs(page, "participant", "Finder Fiona");
  await page.goto("/lost-and-found");
  await page.getByRole("button", { name: /I found something/ }).click();

  const form = page.locator("#found-item-report-form");
  await form.getByLabel("Found category").selectOption("Bags");
  await form.getByLabel("Found date").fill("2026-08-29");
  await form.getByLabel("Found NUS Zone").selectOption("utown");
  await form.getByLabel(/What did you find/).fill("FOUND-ORIGINAL-E2E-CANARY navy bag discovered beside the UTown study area.");
  await form.getByLabel(/Private identifying details/i).fill("FOUND-PRIVATE-E2E-CANARY unique fictional lining and keychain.");
  await form.getByLabel(/^Photos/).setInputFiles({ name: "FOUND-FILENAME-E2E-CANARY.png", mimeType: "image/png", buffer: onePixelPng });
  const submit = form.getByRole("button", { name: /Submit found-item report/ });
  await expect(submit.locator(".gem-amount")).toContainText("+20");
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: "submitted privately" })).toBeVisible();
  await expect(form.locator(".gem-reward-toast").filter({ hasText: "+20 Gems" })).toBeVisible();

  const operatorContext = await browser.newContext();
  const operatorPage = await operatorContext.newPage();
  await launchAs(operatorPage, "operator", "Operator Olive", false);
  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await launchAs(moderatorPage, "moderator", "Custodian Morgan", false);
  expect((await operatorPage.request.post("/api/operator/moderators", { data: { email: "moderator@example.nus.edu.sg", reason: "Authorize custody workflow review." } })).status()).toBe(201);

  await operatorPage.goto("/operator");
  const gate = operatorPage.locator("form.privileged-form").filter({ has: operatorPage.getByRole("heading", { name: "Custody procedure gate" }) });
  await gate.getByLabel("Custody procedure approved").check();
  await gate.getByLabel("Private evidence reference").fill("FOUND-CUSTODY-EVIDENCE-E2E-CANARY");
  await gate.getByLabel("Custody explicitly enabled").check();
  await gate.getByLabel("Reason for custody change").fill("Enable the staffed fictional custody procedure.");
  await gate.getByRole("button", { name: "Save custody gate" }).click();
  await expect(operatorPage.getByRole("status")).toContainText("Custody settings updated");

  await moderatorPage.goto("/moderation/marketplace");
  let custodyCard = moderatorPage.locator(".found-custody-list > li").filter({ hasText: "FOUND-ORIGINAL-E2E-CANARY" });
  await expect(custodyCard.getByText("FOUND-PRIVATE-E2E-CANARY", { exact: false })).toBeVisible();
  await custodyCard.getByLabel("Sanitized public description").fill("Navy bag reported found beside the UTown study area.");
  await custodyCard.getByLabel("Review reason").fill("Published a contact-free candidate and safe photo.");
  await custodyCard.getByRole("button", { name: "Approve report" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("approved publicly");

  const commenterContext = await browser.newContext();
  const commenterPage = await commenterContext.newPage();
  await launchAs(commenterPage, "reporter", "Commenter Casey");
  await commenterPage.goto("/lost-and-found");
  let publicCard = commenterPage.locator(".found-property-card").filter({ hasText: "Navy bag reported found" });
  await expect(publicCard).toBeVisible();
  await publicCard.getByRole("button", { name: "Show Comments" }).click();
  await publicCard.getByLabel("Add a Comment").fill("I can confirm this was near the UTown entrance.");
  await publicCard.getByRole("button", { name: "Post Comment" }).click();
  await expect(publicCard.getByText("I can confirm this was near")).toBeVisible();

  custodyCard = moderatorPage.locator(".found-custody-list > li").filter({ hasText: "FOUND-ORIGINAL-E2E-CANARY" });
  await custodyCard.getByLabel("Participant instructions").fill("FOUND-APPOINTMENT-E2E-CANARY ask for the private report reference.");
  await custodyCard.getByLabel("Appointment/closure reason").fill("Arrange a private physical handover.");
  await custodyCard.getByRole("button", { name: "Arrange private handover" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("Handover arranged");

  await page.reload();
  await page.getByRole("button", { name: /I found something/ }).click();
  await expect(page.getByText("Private handover appointment")).toBeVisible();
  await expect(page.getByText("FOUND-APPOINTMENT-E2E-CANARY", { exact: false })).toBeVisible();
  await commenterPage.reload();
  await expect(commenterPage.getByText(/FOUND-ORIGINAL-E2E-CANARY|FOUND-PRIVATE-E2E-CANARY|FOUND-APPOINTMENT-E2E-CANARY|FOUND-CUSTODY-EVIDENCE-E2E-CANARY/)).toHaveCount(0);

  custodyCard = moderatorPage.locator(".found-custody-list > li").filter({ hasText: "FOUND-ORIGINAL-E2E-CANARY" });
  await custodyCard.getByLabel("Private condition notes").fill("FOUND-CONDITION-E2E-CANARY minor internal scuff recorded privately.");
  await custodyCard.getByLabel("Intake reason").fill("Custodian confirmed physical possession.");
  await custodyCard.getByRole("button", { name: "Confirm physical intake" }).click();
  await expect(moderatorPage.getByRole("status")).toContainText("Physical intake recorded");

  await commenterPage.reload();
  await expect(commenterPage.locator(".found-property-card").filter({ hasText: "Awaiting handover" })).toHaveCount(0);
  publicCard = commenterPage.locator(".found-property-card").filter({ hasText: "In Custody" });
  await expect(publicCard.getByText("Navy bag reported found")).toBeVisible();
  await publicCard.getByRole("button", { name: "Show Comments" }).click();
  await expect(publicCard.getByText("I can confirm this was near")).toBeVisible();

  const publicPayload = JSON.stringify({
    reports: await (await commenterPage.request.get("/api/found-item-reports")).json(),
    items: await (await commenterPage.request.get("/api/found-items")).json(),
  });
  for (const canary of ["FOUND-ORIGINAL", "FOUND-PRIVATE", "FOUND-FILENAME", "FOUND-APPOINTMENT", "FOUND-CUSTODY-EVIDENCE", "FOUND-CONDITION", "Finder Fiona"]) {
    expect(publicPayload).not.toContain(canary);
  }

  await page.goto("/profile");
  await expect(page.getByText("Found-Item Report submission reward")).toBeVisible();
  await expect(page.getByText("+20")).toHaveCount(1);

  await commenterContext.close();
  await moderatorContext.close();
  await operatorContext.close();
});
