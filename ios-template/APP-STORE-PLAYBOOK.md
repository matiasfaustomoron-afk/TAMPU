# Tampu — App Store submission playbook

Plan paso a paso para llevar Tampu de "código en Windows" a "app en App Store".
Todo está pensado para minimizar idas y vueltas con Apple Review.

---

## 0 · Pre-requisitos one-time

- [ ] **Apple Developer Account** activa ($99/año). Si la empresa va a tener apps adicionales, considerá registrarte como **organización** (D-U-N-S) en lugar de individual; los reviews son idénticos pero el branding "Tampu Inc" se ve mejor en App Store.
- [ ] **Mac con Xcode 15.4+** (Xcode 16 si querés iOS 18 features). En Windows no se puede compilar nativo.
- [ ] **iPhone físico iOS 17.3+** para TestFlight (el simulador no muestra Live Activities ni Apple Wallet add).
- [ ] **Dominio `tampu.app` (o subdomain) en vivo** para Privacy URL + Marketing URL. App Store rechaza apps con `localhost:3000/privacy`.
- [ ] **`bundle install` de CocoaPods** (Capacitor lo requiere).

---

## 1 · Setup nativo iOS (post `npx cap add ios`)

### 1.1 Identifiers + capabilities

Apple Developer Portal → Identifiers → App IDs:

- [ ] **App ID**: `com.tampu.app` (matchea `capacitor.config.ts`)
- [ ] **Capabilities a habilitar**:
  - [x] Push Notifications (para Live Activities + alertas de vuelo)
  - [x] Associated Domains (deep links `tampu://...` y Universal Links `https://tampu.app/trips/abc`)
  - [x] iCloud (con container `iCloud.com.tampu.app` para backup automático)
  - [x] App Groups (`group.com.tampu.app` para Widget data sharing)
  - [ ] In-App Purchase: **NO** (Tampu no cobra)
  - [ ] Wallet: **SÍ** si vamos a emitir .pkpass propios (gap 5)

### 1.2 Pass Type ID (para Apple Wallet)

- [ ] Apple Developer → Identifiers → Pass Type IDs → registrar `pass.com.tampu.boarding`
- [ ] Generar certificate (.p12), descargar, convertir a .pem (ver `ios-template/Info.plist.usage-keys.md` paso 4)
- [ ] Setear ENV en Vercel/host: `PKPASS_TEAM_ID`, `PKPASS_PASS_TYPE_ID`, `PKPASS_SIGNER_CERT_B64`, `PKPASS_SIGNER_KEY_B64`, `PKPASS_WWDR_CERT_B64`

### 1.3 Info.plist usage descriptions

Ver `ios-template/Info.plist.usage-keys.md` — las 4 keys con texto en español para Apple Review.

### 1.4 Splash + Icons

```bash
npm run icons             # ya genera 24 PNGs con colores Tampu
```

Luego en Xcode:
- Copy `public/icons/ios/Icon-*.png` → `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Copy `public/icons/splash-2732.png` → `ios/App/App/Assets.xcassets/Splash.imageset/`
- Verificar Marketing icon `1024×1024 sin alfa` está en `marketing-1024.png`

---

## 2 · Build + TestFlight (interno)

```bash
# desde la Mac
npm run build:mobile
npm run cap:sync
npm run cap:open:ios          # abre Xcode
```

En Xcode:
- Product → Archive (con scheme = `App`, configuration = Release)
- Window → Organizer → Distribute App → App Store Connect → Upload
- En App Store Connect → TestFlight → Internal Testers (vos + equipo)

**Validación TestFlight obligatoria antes de Submit**:
- [ ] Onboarding completo (3 pantallas → carga ejemplo → trip aparece)
- [ ] `/today` muestra los 5 bloques sin layout shift
- [ ] `/vault` upload de foto desde cámara funciona
- [ ] `/import` paste de email → bookings detectados (con KEY de Anthropic configurada)
- [ ] `/expenses` budget por categoría guarda en Supabase
- [ ] `/journal` foto con location → geocode aparece como nombre legible
- [ ] Tab bar prefetch — cambio de tab < 200ms
- [ ] Backup local (botón "Descargar backup") genera JSON válido
- [ ] Dark mode toggle funciona (Settings → Apariencia)
- [ ] Offline mode: airplane mode → app sigue funcional con datos cacheados

---

## 3 · App Store Connect — metadata

### 3.1 App Information

| Campo | Valor |
|---|---|
| **Bundle ID** | `com.tampu.app` |
| **SKU** | `TAMPU-IOS-001` |
| **App Name** | `Tampu` |
| **Subtitle (30 chars)** | `Tu cartera de viaje` |
| **Primary Category** | Travel |
| **Secondary Category** | Productivity |
| **Content Rights** | Does not contain third-party content |

### 3.2 Pricing

Free. No In-App Purchases. (Cuando activemos affiliate, sigue siendo free — la comisión no es un IAP.)

### 3.3 App Privacy (cuestionario formal Apple)

Respuestas que coinciden con `/privacy`:

| Pregunta App Store Connect | Respuesta |
|---|---|
| Do you or your third-party partners collect data? | **Yes** (modo online) |
| Contact Info — Email Address | Yes · linked to user · used for Auth |
| User Content — Photos or Videos | Yes · linked to user · used for App Functionality |
| User Content — Other | Yes · linked to user · used for App Functionality (reservations, expenses) |
| Diagnostics — Crash Data | No |
| Diagnostics — Performance Data | No |
| Diagnostics — Other | No |
| Identifiers — Device ID | No |
| Identifiers — Other | No |
| Usage Data — Product Interaction | **Optional** · NOT linked to user · used for Analytics · only if user opts in to Plausible |
| Purchases | No |
| Location | **No** (la Geolocation captura del journal NO se sube — queda device-only) |
| Health & Fitness | No |
| Sensitive Info | No |
| Financial Info | No |
| Browsing History | No |
| Search History | No |
| Other Data | No |

**Tracking**: Tampu does **not** track. No ATT prompt required. `NSUserTrackingUsageDescription` NO debe estar en Info.plist.

### 3.4 App Store screenshots

Specs Apple:
- 6.7" (iPhone 14 Pro Max): 1290×2796 px
- 6.5" (iPhone 11 Pro Max): 1242×2688 px
- 5.5" (iPhone 8 Plus): opcional, 1242×2208 px

Set mínimo a entregar (10 screenshots por size):

1. **Hero shot** — `/today` con countdown destacado
2. **Cartera** — `/vault` con 3 wallet cards stack
3. **Importar (aha)** — `/import` con preview de bookings detectados
4. **Calendario** — `/itinerary` con grid 30 días + leyenda
5. **Dinero** — `/expenses` con donut + categorías
6. **Diario** — `/journal` con foto + likes + place
7. **Asistente** — `/assistant` con respuesta contextual
8. **Modo emergencia** — `/emergency` con SOS por país
9. **Onboarding aha** — pantalla 2 de welcome (email → pase)
10. **Cierre** — `/today` con NBA = "Tu vuelo en 3h"

Tool recomendado: `screenshots.mjs` (ver `scripts/screenshots.mjs`) + Figma frames para añadir device chrome.

### 3.5 App Description (en español, ES-AR)

```
Tu cartera de viaje. Sabe lo que te falta.

Reenviás un email de confirmación a Tampu — vuelo de LATAM, hotel de Booking,
seguro de Heymondo, voucher de transfer por WhatsApp — y aparece en tu viaje.
En español, portugués, inglés. Funciona offline en el aeropuerto.

· Cartera offline de boarding passes, pasaportes, seguros, vouchers
· Itinerario consolidado: vuelos, hoteles, traslados, actividades, día por día
· Presupuesto por categoría: vuelos, hoteles, comida, actividades…
· Asistente IA que conoce tu viaje y responde sobre el destino
· Modo emergencia con SOS, seguro, consulado, contactos
· Diario con likes, comentarios y geocoding por foto

Sin cuentas requeridas. Sin tracking. Tus datos viven en tu dispositivo.

Para viajeros que ya probaron TripIt y Notion y los abandonaron por idioma,
complejidad, o porque sus aerolíneas favoritas (LATAM, Aerolineas, Gol, Avianca)
no estaban soportadas.

Tampu (tambo): las postas del Camino del Inca. Ahora para tu viaje.
```

(Bilingüe: agregar versión EN en App Store Connect → Localizations → English.)

### 3.6 Keywords (100 chars)

```
viaje,viajar,cartera,boarding,pase,documentos,equipaje,vuelo,hotel,reserva,presupuesto,offline,latam
```

### 3.7 Support URL + Marketing URL

- Support URL: `https://tampu.app/support` (crear página simple con FAQ + email)
- Marketing URL: `https://tampu.app` (landing)
- Privacy Policy URL: `https://tampu.app/privacy` (lo que ya tenemos en `/privacy`)

---

## 4 · Review notes (lo que ve Apple)

Texto exacto a pegar en "App Review Notes":

```
Tampu is a travel companion app. It does NOT contain in-app purchases,
ads, or tracking. All user data is stored locally by default; optional
cloud sync requires the user's own Supabase project (we don't operate
backend servers).

DEMO MODE FOR REVIEW:
After install, tap "Cargar viaje de ejemplo" on the welcome screen
to load a pre-populated trip (Papua + Seoul 2026). No login required.

KEY FEATURES TO REVIEW:
1. Today (Hoy) — single-screen brief
2. Vault (Cartera) — offline document storage with IndexedDB
3. Import (Importar) — paste an email confirmation; LLM (Claude)
   parses it and proposes booking entries
4. Money (Dinero) — budget by category + expense tracker

TEST CREDENTIALS: Not applicable — demo mode is open without auth.

If you encounter the message "Sin tu key de IA conectada":
- The app falls back to a regex-based heuristic parser
- No external service is contacted in this mode
- You can verify offline functionality by enabling airplane mode

CONTACT FOR REVIEW QUESTIONS:
[email]: support@tampu.app
```

---

## 5 · Common rejections + fixes

| Reason de Apple Review | Fix |
|---|---|
| "Guideline 5.1.1 — Privacy" | Asegurar que las 4 usage descriptions en Info.plist están en español + justifican el uso real |
| "Guideline 4.0 — Design (looks like a webview)" | Mostrar features nativas: haptic, push notifications, Apple Wallet integration, Live Activity. **NO** mostrar URLs en la UI. |
| "Guideline 2.3.3 — Accurate Metadata" | Screenshots deben ser de la app real, no mockups. Subir capturas reales del simulator. |
| "Guideline 2.5.1 — Software Requirements" | Si usás APIs deprecadas (UIWebView), Apple rechaza. Capacitor 8 usa WKWebView correctamente. |
| "Demo account credentials missing" | Para apps con login, dar usuario + password de demo. Tampu evita esto con "Cargar viaje de ejemplo" sin auth. |
| "Privacy URL returns 404" | El dominio `tampu.app/privacy` tiene que estar VIVO al momento del submit (no localhost). |

---

## 6 · Post-launch · TestFlight beta externo

Después del primer Approved, abrir TestFlight a **beta externos**:
- Public link → distribuir a 25-50 viajeros LatAm
- Encuesta NPS dentro de la app después del primer viaje cargado
- Iterar con feedback antes de hacer "Release this Version" a producción

---

## 7 · Cuándo NO submitear

**Bloqueantes que requieren fix antes del Submit**:
1. Privacy URL no live (publicar landing primero)
2. Demo flow rompe (validar manual: instalar app limpia → load ejemplo → toda la app accesible)
3. Tests no verdes (`npm test` rojo)
4. Build no compila (`npm run build` rojo)
5. Sin TestFlight interno previo (Apple lo nota cuando un dev sube directo a Production sin TF)

---

## 8 · Timeline realista

| Hito | Tiempo |
|---|---|
| Setup macOS + Apple Developer + Xcode | 1 día |
| `npx cap add ios` + configurar capabilities + Info.plist | 0.5 día |
| Generar assets + copiar a Xcode | 1 día |
| Build + TestFlight interno + validar manual | 1 día |
| Screenshots reales + textos App Store Connect | 1 día |
| Submit + esperar review | 1-7 días (típico: 24-48h) |
| **TOTAL** | **~6-12 días calendario** |

Lo bloqueante NO es código (ya está). Es **acceso a Mac + Apple Developer + dominio público**.
