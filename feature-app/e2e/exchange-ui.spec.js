import { test, expect } from "@playwright/test";

const feeds = [
  {
    path: "/",
    tab: "Marketplace",
    eyebrow: "BROWSE PUBLICLY",
    heading: "Marketplace listings",
    search: "Search listings",
  },
  {
    path: "/buffets",
    tab: "Buffets",
    eyebrow: "AVAILABLE NOW",
    heading: "Fresh buffet posts",
    search: "Search Buffet Posts",
  },
  {
    path: "/lost-and-found",
    tab: "Lost & Found",
    eyebrow: "SEARCH CAMPUS",
    heading: "Lost & Found",
    search: "Search Lost-Item Posts",
  },
];

test.beforeEach(async ({ request }) => {
  await request.post("/api/dev/reset");
});

test("exchange feeds share navigation, heading, filters, and card surfaces", async ({ page }) => {
  for (const feed of feeds) {
    await page.goto(feed.path);
    const activeTab = page.getByRole("link", { name: feed.tab, exact: true });
    await expect(activeTab).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(feed.eyebrow, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: feed.heading, exact: true })).toBeVisible();

    const navigation = page.getByRole("navigation", { name: "Community Exchange sections" });
    const tabWidths = await navigation.getByRole("link").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().width));
    expect(Math.max(...tabWidths) - Math.min(...tabWidths)).toBeLessThan(1);

    const filters = page.locator(".exchange-feed > .exchange-filters");
    const search = page.getByRole("searchbox", { name: feed.search });
    const searchField = filters.locator(".search-field");
    const firstSelect = filters.getByRole("combobox").first();
    const [filterBounds, searchBounds, selectBounds] = await Promise.all([
      filters.boundingBox(),
      searchField.boundingBox(),
      firstSelect.boundingBox(),
    ]);
    expect(Math.abs(filterBounds.width - searchBounds.width)).toBeLessThan(2);
    expect(searchBounds.y).toBeLessThan(selectBounds.y);

    const card = page.locator(".exchange-feed > .listing-grid .exchange-card, .exchange-feed > .buffet-grid .exchange-card, .exchange-feed > .lost-item-grid .exchange-card").first();
    await expect(card).toBeVisible();
    const cardStyle = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderStyle: style.borderStyle,
      };
    });
    expect(cardStyle).toEqual({
      backgroundColor: "rgb(17, 23, 34)",
      borderRadius: "16px",
      borderStyle: "solid",
    });
  }
});

test("each public feed presents empty results with the shared state treatment", async ({ page }) => {
  for (const feed of feeds) {
    await page.goto(feed.path);
    await page.getByRole("searchbox", { name: feed.search }).fill("no-results-for-ui-standard");
    const publicState = page.locator(".exchange-feed > .feed-state, .exchange-feed > .lost-item-grid > .feed-state").first();
    await expect(publicState).toBeVisible();
    await expect(publicState).toHaveAttribute("aria-live", "polite");
    await expect(publicState).toHaveCSS("border-radius", "12px");
    await expect(publicState).toHaveCSS("text-align", "center");
  }
});

test("320px layouts stack filters and keep all tabs inside the navigation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/lost-and-found");

  const tabsFit = await page.getByRole("navigation", { name: "Community Exchange sections" }).evaluate((navigation) => navigation.scrollWidth <= navigation.clientWidth);
  expect(tabsFit).toBe(true);

  const category = page.getByRole("combobox", { name: "Category", exact: true });
  const zone = page.getByRole("combobox", { name: "NUS Zone", exact: true });
  const [categoryBounds, zoneBounds] = await Promise.all([category.boundingBox(), zone.boundingBox()]);
  expect(zoneBounds.y).toBeGreaterThan(categoryBounds.y + categoryBounds.height);
  expect(Math.abs(zoneBounds.width - categoryBounds.width)).toBeLessThan(2);
});

test("private tab workflows use the shared panel treatment", async ({ page }) => {
  await launchAs(page, "participant", "Design Participant");

  await page.goto("/buffets");
  await expect(page.locator(".exchange-panel.buffet-alert-settings")).toBeVisible();

  await page.goto("/lost-and-found");
  await page.getByRole("button", { name: "I lost something" }).click();
  await expect(page.locator(".exchange-panel#lost-item-form")).toBeVisible();
  await expect(page.locator(".exchange-panel.my-lost-items")).toBeVisible();

  await page.getByRole("button", { name: "I found something" }).click();
  await expect(page.locator(".exchange-panel#found-item-report-form")).toBeVisible();
  await expect(page.locator(".exchange-panel.my-lost-items")).toBeVisible();
});

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
}
