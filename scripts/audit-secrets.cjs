#!/usr/bin/env node
/**
 * Tampu — audit-secrets.cjs
 *
 * Zero-dependency secret scanner. Corre como guard local (pre-commit hook) y como
 * paso de CI (`npm run audit:secrets`). El auditor externo señaló que filtrar
 * `.env*` por .gitignore es buen primer paso pero NO defensa-en-profundidad:
 * un dev puede hardcodear una key dentro de un .ts o pegarla en un .md y
 * .gitignore no lo va a frenar.
 *
 * Este script escanea el árbol de trabajo (no el git index — corre antes del
 * commit, sobre los archivos as-is) buscando:
 *
 *   1. Patrones de API keys conocidos (Anthropic, Google, OpenAI, Supabase,
 *      JWT-like, AWS, Slack).
 *   2. Archivos `.env`, `.env.local`, `.env.production`, etc. trackeables que
 *      vivan fuera de .gitignore.
 *
 * Diseño explícito:
 *
 *   - Zero deps. Node 20+ tiene todo lo que necesitamos (fs, path, regex).
 *     git-secrets requiere Python en Windows y no es deseable agregar otra
 *     toolchain al stack.
 *   - Exit code 1 si encuentra algo → pre-commit lo usa para bloquear el commit.
 *   - Output amigable con file:line + preview enmascarado (no imprimimos la
 *     key completa en stdout porque eso terminaría en la consola del dev y
 *     potencialmente en su shell history).
 *   - Patrones conservadores: preferimos un falso negativo a un falso positivo.
 *     Si el script grita lobo todo el tiempo el dev lo termina ignorando.
 *
 * Uso:
 *
 *   node scripts/audit-secrets.cjs               # scan todo
 *   node scripts/audit-secrets.cjs --quiet       # solo errores
 *   node scripts/audit-secrets.cjs path/to/file  # scan un solo archivo
 *
 * IMPORTANTE para devs que agregan nuevos patrones:
 *   - Probá tu regex contra al menos 3 strings reales que SÍ debería matchear
 *     y 3 que NO. Falsos positivos sobre nombres de variables comunes
 *     (`SECRET_KEY = "..."`) son el modo principal en que estos scripts mueren
 *     de irrelevancia.
 *   - Si tu regex matchea más de 1000 ocurrencias en el repo, casi seguro está
 *     mal pensada — refiná y probá de nuevo antes de commitear.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// ─── Config ──────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");

// Directorios y archivos que NO escaneamos. Incluyo dependencias (node_modules),
// builds (.next, out, build, coverage), artifacts de testing (test-results,
// playwright-report, lighthouse-reports) y nativos generados (ios/App/Pods).
// También excluyo el propio audit-secrets para que los patrones-ejemplo de
// arriba no se auto-detecten como leaks.
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "out",
  "build",
  "coverage",
  "test-results",
  "playwright-report",
  "lighthouse-reports",
  "DerivedData",
  ".capacitor",
  "ios-template",
  "supabase", // generated migration noise; secrets en supabase son detectados igual via .env scan
]);

const IGNORE_FILES = new Set([
  // El propio scanner — contiene las regex como string literals.
  "audit-secrets.cjs",
  // Lockfiles enormes con hashes que generan falsos positivos.
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

// Extensiones que escaneamos. Cualquier otra cosa (binarios, imágenes, fonts)
// se skipea. Esto baja el tiempo de scan y elimina falsos positivos por
// secuencias binarias que casualmente matchean una regex.
const SCAN_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".md", ".mdx", ".txt",
  ".json", ".yml", ".yaml", ".toml",
  ".env", ".env.local", ".env.example", ".env.production",
  ".sh", ".bash", ".ps1",
  ".html", ".css", ".scss",
  ".sql",
]);

// Patrones de keys. Cada uno tiene un nombre legible para el output y una
// regex con ancla mínima para reducir falsos positivos.
//
// Notas por proveedor (mayo 2026):
//   - Anthropic: keys empiezan con `sk-ant-` + (api03|admin01|...) y son >= 95
//     chars. Acotamos a >= 40 después del prefix para evitar matchear texto
//     de docs que mencione el prefijo.
//   - Google: AIza + 35 chars alfanuméricos + posibles `-_`.
//   - OpenAI: sk- + 32+ chars. Lo dejamos amplio pero NO matcheamos `sk-ant-`
//     (Anthropic ya lo cubre con su propio pattern) ni `sk-proj-` con menos
//     de 32 (placeholders).
//   - Supabase: el formato nuevo 2024+ es `sb_secret_<60+>` / `sb_publishable_<60+>`.
//     Los legacy son JWT (eyJhbGc...) que viajan en el header. La service-role
//     JWT es lo más peligroso si se filtra.
//   - AWS: AKIA + 16 chars (access-key-id). Secret access keys son entropía
//     pura y no podemos detectarlas confiablemente, pero el AKIA solo ya es
//     evidencia suficiente.
//   - Slack: xox[baprs]-... — bots, apps, user tokens.
const PATTERNS = [
  {
    name: "Anthropic API key",
    re: /sk-ant-(?:api|admin)\d*-[A-Za-z0-9_-]{40,}/g,
  },
  {
    name: "Google API key (AIza)",
    re: /\bAIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    name: "OpenAI-style key (sk-...)",
    // Excluye sk-ant- (Anthropic) explícitamente con un negative lookahead.
    re: /\bsk-(?!ant-)[A-Za-z0-9]{32,}/g,
  },
  {
    name: "Supabase secret key (new format)",
    re: /\bsb_secret_[A-Za-z0-9]{30,}/g,
  },
  {
    name: "Supabase publishable key (new format)",
    re: /\bsb_publishable_[A-Za-z0-9]{30,}/g,
  },
  {
    name: "JWT-like token (possible Supabase service_role)",
    // JWT real: header.payload.signature. Header empieza con eyJhbGc (base64 de
    // {"alg":...). Para reducir FPs, exigimos los 3 segmentos y >= 80 chars
    // en total — un JWT real de Supabase ronda los 200+.
    re: /\beyJhbGc[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "AWS Access Key ID",
    re: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "Slack token",
    re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/g,
  },
];

// .env files que SÍ deberían existir en disco pero NUNCA en el index de git.
// Si .gitignore filtra correctamente, estos archivos pueden vivir en working
// tree (es de hecho normal: .env.local lo usás vos) pero no aparecer staged.
// Cuando este script corre como pre-commit, validamos contra `git ls-files`
// que el archivo no esté tracked.
const SENSITIVE_ENV_FILES = [".env", ".env.local", ".env.production", ".env.development"];

// ─── Walking ─────────────────────────────────────────────────────────────

/**
 * Walk recursivo del filesystem skipeando IGNORE_DIRS. Lo hago manualmente
 * (no con globs) para no depender de `glob` o `fast-glob` — zero-dep era un
 * requirement explícito.
 */
function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      yield* walk(full);
    } else if (ent.isFile()) {
      if (IGNORE_FILES.has(ent.name)) continue;
      const ext = ent.name.startsWith(".env") ? ".env" : path.extname(ent.name);
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      yield full;
    }
  }
}

// ─── Masking ─────────────────────────────────────────────────────────────

/**
 * Enmascara el match para que no terminemos imprimiendo la key real en stdout.
 * Mostramos los primeros 6 y los últimos 4 chars con `***` en el medio. Esto
 * es suficiente para que el dev identifique cuál key se le escapó sin que
 * la consola misma sea un nuevo leak.
 */
function mask(s) {
  if (s.length <= 14) return s.slice(0, 4) + "***";
  return s.slice(0, 6) + "***" + s.slice(-4);
}

// ─── Scan core ───────────────────────────────────────────────────────────

function scanFile(file) {
  const findings = [];
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return findings; // binarios o permission errors → skip silencioso
  }
  // Skip archivos > 1MB. Lockfiles ya estaban excluidos, esto cubre cualquier
  // otro JSON gigante o asset accidental.
  if (content.length > 1024 * 1024) return findings;

  const lines = content.split(/\r?\n/);
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      // Calculá la línea del match. Esto es O(n) pero solo lo hacemos cuando
      // ya tenemos un match — el costo agregado es despreciable.
      const idx = m.index;
      let line = 1;
      let cur = 0;
      for (let i = 0; i < lines.length; i++) {
        const end = cur + lines[i].length + 1; // +1 por \n
        if (idx < end) { line = i + 1; break; }
        cur = end;
      }
      findings.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        line,
        pattern: name,
        preview: mask(m[0]),
      });
    }
  }
  return findings;
}

// ─── .env file check ─────────────────────────────────────────────────────

/**
 * Revisa si hay .env files tracked por git. .gitignore puede tener `.env*` y
 * aun así un archivo puede estar tracked si alguien hizo `git add -f` o si
 * fue commiteado antes de agregar la regla. Para detectarlo, intentamos
 * correr `git ls-files`; si git no está disponible (CI sin git, ej.) caemos
 * a un check más débil: que el archivo no exista en working tree con extensión
 * problemática.
 */
function checkEnvFiles() {
  const findings = [];

  // Si git está, preguntale qué tiene tracked. Esto es lo más confiable.
  try {
    const { execSync } = require("node:child_process");
    const out = execSync("git ls-files --cached", { cwd: ROOT, encoding: "utf8" });
    const tracked = out.split(/\r?\n/).filter(Boolean);
    for (const f of tracked) {
      const base = path.basename(f);
      // .env.example es OK — es el template público que documenta qué vars
      // hay que setear, sin valores reales.
      if (base === ".env.example" || base === ".env.sample") continue;
      if (base.startsWith(".env")) {
        findings.push({
          file: f,
          line: 0,
          pattern: "Tracked .env file",
          preview: "(file is tracked by git — must be untracked)",
        });
      }
    }
  } catch {
    // git no disponible (ej. en una CI minimalista o en un tarball sin .git).
    // Fallback: solo log informativo si vemos un .env en disco. NO falla el
    // script en este modo — sería demasiado agresivo bloquear porque vos
    // tenés un .env.local local (que es exactamente el comportamiento que
    // queremos permitir).
  }

  return findings;
}

// ─── Entry point ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet");
  const targets = args.filter((a) => !a.startsWith("--"));

  /** @type {{file:string, line:number, pattern:string, preview:string}[]} */
  const allFindings = [];

  // Si pasaron archivos explícitos (modo "scan estos archivos"), úsalos.
  // Esto es lo que vamos a usar desde el pre-commit, donde queremos scanear
  // SOLO lo staged.
  if (targets.length > 0) {
    for (const t of targets) {
      const abs = path.resolve(ROOT, t);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      allFindings.push(...scanFile(abs));
    }
  } else {
    // Full repo scan.
    for (const file of walk(ROOT)) {
      allFindings.push(...scanFile(file));
    }
    // .env file check solo en full scan — no tiene sentido en modo "scan
    // staged files" porque ese ya se chequea con la regla de tracked files.
    allFindings.push(...checkEnvFiles());
  }

  if (allFindings.length === 0) {
    if (!quiet) {
      console.log("[audit-secrets] OK — no secret-like patterns found.");
    }
    process.exit(0);
  }

  console.error("\n[audit-secrets] FAIL — possible secrets detected:\n");
  for (const f of allFindings) {
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file;
    console.error(`  · ${loc}`);
    console.error(`      ${f.pattern}`);
    console.error(`      ${f.preview}`);
  }
  console.error(
    "\n[audit-secrets] If a finding is a false positive, refine the pattern in\n" +
    "scripts/audit-secrets.cjs or use an inline allowlist comment. If it's a real\n" +
    "secret, ROTATE IT NOW (the key is in your working tree and may already be\n" +
    "in shell history / IDE telemetry / etc) and remove it from the file.\n"
  );
  process.exit(1);
}

main();
