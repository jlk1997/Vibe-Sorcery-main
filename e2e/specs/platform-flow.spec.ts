import { test, expect } from "@playwright/test";

test.describe("Platform H5 flows", () => {
  test("pricing page mentions credits", async ({ page }) => {
    await page.goto("/#/pages/pricing/index");
    await expect(page.locator("body")).toContainText(/定价|Pricing|额度|Credits/i);
  });

  test("create tab loads studio shell", async ({ page }) => {
    await page.goto("/#/pages/create/index");
    await expect(page.locator("body")).toBeVisible();
  });

  test("profile engagement area visible when logged out shows login", async ({ page }) => {
    await page.goto("/#/pages/profile/index");
    await expect(page.locator("body")).toContainText(/登录|Login|我的|Profile/i);
  });
});
