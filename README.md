# Travel OS

Sistema personal de gestión de viajes. Online-first, mobile-first, Supabase-backed.

## Features

- **i18n nativo** — Español / English con selector en login y ajustes. Fechas, moneda y números localizados.
- **20 rutas** — Dashboard, tareas, gastos, presupuesto, reservas, itinerario, documentos, packing, alertas, vault, notificaciones, viajes, ajustes, perfil, login.
- **Motor de alertas dinámico** — 19 tipos de alerta derivados de datos reales, no hardcodeados.
- **Document Vault** — Subida de archivos (PDF, imágenes), categorías, favoritos, búsqueda.
- **Centro de notificaciones** — Tabla de notificaciones, push subscriptions, preferencias.
- **Readiness score ponderado** — Tasks 25%, reservations 20%, docs 15%, packing 10%, budget 15%, itinerary 15%.
- **21 tests de dominio** — readiness, forecast, night-coverage, alert-engine.

## Architecture

```
src/
├── i18n/           dictionaries (es/en), provider, config
├── lib/
│   ├── config/     constants, enums
│   ├── context/    SupabaseProvider (online | demo | unconfigured)
│   ├── data/       pure Supabase CRUD — NO localStorage
│   ├── demo/       demo-store + seed-data (behind NEXT_PUBLIC_ENABLE_DEMO_MODE)
│   ├── domain/     readiness, forecast, night-coverage, alerts, dashboard
│   ├── hooks/      useQuery + explicit mode branching
│   └── supabase/   client + server
├── components/     layout, shared, UI primitives
└── app/            20 routes (Next.js App Router)

supabase/migrations/  14 ordered SQL files
```

## Quick Start

```bash
npm install

# Demo mode (no backend):
echo "NEXT_PUBLIC_ENABLE_DEMO_MODE=true" > .env.local
npm run dev    # http://localhost:3000

# Online mode (Supabase):
# See docs/DEPLOY-GUIDE.md for full instructions
```

## Commands

```bash
# Web (Next.js / Vercel)
npm run dev               # Development (http://localhost:3000)
npm run build             # Production web build (33 rutas SSR + API)
npm run start             # Production server
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run test              # Vitest (123 tests)

# Mobile (Capacitor + iOS)
npm run icons             # Generate full iOS + PWA icon set from public/icon.svg
npm run build:mobile      # Static export → ./out (33 rutas, sin /api, sin middleware)
npm run cap:add:ios       # Scaffold ios/ Xcode project (needs Mac)
npm run cap:sync          # Sync web build to native iOS project
npm run cap:open:ios      # Open in Xcode (needs Mac)
npm run ios               # build:mobile + cap:sync + cap:open:ios
```

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Radix UI · Supabase · Vitest 4 · happy-dom · Recharts · Leaflet · Capacitor 8 · i18n (es/en)

## Mobile / iOS

Travel OS está preparado para iOS via Capacitor. Documentación:

- [docs/IOS-BUILD-GUIDE.md](docs/IOS-BUILD-GUIDE.md) — build end-to-end de cero a Xcode
- [docs/APPLE-REVIEW.md](docs/APPLE-REVIEW.md) — review notes, cuenta demo, privacy labels, plan de mitigación 4.2
- [docs/TESTFLIGHT-CHECKLIST.md](docs/TESTFLIGHT-CHECKLIST.md) — 6 escenarios QA + bloqueantes hard
- [docs/APP-STORE-METADATA.md](docs/APP-STORE-METADATA.md) — descripción, keywords, screenshots, age rating

Plugins nativos integrados:
- Share (iOS share sheet)
- Filesystem (save ICS export to Documents)
- Local Notifications (deadline reminders offline)
- Camera (escanear pasaporte/recibos al Vault)
- Haptics (feedback táctil en FAB + toggles)
- Status Bar + Splash Screen
- Preferences (KV storage nativo)
- App (deep links + foregrounding)

Páginas legales públicas (sin auth):

- [/privacy](src/app/privacy/page.tsx) — Privacy Policy
- [/terms](src/app/terms/page.tsx) — Terms of Service
