# Travel OS — iOS Build Guide

End-to-end: de cero a una build de Travel OS abierta en Xcode, lista para TestFlight.

## 0. Pre-requisitos (Mac)

| Requisito | Versión recomendada | Cómo |
|---|---|---|
| macOS | 14 (Sonoma) o 15 (Sequoia) | — |
| Xcode | 15.4 o superior | App Store |
| CocoaPods | 1.15+ | `brew install cocoapods` |
| Node.js | 20+ | `brew install node` |
| Apple Developer Program | activo (USD 99/año) | [developer.apple.com](https://developer.apple.com) |

## 1. Setup inicial (una sola vez)

```bash
# Clonar el repo en la Mac
git clone <repo> && cd travel-os

# Instalar dependencias
npm install

# Build estático para mobile
npm run build:mobile
# Esto genera ./out con el sitio estático (sin /api/* ni middleware)

# Generar el proyecto iOS nativo
npm run cap:add:ios
# Esto crea ./ios con un Xcode project completo

# Instalar pods (Capacitor + plugins nativos)
cd ios/App && pod install && cd ../..

# Abrir en Xcode
npm run cap:open:ios
```

## 2. Configuración en Xcode (una sola vez)

Una vez abierto el proyecto en Xcode (`ios/App/App.xcworkspace`):

### 2.1 Bundle Identifier + Signing
- General → Identity → Bundle Identifier: `com.travelos.app`
- Signing & Capabilities → Team → seleccionar tu Apple Developer team
- Provisioning: usar "Automatically manage signing"

### 2.2 Display Name + Version
- General → Display Name: `Travel OS`
- General → Version: `1.0.0`
- General → Build: `1` (incrementar por cada upload a TestFlight)

### 2.3 Permisos (Info.plist) — JUSTIFICACIONES OBLIGATORIAS
Editar `ios/App/App/Info.plist`. Añadir solo los que uses:

```xml
<key>NSCameraUsageDescription</key>
<string>Travel OS usa la cámara para que puedas escanear pasaportes, recibos y boarding passes y guardarlos en el Vault.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Travel OS accede a tu galería para que puedas subir copias de documentos al Vault.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Travel OS guarda los resúmenes de viaje exportados en tu galería.</string>
```

**No** agregues permisos que la app no usa. Apple rechaza apps con permisos no justificados.

### 2.4 Capabilities
- Signing & Capabilities → "+ Capability"
  - **Push Notifications** (si vas a enviar push remotos vía APNs)
  - **Background Modes** → Remote notifications (si vas a refrescar datos en background)
  - **Associated Domains** → `applinks:travel-os.app` (si usás universal links)

### 2.5 Iconos + Splash
- Reemplazar `ios/App/App/Assets.xcassets/AppIcon.appiconset/` con el set de iconos generado (ver § 4).
- Reemplazar `ios/App/App/Assets.xcassets/Splash.imageset/` con el splash 2732×2732 PNG.

## 3. Build & Run

### En simulador
```bash
npm run build:mobile && npx cap sync ios
npx cap run ios
```

### Build para TestFlight (Archive)
1. En Xcode: Product → Scheme → Edit Scheme → Run → Build Configuration: **Release**
2. Product → Destination: **Any iOS Device (arm64)**
3. Product → **Archive**
4. Cuando termine, se abre Organizer → Distribute App → **App Store Connect** → Upload
5. Esperar email de Apple confirmando el procesamiento (~30-60 min)
6. En App Store Connect → TestFlight → asignar a testers

## 4. Iconos y assets nativos

Apple exige el set completo. Genéralo desde el SVG base con:

```bash
# Opción A: appicon.co (gratis, web)
# Sube public/icon.svg, descargá el zip con todos los tamaños, copialo a Assets.xcassets

# Opción B: cordova-res (CLI)
npm install -g cordova-res
cordova-res ios --skip-config --copy
```

Requisitos:
- AppIcon: 20×20 hasta 1024×1024 (más de 20 tamaños distintos)
- Splash: 2732×2732 base (Capacitor escala)
- Marketing icon 1024×1024 sin transparencia (App Store Connect)

## 5. Comandos diarios (rebuilds rápidos)

```bash
# Después de cambios en código React:
npm run build:mobile && npx cap sync ios

# Si cambiaste capacitor.config.ts o agregaste plugin:
npx cap sync ios && cd ios/App && pod install && cd ../..

# Abrir Xcode:
npx cap open ios

# Live reload (durante dev):
npx cap run ios --livereload --external
# Apunta el iPhone físico/simulador al servidor de Next.js dev en tu Mac
```

## 6. Troubleshooting

| Error | Causa común | Fix |
|---|---|---|
| `Module not found: @capacitor/preferences` | plugin nuevo sin sync | `npx cap sync ios && pod install` |
| `dyld: Symbol not found` | mismatch entre Capacitor core y plugin | Misma major version para todos los `@capacitor/*` |
| `out/ folder not found` | build:mobile no corrió | `npm run build:mobile` antes de `cap sync` |
| `app crashes on launch with file://` | `webDir` mal configurado | Verificar `capacitor.config.ts` apunta a `out` |
| `Network request failed` en simulador | tu API local no tiene CORS | Agregar `Access-Control-Allow-Origin: capacitor://localhost` en /api/* |
| Pod install falla "minimum platform" | Xcode viejo | Actualizar Xcode |

## 7. Diferencias críticas entre web y mobile build

| Feature | Web (`npm run build`) | Mobile (`npm run build:mobile`) |
|---|---|---|
| `/api/assistant` | Local, server-side | Llama a `NEXT_PUBLIC_API_BASE_URL/api/assistant` (Vercel hosted) |
| Middleware auth | Activa | Removida (auth client-side con Supabase JS) |
| Service Worker | Activo | Capacitor maneja offline; SW puede quedar como backup |
| Routing | SSR | Pre-rendered static + client-side nav |

## 8. Antes de subir a App Store Connect

Ver [APP-STORE-METADATA.md](./APP-STORE-METADATA.md) y [APPLE-REVIEW.md](./APPLE-REVIEW.md).
