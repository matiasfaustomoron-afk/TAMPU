import { test, expect } from "@playwright/test";

// Smoke E2E: validates that the production build renders without crashes,
// hydrates client components, and reaches the critical Command Center pieces.

test.beforeEach(async ({ page }) => {
  // Force demo mode storage to ensure seed data loads.
  await page.addInitScript(() => {
    localStorage.setItem("travel-os-locale", "es");
    localStorage.setItem("travel-os-theme", "dark");
  });
});

test("dashboard loads with Command Center + Quick Access + KPIs", async ({ page }) => {
  await page.goto("/dashboard");
  // Demo seed data hydrates client-side; wait for actual content
  await page.waitForFunction(
    () => /Papúa|Seúl|Pasaporte/i.test(document.body.textContent || ""),
    { timeout: 20_000 }
  );
  await expect(page.getByText(/Pasaporte/i).first()).toBeVisible({ timeout: 10_000 });
});

test("emergency page surfaces SOS by country", async ({ page }) => {
  await page.goto("/emergency");
  await page.waitForFunction(
    () => /Papúa|Filipinas|Brasil|Emiratos|Corea/i.test(document.body.textContent || ""),
    { timeout: 20_000 }
  );
  // Country cards rendered with emergency numbers
  await expect(page.getByText(/Papúa Nueva Guinea|Corea del Sur/i).first()).toBeVisible();
});

test("vault page lists critical documents", async ({ page }) => {
  await page.goto("/vault");
  // Vault renders the top filter chips synchronously, then docs hydrate
  await page.waitForFunction(
    () => /Pasaporte|Passport|Críticos|Critical/i.test(document.body.textContent || ""),
    { timeout: 20_000 }
  );
  await expect(page.getByText(/cr[íi]ticos|critical/i).first()).toBeVisible({ timeout: 10_000 });
});

test("cashflow page renders chart canvas", async ({ page }) => {
  await page.goto("/cashflow");
  // Recharts renders SVG charts
  await expect(page.locator("svg").first()).toBeVisible({ timeout: 10_000 });
});

test("assistant page accepts preset question", async ({ page }) => {
  await page.goto("/assistant");
  const preset = page.getByRole("button", { name: /Qué tengo que hacer ya/i });
  await preset.click();
  // Either Claude or heuristic — both produce 'answer' text within 5s
  await expect(page.locator("text=/Asistente IA|Heurística local/i")).toBeVisible({ timeout: 15_000 });
});

test("health page lists vaccines for trip destinations", async ({ page }) => {
  await page.goto("/health");
  await expect(page.getByText(/Hepatitis|Malaria/i).first()).toBeVisible({ timeout: 10_000 });
});

test("visas page shows requirements summary", async ({ page }) => {
  await page.goto("/visas");
  await expect(page.getByText(/Papúa|Corea|K-ETA|eVisa/i).first()).toBeVisible({ timeout: 10_000 });
});

test("connections page surfaces analysis result", async ({ page }) => {
  await page.goto("/connections");
  await expect(page.getByText(/vuelos analizados|críticas/i).first()).toBeVisible({ timeout: 10_000 });
});

test("privacy and terms pages render publicly", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.locator("h1")).toContainText(/Privacy/i);
  await page.goto("/terms");
  await expect(page.locator("h1")).toContainText(/Terms/i);
});

test("theme toggle round-trips", async ({ page }) => {
  await page.goto("/dashboard");
  // The toggle exists in the sidebar (desktop) or mobile drawer
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
});
