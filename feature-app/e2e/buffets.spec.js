import { test, expect } from "@playwright/test";

const anchor = "2026-08-30T04:00:00Z";

test("anonymous visitor searches and filters fresh Buffet Posts through expiry", async ({ page }) => {
  await page.request.post("/api/dev/reset");
  await page.request.post("/api/dev/clock", { data: { now: anchor } });
  await page.goto("/buffets");
  await expect(page.getByRole("heading", { name: "Fresh Buffet Posts" })).toBeVisible();
  await expect(page.getByText("Fictional Buffet Post").first()).toBeVisible();
  await expect(page.getByText("5 posts")).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search Buffet Posts" });
  await search.fill("vegetarian");
  await expect(page.getByRole("heading", { name: "Vegetarian bento boxes" })).toBeVisible();
  await expect(page.getByText("1 post")).toBeVisible();
  await search.fill("");

  const zone = page.getByRole("combobox", { name: "NUS Zone" });
  await zone.selectOption("science");
  await expect(page.getByRole("heading", { name: "Vegetarian bento boxes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sandwich platters" })).toHaveCount(0);
  await zone.selectOption("unclear");
  const unclearPost = page.getByRole("article").filter({ hasText: "Snack boxes near a red bridge" });
  await expect(unclearPost.getByText("Location unclear", { exact: true })).toBeVisible();
  await expect(unclearPost.getByRole("heading", { name: "Snack boxes near a red bridge" })).toBeVisible();

  await zone.selectOption("all");
  const freshness = page.getByRole("combobox", { name: "Freshness" });
  await freshness.selectOption("30");
  await expect(page.getByText("3 posts")).toBeVisible();
  await freshness.selectOption("60");
  await expect(page.getByText("4 posts")).toBeVisible();
  await freshness.selectOption("active");
  await expect(page.getByText("5 posts")).toBeVisible();
  await expect(page.getByText(/Two-hour fallback because no deadline was stated/).first()).toBeVisible();

  await page.request.post("/api/dev/clock", { data: { now: "2026-08-30T04:50:00Z" } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pastries and fruit cups" })).toHaveCount(0);
  await page.request.post("/api/dev/reset");
});
