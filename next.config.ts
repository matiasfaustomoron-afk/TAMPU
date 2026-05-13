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
  // Tree-shaking explícito para imports de íconos: solo se incluye lo que usás.
  // En Next 16 + Turbopack esto evita el "barrel import" que arrastra los ~1000
  // glyphs de lucide-react al bundle inicial.
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons", "date-fns"],
  },

  // ─── External photo sources permitidas ───
  // Wikimedia Commons sirve fotos icónicas curadas por Wikipedia editors (Tier 2).
  // Unsplash CDN para fallback long-tail (Tier 3).
  // images.unsplash.com requiere whitelist explícito en Next/Image.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  // Bundle analyzer: instalá `@next/bundle-analyzer` y corré `ANALYZE=1 npm run build`.
  // Lo dejamos como instrucción en lugar de require dinámico para no romper el build
  // si la dep no está en package.json.

  ...(isMobileBuild && {
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true, // Capacitor file:// loader plays nicer with /route/index.html
  }),
};

export default nextConfig;
