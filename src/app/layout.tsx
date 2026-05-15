import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Instrument_Serif } from "next/font/google";
import { SupabaseProvider } from "@/lib/context/supabase-provider";
import { TampuQueryProvider } from "@/lib/context/query-provider";
import { I18nProvider } from "@/i18n/provider";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker";
import { NativeBootstrap } from "@/components/layout/native-bootstrap";
import { GlobalErrorBoundary } from "@/components/layout/error-boundary";
import { OfflineIndicator } from "@/components/offline-indicator";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  // 400 body / 500 medium / 600 semibold (UI emphasis) / 700 bold / 800 display
  // 800 sirve para tabular numbers grandes en heroes y deja que el serif lleve el headline.
  //
  // Perf audit (mayo 2026): contamos uso real de cada peso antes de droppar.
  //   - font-medium (500): 134 ocurrencias en 50 archivos → KEEP.
  //   - font-extrabold/800: usado en `.tampu-display` (countdown hero) → KEEP.
  //   - 600/700: ubicuos en UI emphasis y body bold → KEEP.
  //   - 400: body default → KEEP.
  // Conclusión: todos los pesos cargados están justificados; no hay nada que
  // dropear sin regresión visual. Next.js descarga sólo las variantes que el
  // CSS realmente usa (subsetting); el costo marginal por weight extra es bajo.
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Tampu — todo tu viaje, en un lugar",
    template: "%s · Tampu",
  },
  description:
    "Documentos offline, itinerario, gastos y asistente. Tampu (tambo): la posta del Inca, ahora para tu viaje. Funciona sin que contrates nada.",
  manifest: "/manifest.webmanifest",
  applicationName: "Tampu",
  authors: [{ name: "Tampu" }],
  keywords: [
    "viajes", "itinerario", "boarding pass", "tambo",
    "asistente viaje", "documentos offline", "trip planner",
    "vault viaje", "presupuesto viaje",
  ],
  openGraph: {
    title: "Tampu — todo tu viaje, en un lugar",
    description:
      "Documentos, itinerario, gastos, asistente. La posta del viajero moderno.",
    siteName: "Tampu",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tampu",
    description: "Todo tu viaje, en un lugar. La posta del viajero moderno.",
  },
  // App Store Connect lee este URL como Privacy Policy URL en la submission.
  // También es referencia explícita para auditorías de compliance (GDPR, PDPL Argentina, LGPD Brasil).
  other: {
    "privacy-policy": "/privacy",
    "terms-of-service": "/terms",
  },
  appleWebApp: {
    capable: true,
    // 'default' lets the app bg color show through — works with light primary palette.
    // 'black-translucent' is wrong for a light-default app: it would force dark status text on warm bg.
    statusBarStyle: "default",
    title: "Tampu",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [
      { url: "/icon.svg" },
      { url: "/icon-180.png", sizes: "180x180" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe0" },  // lana de llama
    { media: "(prefers-color-scheme: dark)",  color: "#2a2118" },  // cuero cálido (no negro)
  ],
};

// Inline script — runs BEFORE React hydrates to set the .dark class from
// localStorage. Avoids flash of wrong theme.
// Default = light (lana de llama). Dark = explicit opt-in.
// We deliberately do NOT honor system preference: this is a hospitality-premium app,
// the light palette IS the identity. Dark is an option, not a fallback.
const THEME_BOOT_SCRIPT = `
  try {
    var t = localStorage.getItem('tampu-theme') || localStorage.getItem('travel-os-theme') || 'light';
    var d = t === 'dark';
    document.documentElement.classList.toggle('dark', d);
  } catch (e) { /* keep light default */ }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        {/* Apple PWA meta (Next.js Metadata API doesn't cover startup image / mobile-web-app-capable directly) */}
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" />
        <link rel="apple-touch-startup-image" href="/icons/splash-2732.png" />
      </head>
      <body className="min-h-screen antialiased">
        {/* Theme boot — corre BEFORE React hidrate via next/script para evitar
            FOUC del dark mode. Reemplaza al <script> inline en <head> que en
            React 19+ tira warning "Scripts inside React components are never
            executed when rendering on the client". */}
        <Script
          id="tampu-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        <GlobalErrorBoundary>
          <TampuQueryProvider>
            <SupabaseProvider>
              <I18nProvider>
                {children}
              </I18nProvider>
            </SupabaseProvider>
          </TampuQueryProvider>
        </GlobalErrorBoundary>
        <ServiceWorkerRegistrar />
        <OfflineIndicator />
        <NativeBootstrap />
      </body>
    </html>
  );
}
