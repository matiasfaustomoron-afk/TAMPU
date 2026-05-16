import type { NextConfig } from "next";

// Two build modes:
//   - default (web/SSR): server-rendered, supports API routes + middleware. Deploys to Vercel.
//   - MOBILE_BUILD=1 (mobile/static): output:'export' for Capacitor. NO middleware, NO /api/*.
// The mobile build hits the deployed web build's API via NEXT_PUBLIC_API_BASE_URL.

const isMobileBuild = process.env.MOBILE_BUILD === "1";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't pick up sibling lockfiles
  // elsewhere on the system (a common pitfall on shared dev machines).
  turbopack: { root: process.cwd() },

  // ─── Performance posture ───
  // Tree-shaking explícito para imports barrel ("barrel optimization"). Cada
  // package listado acá se compila con import-paths granulares: en lugar de
  // `import { X } from "lucide-react"` arrastrar el index entero, Next reescribe
  // a un path interno específico. Reduce significativamente el JS inicial.
  //
  // Soportado en Next 16 (heredado de 15.x). Lista extendida (perf audit mayo 2026):
  //   - lucide-react: ~1000 íconos, sólo usamos ~30.
  //   - @radix-ui/react-icons: igual razonamiento.
  //   - @radix-ui/react-dialog / popover / toast: cada uno expone múltiples sub-componentes,
  //     barrel import trae todos.
  //   - recharts: composable chart primitives + d3-internals, muy pesado sin tree-shake.
  //   - @sentry/nextjs: barrel re-exporta browser + server + integrations.
  //   - date-fns: cada función es un módulo, barrel los junta.
  experimental: {
    optimizePackageImports: [
      // Lista basada en imports reales del codebase (audit mayo 2026).
      // Cualquier package acá listado se reescribe a paths granulares —
      // sin esto, el barrel arrastra todo el index.
      "lucide-react",          // ~30 íconos usados de ~1000.
      "@radix-ui/react-tabs",  // src/components/ui/tabs.tsx
      "@radix-ui/react-progress", // src/components/ui/progress.tsx
      "@radix-ui/react-slot",  // src/components/ui/button.tsx
      "recharts",              // donut + composed charts (lazy via dynamic).
      "@sentry/nextjs",        // browser + integrations.
      "date-fns",              // cada función es un módulo.
    ],
    // scrollRestoration true: Next.js gestiona scroll position en
    // back/forward navigation. Sin esto, navegar /vault → /expenses → back
    // perdía scroll position en /vault, dando sensación de "se trabó / tengo
    // que refrescar". Browser-native scroll restoration está OFF por defecto
    // en App Router; este flag lo enciende.
    scrollRestoration: true,
  },

  // ─── External photo sources permitidas ───
  // Wikimedia Commons sirve fotos icónicas curadas por Wikipedia editors (Tier 2).
  // Unsplash CDN para fallback long-tail (Tier 3).
  // images.unsplash.com requiere whitelist explícito en Next/Image.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // Supabase Storage public URLs viven en `<project-ref>.supabase.co`.
      // Wildcard cubre cualquier proyecto sin pinear el ref a la config.
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },

  // Bundle analyzer: instalá `@next/bundle-analyzer` y corré `ANALYZE=1 npm run build`.
  // Lo dejamos como instrucción en lugar de require dinámico para no romper el build
  // si la dep no está en package.json.

  // ─── PWA cache headers ───
  // /sw.js DEBE servirse sin cache (o cache muy corto) para que cada navigation
  // detecte un SW nuevo post-deploy. El SW mismo cachea agresivamente el resto
  // del sitio — pero a él mismo no.
  // En mobile build (output:'export') Next.js ignora headers() — el static
  // host (Capacitor bundle) tiene que aplicarlos por separado, no aplica acá.
  ...(!isMobileBuild && {
    async headers() {
      return [
        // ─── Security headers globales ───
        // Aplicados a TODA respuesta. Defaults seguros sin CSP (CSP requiere
        // audit dedicado para no romper inline scripts/styles del bundle Next).
        {
          source: "/(.*)",
          headers: [
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
            {
              key: "Permissions-Policy",
              value: "camera=(self), microphone=(), geolocation=(self)",
            },
          ],
        },
        {
          source: "/sw.js",
          headers: [
            { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
            { key: "Service-Worker-Allowed", value: "/" },
          ],
        },
        {
          source: "/manifest.webmanifest",
          headers: [
            { key: "Cache-Control", value: "public, max-age=3600" },
            { key: "Content-Type", value: "application/manifest+json" },
          ],
        },
        {
          source: "/offline.html",
          headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
        },
      ];
    },
  }),

  ...(isMobileBuild && {
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true, // Capacitor file:// loader plays nicer with /route/index.html
  }),
};

export default nextConfig;
