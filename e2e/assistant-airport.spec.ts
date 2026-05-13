import { test, expect } from "@playwright/test";

// Verify that the assistant client, when asked about Frankfurt, sends the
// airports_in_trip[] array populated with FRA + its food options.
// Stubs the response so the test doesn't depend on Claude.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("travel-os-locale", "es");
    localStorage.setItem("travel-os-theme", "dark");
  });
});

test("assistant request includes FRA airport with food list", async ({ page }) => {
  let capturedPayload: {
    question?: string;
    context?: {
      airports_in_trip?: { iata: string; food?: { name: string }[] }[];
    };
  } | null = null;

  // Stub /api/assistant — return a known response so the page doesn't error.
  await page.route("**/api/assistant", async (route) => {
    capturedPayload = await route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "heuristic",
        answer: "Opciones de comida en FRA:",
        suggestions: [{ title: "Goethe Bar", detail: "Comida alemana", priority: "low" }],
      }),
    });
  });

  await page.goto("/assistant");
  // Wait long enough for the demo trip to load + useCommandCenter to hydrate
  await page.waitForTimeout(3000);

  const input = page.locator('input[placeholder*="Pregunt"]');
  await input.waitFor({ timeout: 10_000 });
  await input.fill("Dónde puedo comer en Frankfurt?");
  await input.press("Enter");

  // Wait for the response (or 8s timeout)
  await page.waitForTimeout(8_000);

  // The client should have called /api/assistant
  expect(capturedPayload).not.toBeNull();
  expect(capturedPayload!.question).toContain("Frankfurt");

  // The crucial assertion: airports_in_trip contains FRA with food entries
  const airports = capturedPayload!.context!.airports_in_trip || [];
  console.log("[airports]", JSON.stringify(airports.map(a => ({ iata: a.iata, foods: a.food?.length || 0 })), null, 2));

  const fra = airports.find(a => a.iata === "FRA");
  expect(fra, "Expected FRA airport to be in the context").toBeDefined();
  expect((fra!.food || []).length, "Expected FRA to have food entries").toBeGreaterThan(0);
});
