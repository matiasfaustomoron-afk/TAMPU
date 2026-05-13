#!/usr/bin/env node
// Generate the full iOS + PWA icon set from public/icon.svg.
// Usage: node scripts/generate-icons.mjs
//
// Output:
//   public/icons/ios/Icon-{size}.png      → for Xcode AppIcon.appiconset
//   public/icons/pwa/icon-{size}.png      → for the web manifest
//   public/icons/marketing-1024.png       → App Store Connect marketing icon (no alpha)
//   public/icons/splash-2732.png          → Capacitor splash base
//   public/icon-180.png                   → apple-touch-icon

import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "public", "icon.svg");
const OUT = join(ROOT, "public", "icons");

const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
const PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

mkdirSync(join(OUT, "ios"), { recursive: true });
mkdirSync(join(OUT, "pwa"), { recursive: true });

const svgBuffer = readFileSync(SRC);

async function render(size, outPath, opts = {}) {
  let pipeline = sharp(svgBuffer, { density: 600 }).resize(size, size, { fit: "contain" });
  // Flatten color para iconos sin alfa: terracota Quebradeña (theme_color del manifest).
  // Esto cubre el marketing 1024 que Apple rechaza si tiene alfa.
  if (opts.flatten) pipeline = pipeline.flatten({ background: opts.flattenColor || "#c75b2f" });
  await pipeline.png().toFile(outPath);
  console.log(`✓ ${outPath} (${size}×${size})`);
}

console.log("→ Generating iOS app icons...");
for (const s of IOS_SIZES) {
  // Marketing icon (1024) MUST NOT have alpha — flatten over background.
  await render(s, join(OUT, "ios", `Icon-${s}.png`), { flatten: s === 1024 });
}

console.log("\n→ Generating PWA icons...");
for (const s of PWA_SIZES) {
  await render(s, join(OUT, "pwa", `icon-${s}.png`));
}

console.log("\n→ Apple-touch-icon (180) at /public root...");
await render(180, join(ROOT, "public", "icon-180.png"));

console.log("\n→ Marketing icon 1024 (no alpha)...");
await render(1024, join(OUT, "marketing-1024.png"), { flatten: true });

console.log("\n→ Splash 2732 (Capacitor base, logo centrado sobre lana de llama)...");
// Splash: 2732×2732 con bg crema (alineado con capacitor.config + manifest background_color).
// Logo centrado al ~30% del ancho.
const logo = await sharp(svgBuffer, { density: 600 }).resize(820, 820, { fit: "contain" }).png().toBuffer();
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: "#f5efe0" },
})
  .composite([{ input: logo, gravity: "center" }])
  .png()
  .toFile(join(OUT, "splash-2732.png"));
console.log(`✓ ${join(OUT, "splash-2732.png")} (2732×2732)`);

console.log("\n✅ All icons generated.");
console.log("\nNext: copy public/icons/ios/* into ios/App/App/Assets.xcassets/AppIcon.appiconset/");
console.log("And public/icons/splash-2732.png into ios/App/App/Assets.xcassets/Splash.imageset/");
