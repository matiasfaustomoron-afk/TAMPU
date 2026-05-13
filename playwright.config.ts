import { defineConfig } from "@playwright/test";

// E2E + screenshots config. Uses Chromium-only (lighter install) with mobile
// viewport emulation — sufficient for smoke tests; real iOS testing happens
// in the simulator after `npm run ios`.

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3030",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: 430, height: 932 }, // iPhone 15 Pro Max logical viewport
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    isMobile: true,
    hasTouch: true,
  },
  projects: [
    { name: "mobile-chromium", use: { browserName: "chromium" } },
  ],
  webServer: {
    command: "PORT=3030 npm run start",
    url: "http://localhost:3030/dashboard",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
