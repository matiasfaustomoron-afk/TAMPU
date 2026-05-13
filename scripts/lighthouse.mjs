#!/usr/bin/env node
/**
 * Tampu — Lighthouse runner.
 *
 * Corre Lighthouse mobile-emulation contra las rutas críticas del producto y
 * emite un reporte resumido (LCP / CLS / INP / TBT / Lighthouse score) por ruta.
 *
 * Uso:
 *   npm run build && npm start            # en una terminal
 *   npm run lighthouse                    # en otra terminal
 *
 * Por defecto golpea http://localhost:3000 (el dev/start de Next). Si tenés el
 * server en otro puerto, pasalo:  PORT=4000 npm run lighthouse
 *
 * Requiere `lighthouse` y `chrome-launcher` instalados:
 *   npm i -D lighthouse chrome-launcher
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

// Rutas críticas para auditar. Orden = orden de impacto en UX.
const ROUTES = [
  "/today",         // tab principal — meta: LCP < 2.5s, CLS < 0.1
  "/vault",         // tab del filo — pase de wallet, debe sentir snappy
  "/import",        // aha moment — formulario debe ser instantáneo
  "/welcome",       // primera impresión — meta: LCP < 1.5s
  "/expenses",      // dynamic recharts — verificar lazy
];

async function main() {
  // Validar instalación
  let lighthouse, chromeLauncher;
  try {
    lighthouse = (await import("lighthouse")).default;
    chromeLauncher = await import("chrome-launcher");
  } catch (err) {
    console.error("❌  Falta instalar dependencias. Corré:");
    console.error("    npm i -D lighthouse chrome-launcher\n");
    console.error("Error:", err.message);
    process.exit(1);
  }

  // Validar server
  try {
    const r = await fetch(`${BASE}/today`, { method: "HEAD" });
    if (!r.ok && r.status !== 404) throw new Error(`Server respondió ${r.status}`);
  } catch (err) {
    console.error(`❌  No puedo alcanzar ${BASE}. ¿Está corriendo "npm start"?`);
    console.error("Error:", err.message);
    process.exit(1);
  }

  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new"] });
  const reportDir = path.resolve("./lighthouse-reports");
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

  console.log(`\n🚦  Tampu Lighthouse audit · ${ROUTES.length} rutas · base ${BASE}\n`);
  console.log("Ruta              | Score | LCP    | CLS    | TBT     | INP    ");
  console.log("─────────────────┼───────┼────────┼────────┼─────────┼────────");

  const summary = [];

  for (const route of ROUTES) {
    const url = `${BASE}${route}`;
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      formFactor: "mobile",
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4, // Slow 4G
        cpuSlowdownMultiplier: 4,
      },
      screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 },
      onlyCategories: ["performance"],
    });

    const lhr = result.lhr;
    const score = Math.round((lhr.categories.performance.score || 0) * 100);
    const lcp = lhr.audits["largest-contentful-paint"].numericValue;
    const cls = lhr.audits["cumulative-layout-shift"].numericValue;
    const tbt = lhr.audits["total-blocking-time"].numericValue;
    const inp = lhr.audits["interactive"]?.numericValue ?? 0;

    summary.push({ route, score, lcp, cls, tbt, inp });

    const scoreColor = score >= 90 ? "🟢" : score >= 70 ? "🟡" : "🔴";
    console.log(
      `${route.padEnd(17)} | ${scoreColor} ${String(score).padStart(2)}  ` +
        `| ${(lcp / 1000).toFixed(2)}s  ` +
        `| ${cls.toFixed(3)}  ` +
        `| ${Math.round(tbt)}ms  ` +
        `| ${(inp / 1000).toFixed(2)}s`
    );

    // Persist full JSON per route for deeper inspection
    const fname = `lighthouse-${route.replace(/\//g, "-") || "root"}.json`;
    writeFileSync(path.join(reportDir, fname), JSON.stringify(lhr, null, 2));
  }

  await chrome.kill();

  // Summary verdict
  const avgScore = Math.round(summary.reduce((s, r) => s + r.score, 0) / summary.length);
  console.log(`\nPromedio: ${avgScore}/100`);
  console.log(`Reportes JSON: ./lighthouse-reports/\n`);

  if (avgScore < 90) {
    console.error("⚠️   Promedio bajo 90. Mirá los reportes individuales para ver qué optimizar.");
    process.exit(1);
  }
  console.log("✅  Performance budget cumplido (≥ 90).");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
