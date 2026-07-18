import { test, expect } from "@playwright/test";

const API = process.env.E2E_API_URL || "http://127.0.0.1:8000/api/v1";

test.describe("API credits flow", () => {
  test.skip(!process.env.E2E_API_URL && !process.env.CI, "Set E2E_API_URL or run in CI with API");

  test("health and metrics endpoints respond", async ({ request }) => {
    const health = await request.get(API.replace("/api/v1", "") + "/health");
    expect(health.ok()).toBeTruthy();
    const metrics = await request.get(API.replace("/api/v1", "") + "/metrics");
    expect(metrics.ok()).toBeTruthy();
    const body = await metrics.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("unauthenticated generate returns 401 or 403", async ({ request }) => {
    const res = await request.post(`${API}/works/generate/single`, {
      data: { text_intent: "test track", instrumental: true },
    });
    expect([401, 403]).toContain(res.status());
  });
});
