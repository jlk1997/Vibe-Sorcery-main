import { test, expect } from "@playwright/test";

test.describe("H5 shell smoke", () => {
  test("loads create home and shows brand", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/炼金|Vibe|Sorcery/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("can navigate to pricing page", async ({ page }) => {
    await page.goto("/#/pages/pricing/index");
    await expect(page.locator("body")).toContainText(/定价|Pricing|额度|Credits/i);
  });
});
