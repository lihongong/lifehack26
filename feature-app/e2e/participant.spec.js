import { test, expect } from "@playwright/test";

async function launchFromUnivus(page) {
  await page.goto("/univus/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: /Open Hackathon App/ }).click();
  const app = await popupPromise;
  await app.waitForURL((url) => url.pathname === "/" || url.pathname === "/profile/setup");
  return app;
}

test("uNivUS handoff awards exactly once per Singapore day across devices", async ({ page, browser }) => {
  await page.request.post("/api/dev/reset");
  await page.request.post("/api/dev/clock", { data: { now: "2026-08-29T15:59:00Z" } });
  const app = await launchFromUnivus(page);
  await expect(app).toHaveURL(/\/profile\/setup$/);
  await app.getByLabel("Public display name").fill("Campus Bryan");
  await app.getByLabel("Private NUS Zone").selectOption("medicine-kent-ridge");
  await app.getByRole("button", { name: "Complete profile" }).click();
  await expect(app.getByText("5 Gems")).toBeVisible();

  const secondContext = await browser.newContext();
  const secondHomepage = await secondContext.newPage();
  const secondApp = await launchFromUnivus(secondHomepage);
  await secondApp.goto("/profile");
  await expect(secondApp.getByText("5 Gems")).toBeVisible();

  await app.request.post("/api/dev/clock", { data: { now: "2026-08-29T16:00:00Z" } });
  await secondApp.reload();
  await expect(secondApp.getByText("10 Gems")).toBeVisible();
  await expect(secondApp.getByText(/Daily login award/)).toHaveCount(2);

  const publicUrl = await secondApp.getByRole("link", { name: "View public profile" }).getAttribute("href");
  const anonymousContext = await browser.newContext();
  const publicPage = await anonymousContext.newPage();
  await publicPage.goto(publicUrl);
  await expect(publicPage.getByRole("heading", { name: "Campus Bryan" })).toBeVisible();
  await expect(publicPage.getByText("NUS verified")).toBeVisible();
  await expect(publicPage.getByText(/example\.nus\.edu\.sg/)).toHaveCount(0);
  await expect(publicPage.getByText(/Gems|Gem Ledger|Kent Ridge/)).toHaveCount(0);
  await anonymousContext.close();
  await secondContext.close();
});

test("Participant profile is discoverable and responsive", async ({ page }) => {
  await page.request.post("/api/dev/reset");
  await page.setViewportSize({ width: 320, height: 800 });
  const app = await launchFromUnivus(page);
  await app.setViewportSize({ width: 320, height: 800 });

  const incompleteProfileLink = app.getByRole("link", { name: "Profile", exact: true });
  await expect(incompleteProfileLink).toBeVisible();
  await expect(incompleteProfileLink.getByText("Complete profile", { exact: true })).toBeVisible();
  await incompleteProfileLink.click();
  await expect(app).toHaveURL(/\/profile\/setup$/);

  await app.getByLabel("Public display name").fill("Alexandria Campus ParticipantX");
  await app.getByLabel("Private NUS Zone").selectOption("medicine-kent-ridge");
  await app.getByRole("button", { name: "Complete profile" }).click();
  await app.goto("/");

  for (const viewport of [{ width: 320, height: 800 }, { width: 430, height: 900 }]) {
    await app.setViewportSize(viewport);
    const header = app.locator(".app-header");
    const brand = header.getByRole("link", { name: "NUS Exchange home" });
    const operator = header.getByRole("link", { name: "Operator" });
    const profile = header.getByRole("link", { name: "Profile", exact: true });
    await expect(brand).toBeVisible();
    await expect(operator).toBeVisible();
    await expect(profile).toBeVisible();
    const [headerBox, brandBox, operatorBox, profileBox] = await Promise.all([
      header.boundingBox(), brand.boundingBox(), operator.boundingBox(), profile.boundingBox(),
    ]);
    expect(brandBox.x + brandBox.width).toBeLessThan(operatorBox.x);
    expect(operatorBox.x + operatorBox.width).toBeLessThan(profileBox.x);
    expect(profileBox.x + profileBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width);
  }

  const profileLink = app.getByRole("link", { name: "Profile", exact: true });
  await expect(profileLink.getByText("Alexandria Campus ParticipantX", { exact: true })).toBeVisible();
  await profileLink.focus();
  await expect(profileLink).toBeFocused();
  await app.evaluate(() => { window.__profileNavigationSentinel = true; });
  await profileLink.click();
  await expect(app).toHaveURL(/\/profile$/);
  expect(await app.evaluate(() => window.__profileNavigationSentinel)).toBe(true);
});
