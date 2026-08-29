import { test, expect } from "@playwright/test";
test("anonymous visitor can browse and filter Marketplace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketplace listings" })).toBeVisible();
  await expect(page.getByText("Fictional demo listing").first()).toBeVisible();
  await expect(page.getByText("FICTIONAL", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Source:/).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /Illustration of/ }).first()).toBeVisible();
  const searchBox = page.getByRole("searchbox", { name: "Search listings" });
  const category = page.getByRole("combobox", { name: "Category" });
  const sort = page.getByRole("combobox", { name: "Sort by" });
  const searchBounds = await searchBox.boundingBox();
  const categoryBounds = await category.boundingBox();
  const sortBounds = await sort.boundingBox();
  expect(searchBounds.y).toBeLessThan(categoryBounds.y);
  expect(Math.abs(categoryBounds.y - sortBounds.y)).toBeLessThan(8);
  await searchBox.fill("calculator");
  await expect(page.getByRole("heading", { name: "TI-84 Plus calculator" })).toBeVisible();
  await expect(page.getByText("1 listing")).toBeVisible();
  await Promise.all([page.waitForURL("**/buffets"), page.getByRole("link", { name: "Buffets" }).click()]);
  await expect(page.getByRole("heading", { name: "Fresh Buffet Posts" })).toBeVisible();
  await Promise.all([page.waitForURL("**/lost-and-found"), page.getByRole("link", { name: "Lost & Found" }).click()]);
  await expect(page.getByRole("heading", { name: "Lost & Found" })).toBeVisible();
});
test("public controls are keyboard accessible and profile handoff is available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open through uNivUS" })).toHaveAttribute("href", "/univus/");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await expect(page.getByRole("link", { name: /View original seller/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /WhatsApp/ }).first()).toHaveAttribute("href", /^https:\/\/wa\.me\/0000000000/);
  await expect(page.getByRole("link", { name: /Telegram/ }).first()).toHaveAttribute("href", "https://t.me/nus_exchange_demo_unavailable");
  await expect(page.locator(".listing-card").first().getByRole("link", { name: /WhatsApp|Telegram/ })).toHaveCount(1);
});

test("listing image has an accessible fallback", async ({ page }) => {
  await page.route("**/images/listings/*.svg", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Image unavailable").first()).toBeVisible();
});
