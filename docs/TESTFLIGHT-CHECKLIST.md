# Travel OS — TestFlight Checklist

Antes de subir a TestFlight, validar cada item.

## Pre-build (en código)

- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run lint` → 0 errors, 0 warnings
- [ ] `npm run test` → 123/123 verde
- [ ] `npm run build` (web) → 33 rutas OK
- [ ] `npm run build:mobile` → `./out` generado sin errores
- [ ] `NEXT_PUBLIC_API_BASE_URL` apuntando al deploy de Vercel (NO localhost)
- [ ] `NEXT_PUBLIC_ENABLE_DEMO_MODE=true` en el build mobile para garantizar demo accesible
- [ ] capacitor.config.ts: `appId`, `appName`, `webDir: "out"` correctos

## Build en Mac

- [ ] `cd ios/App && pod install` ejecuta sin errores
- [ ] Xcode abre el workspace sin warnings
- [ ] Signing & Capabilities: team seleccionado, "Automatically manage signing" activo
- [ ] Bundle ID: `com.travelos.app` (sin conflictos en Apple Developer)
- [ ] Display Name: "Travel OS"
- [ ] Version: 1.0.0 / Build: incrementado vs anterior
- [ ] Info.plist incluye SOLO los permisos que la app usa, con justificación clara

## Assets

- [ ] AppIcon set completo (20×20 a 1024×1024, todos los tamaños iOS)
- [ ] Marketing icon 1024×1024 sin transparencia, sin texto encima
- [ ] Splash screen 2732×2732 (logo centrado, fondo plano `#0a0a0f`)
- [ ] Screenshots para App Store (mínimo 3, máximo 10) por dispositivo:
  - [ ] iPhone 6.7" (iPhone 15 Pro Max) — 1290×2796
  - [ ] iPhone 6.5" (iPhone 11 Pro Max) — 1242×2688
  - [ ] iPhone 5.5" (iPhone 8 Plus) — 1242×2208
- [ ] Preview video (opcional) — 15-30s mostrando el Command Center

## QA flow (mínimo a probar antes de subir)

### Escenario 1 — Demo first run
- [ ] Instalar app en simulador limpio
- [ ] Splash screen aparece y desaparece (no white flash > 100ms)
- [ ] Login screen carga
- [ ] Tap en "Entrar en modo demo" → carga dashboard en <3s
- [ ] Dashboard muestra Countdown, Quick Access, Today (si aplica), KPIs, Next 7 days
- [ ] No errores en consola Xcode

### Escenario 2 — Navegación completa
- [ ] Cada item del sidebar/drawer abre la ruta correspondiente
- [ ] Bottom nav (mobile): Dashboard / Today / Assistant / SOS / Alerts funcionan
- [ ] FAB de gasto rápido abre el modal y guarda
- [ ] Volver atrás con swipe-back funciona
- [ ] Deep-link `travelos://dashboard` (si está configurado) abre la app

### Escenario 3 — Funciones nativas
- [ ] /summary → "Compartir" abre el iOS share sheet
- [ ] /summary → "ICS" guarda el archivo (verificar en Files app → On My iPhone)
- [ ] /emergency/print → renderiza correcto, layout A4
- [ ] Theme toggle: light / dark / system aplica sin recargar
- [ ] Status bar visible y legible en light + dark

### Escenario 4 — Offline
- [ ] Activar avión / WiFi off en simulador
- [ ] Recargar la app → carga shell + datos cacheados
- [ ] /emergency funciona offline
- [ ] /vault muestra status offline de cada doc
- [ ] Reactivar red → datos refrescan automáticamente

### Escenario 5 — Assistant IA
- [ ] /assistant carga
- [ ] Tap en pregunta preset → respuesta heurística (sin API key) ó Claude (con key)
- [ ] Sugerencias tienen prioridad coloreada y deep links
- [ ] Si no hay red → mensaje "No pude consultar el asistente"

### Escenario 6 — Robustez
- [ ] Cerrar app en background → reabrir → estado se preserva
- [ ] Llamada telefónica entrante durante la app → no crashea
- [ ] Rotación de pantalla → layout se reorganiza
- [ ] Memoria baja simulada (Hardware → Simulate Memory Warning) → no crashea

## App Store Connect — antes de submit

- [ ] Privacy policy URL: `https://travel-os.app/privacy` (debe ser accesible públicamente)
- [ ] Support URL: `https://travel-os.app` o un mailto
- [ ] Marketing URL: opcional
- [ ] Demo account credentials cargadas (ver APPLE-REVIEW.md)
- [ ] Review notes cargadas
- [ ] Privacy nutrition labels marcadas correctamente
- [ ] Category: "Travel" (primaria), "Productivity" (secundaria)
- [ ] Age rating: 4+ (sin contenido sensible)
- [ ] Pricing: Free
- [ ] Available in: Worldwide (o lista de mercados)

## TestFlight — distribución

- [ ] Internal Testing: equipo interno (sin review de Apple, instantáneo)
- [ ] External Testing: Beta Review de Apple (~24-48h primera vez)
- [ ] Build expira 90 días — replantear cronograma

## Bugs críticos conocidos / mitigaciones

Antes de release, documentar acá si descubrís:
- (vacío al día de publicación)

## Bloqueantes hard

Si CUALQUIERA de estos falla, NO subir:
1. La app crashea al abrir en simulador limpio
2. Modo demo no carga datos (data layer roto)
3. Permisos en Info.plist sin justificación o ausentes
4. Privacy policy URL devuelve 404
5. App muestra "powered by Vercel" visible (parece web wrapper)
6. Bundle size > 200MB (App Store límite por OTA)
