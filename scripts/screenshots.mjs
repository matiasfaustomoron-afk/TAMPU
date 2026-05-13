#!/usr/bin/env node
// Generates App Store screenshots for 3 iPhone size classes.
//
// Usage:
//   npm run build && PORT=3030 npm run start &  # in another terminal
//   node scripts/screenshots.mjs
//
// Output:
//   docs/screenshots/iphone-6.7/01-dashboard.png  (1290×2796)
//   docs/screenshots/iphone-6.5/01-dashboard.png  (1242×2688)
//   docs/screenshots/iphone-5.5/01-dashboard.png  (1242×2208)

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.SCREENSHOT_BASE_URL || "http://localhost:3030";
const OUT_DIR = join(process.cwd(), "docs", "screenshots");

// Target devices per Apple App Store Connect 2026 spec
const DEVICES = [
  { name: "iphone-6.7", width: 1290, height: 2796, scaleFactor: 3 },
  { name: "iphone-6.5", width: 1242, height: 2688, scaleFactor: 3 },
  { name: "iphone-5.5", width: 1242, height: 2208, scaleFactor: 3 },
];

const FRAMES = [
  { route: "/dashboard", file: "01-dashboard", title: "Tu viaje, en un solo command center" },
  { route: "/today",     file: "02-today",     title: "Lo que pasa HOY, sin scroll" },
  { route: "/cashflow",  file: "03-cashflow",  title: "Cashflow visual: día, semana, destino" },
  { route: "/risk",      file: "04-risk",      title: "Riesgo en 5 dominios, en tiempo real" },
  { route: "/decisions", file: "05-decisions", title: "Decisiones abiertas, separadas de la operación" },
  { route: "/map",       file: "06-map",       title: "Tu ruta en un mapa interactivo" },
  { route: "/health",    file: "07-health",    title: "Vacunas + malaria, fuente CDC" },
  { route: "/visas",     file: "08-visas",     title: "Visas verificadas, costos y leads" },
  { route: "/emergency", file: "09-emergency", title: "SOS en una pantalla, accesible bajo estrés" },
  { route: "/assistant", file: "10-assistant", title: "Asistente IA con tu contexto real" },
];

function overlayTitleHTML(text) {
  return `
    <div style="
      position: fixed; top: 0; left: 0; right: 0;
      padding: 24px 32px;
      background: linear-gradient(180deg, rgba(10,10,15,0.95) 60%, rgba(10,10,15,0));
      color: #fff;
      font-family: -apple-system, system-ui, sans-serif;
      font-size: 38px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
      z-index: 999999;
      pointer-events: none;
    ">${text}</div>
  `;
}

async function captureFrame(browser, device, frame) {
  const context = await browser.newContext({
    viewport: { width: device.width / device.scaleFactor, height: device.height / device.scaleFactor },
    deviceScaleFactor: device.scaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(() => {
    localStorage.setItem("travel-os-locale", "es");
    localStorage.setItem("travel-os-theme", "dark");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}${frame.route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(800); // let charts/maps settle
    await page.evaluate((html) => {
      const div = document.createElement("div");
      div.innerHTML = html;
      document.body.appendChild(div.firstElementChild);
    }, overlayTitleHTML(frame.title));
    await page.waitForTimeout(200);
    const outPath = join(OUT_DIR, device.name, `${frame.file}.png`);
    mkdirSync(join(OUT_DIR, device.name), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`✓ ${device.name}/${frame.file}.png`);
  } catch (e) {
    console.error(`✗ ${device.name}/${frame.file}.png — ${e.message}`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  for (const device of DEVICES) {
    console.log(`\n→ ${device.name} (${device.width}×${device.height})`);
    for (const frame of FRAMES) await captureFrame(browser, device, frame);
  }
  console.log("\n✅ All screenshots generated in docs/screenshots/");
} finally {
  await browser.close();
}
