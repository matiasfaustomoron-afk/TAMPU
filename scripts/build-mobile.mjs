#!/usr/bin/env node
// Mobile static build pipeline for Capacitor.
//
// Why a custom script: Next.js `output: 'export'` errors out if /api/* routes or middleware
// are present. We temporarily move them aside, run the build, then restore.
//
// Result: a fully-static `out/` directory ready for `npx cap sync`.

import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC_APP = join(ROOT, "src", "app");
const API_DIR = join(SRC_APP, "api");
const API_BACKUP = join(SRC_APP, "_api.disabled");
const MW = join(ROOT, "src", "middleware.ts");
const MW_BACKUP = join(ROOT, "src", "_middleware.disabled.ts");
const OUT_DIR = join(ROOT, "out");
const NEXT_CACHE = join(ROOT, ".next");
const TSBUILD = join(ROOT, "tsconfig.tsbuildinfo");

// Dynamic routes that can't be statically pre-rendered. In mobile we navigate
// to /tasks (list) or /trips (list) and the detail view is reached client-side.
const DYNAMIC_ROUTES = [
  { dir: join(SRC_APP, "(app)", "tasks", "[id]"), backup: join(SRC_APP, "(app)", "tasks", "_id.disabled") },
  { dir: join(SRC_APP, "(app)", "trips", "[id]"), backup: join(SRC_APP, "(app)", "trips", "_id.disabled") },
];

function step(msg) { console.log(`\n→ ${msg}`); }

function safeRename(from, to) {
  if (existsSync(from)) renameSync(from, to);
}

function cleanup() {
  step("Restoring api/, middleware and dynamic routes...");
  safeRename(API_BACKUP, API_DIR);
  safeRename(MW_BACKUP, MW);
  for (const r of DYNAMIC_ROUTES) safeRename(r.backup, r.dir);
}

process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("uncaughtException", (e) => { console.error(e); cleanup(); process.exit(1); });

try {
  step("Cleaning previous build artifacts (out/, .next/, tsbuildinfo)...");
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  if (existsSync(NEXT_CACHE)) rmSync(NEXT_CACHE, { recursive: true, force: true });
  if (existsSync(TSBUILD)) rmSync(TSBUILD, { force: true });

  step("Moving /api, /middleware and dynamic routes out of the build path...");
  safeRename(API_DIR, API_BACKUP);
  safeRename(MW, MW_BACKUP);
  for (const r of DYNAMIC_ROUTES) safeRename(r.dir, r.backup);

  step("Building Next.js with output:'export' (MOBILE_BUILD=1)...");
  execSync("next build", { stdio: "inherit", env: { ...process.env, MOBILE_BUILD: "1" } });

  step("Mobile build complete. Static site is in ./out");
} finally {
  cleanup();
}
