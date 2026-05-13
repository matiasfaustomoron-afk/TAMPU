# Travel OS — Subir al App Store SIN tener Mac

Tu PC Windows **no puede compilar iOS** (Apple lo prohíbe legalmente y técnicamente). Pero tenés 4 caminos para publicar Travel OS en App Store **sin comprar una Mac**.

## Comparación de opciones

| Ruta | Costo | Tiempo setup | Tiempo por build | Para vos sirve si... |
|---|---|---|---|---|
| **1. Codemagic CI/CD** | **GRATIS** 500 min/mes + $99/año Apple | 1 hora | 15-20 min auto | Querés que el build se dispare solo al hacer git push. **Recomendado.** |
| **2. GitHub Actions** | GRATIS si repo público, sino 200 min/mes free + $99/año | 2 horas | 15-20 min auto | Ya usás GitHub y querés un solo lugar para todo |
| **3. MacInCloud** | USD 1/h o $20/mes + $99/año | 30 min | Manual con Xcode | Querés sentirte como teniendo Mac, control total |
| **4. AltStore / sideload** | USD 0 + $99/año (o $0 con cuenta personal) | 1 hora | Manual | Solo querés instalar Travel OS en TU iPhone, no publicar en App Store |

**Lo único que pagás obligado**: Apple Developer Program **USD 99/año** — necesario para cualquier opción que termine en App Store o TestFlight.

---

## Opción 1 — Codemagic (RECOMENDADA)

Mac en la nube + CI/CD nativo. Cada vez que pusheás a `main`, Codemagic compila el iOS, firma, sube a TestFlight, te avisa por email. **Vos nunca tocás una Mac.**

### Setup paso a paso

1. **Apple Developer Program** activo en [developer.apple.com](https://developer.apple.com) → pagás USD 99
2. **App Store Connect API key**:
   - [App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Keys → +
   - Role: App Manager
   - Descargá el `.p8` (solo una vez)
   - Anotá: Key ID + Issuer ID
3. **Crear app shell en App Store Connect**:
   - My Apps → + → New App
   - Bundle ID: `com.travelos.app`
   - SKU: `travelos-ios-001`
   - Anotá el **Apple App ID** (numerico, 10 dígitos)
4. **Conectar repo a Codemagic**:
   - [codemagic.io](https://codemagic.io) → Sign up con GitHub
   - Add application → seleccionás tu repo travel-os
   - Codemagic detecta el `codemagic.yaml` que ya está en el proyecto
5. **Conectar Apple credentials** en Codemagic:
   - Teams → Personal account → Integrations → App Store Connect
   - Pegás Key ID, Issuer ID, contenido del .p8
6. **Editar `codemagic.yaml`** (1 línea):
   ```yaml
   APP_STORE_APP_ID: "1234567890"  # ← acá poné el numérico del paso 3
   ```
7. **Primer build**:
   - Push a `main` → Codemagic builda automático
   - ~15-20 min después: el .ipa está en TestFlight Internal Testing
   - Te llega email con link
8. **Invitarte a TestFlight**:
   - App Store Connect → TestFlight → Internal Testing → +
   - Agregás tu Apple ID
   - Recibís invitación al iPhone → instalás vía TestFlight app

### Costo real Codemagic

- **Free**: 500 min/mes en Mac M2 = ~25 builds gratis/mes
- **Paid**: $0.038/min adicional. Un build extra cuesta ~$0.50-$1
- Privacy: Codemagic NO retiene tu código después del build

### Documentación
- Tu config está lista en [codemagic.yaml](../codemagic.yaml). Solo necesita tu APP_STORE_APP_ID.

---

## Opción 2 — GitHub Actions con macos-latest

Lo mismo que Codemagic pero usando los runners macOS de GitHub. Ventaja: ya está todo en GitHub. Desventaja: macOS minutes cuestan 10× en repos privados (tier free da efectivamente solo 200 min/mes en privados).

### Setup paso a paso

1. Apple Developer Program + App Store Connect API key (igual que opción 1)
2. **Fastlane Match para certificates**:
   - Crear un repo privado nuevo en GitHub: `travel-os-match-certs`
   - En tu Mac local (o pidiendo prestado una vez) corres `fastlane match init` → genera certs encriptados en ese repo
   - Si NO podés correr fastlane match nunca, usá App Store Connect API automatic signing (Codemagic lo hace solo, GitHub Actions requiere setup extra)
3. **GitHub secrets** (Settings → Secrets and variables → Actions):
   ```
   APPLE_ID                       tu-email@example.com
   APPLE_TEAM_ID                  ABCDE12345
   APP_STORE_CONNECT_KEY_ID       XYZ123ABCD
   APP_STORE_CONNECT_ISSUER_ID    69a6de7c-...
   APP_STORE_CONNECT_API_KEY      <contenido del .p8 entero>
   MATCH_PASSWORD                 <tu password de match>
   MATCH_REPO_URL                 git@github.com:tu-user/travel-os-match-certs.git
   MATCH_REPO_TOKEN               <PAT con read en ese repo>
   ```
4. **Push a main** → workflow corre automático
5. El `.github/workflows/ios-testflight.yml` ya está incluido en el repo

### Costo real
- Repo público: GRATIS unlimited
- Repo privado: 200 min/mes free de macOS efectivos (~10 builds)
- Extra: USD 0.08/min para macOS = ~$1.20 por build adicional

---

## Opción 3 — MacInCloud (Mac alquilada)

Te conectás vía Remote Desktop a una Mac real en datacenter. Es como tener Mac propia pero pagás por uso. **Útil si querés debugear visual en Xcode o usar simulador.**

### Setup paso a paso

1. [macincloud.com](https://www.macincloud.com) → Plan "Pay-As-You-Go" o "Managed Server"
   - Pay-As-You-Go: USD 1/hora (mínimo $9)
   - Managed Dedicated: USD 20/mes (Mac mini con tu /Users)
2. Te dan Mac remoto vía RDP / VNC
3. Instalás Xcode + CocoaPods (~30 min primera vez)
4. `git clone` de tu repo dentro del Mac remoto
5. Corrés:
   ```bash
   npm install
   npm run build:mobile
   npm run cap:add:ios
   cd ios/App && pod install && cd ../..
   npm run cap:open:ios
   ```
6. En Xcode: signing + archive + upload, todo manual visual
7. Cuando terminás, te desconectás. El Mac queda apagado y no facturás

### Costo real
- 1 build manual ~30 min de Mac = USD 0.50
- Tarjeta de developer USD 99/año
- Total año 1 con 20 builds: ~USD 110

---

## Opción 4 — AltStore (solo TU iPhone, sin App Store)

Si **NO querés publicar en App Store** y solo querés Travel OS en TU iPhone (uso personal), [AltStore](https://altstore.io) te permite sideload apps sin Mac.

### Cómo

1. Generás el `.ipa` con Codemagic (Opción 1) o pedís a alguien con Mac
2. Instalás **AltStore** en tu iPhone (proceso de 10 min)
3. Drag-drop el `.ipa` a AltStore → instalado
4. Re-firmar cada 7 días (auto con AltServer corriendo en una PC en tu red)

### Costo
- **GRATIS** con cuenta Apple personal (sin Developer Program)
- O USD 99/año Developer Program → re-firma cada 1 año en vez de cada 7 días

### Limitación
- Solo TU iPhone (max 3 dispositivos por cuenta free)
- No es App Store distribution
- Apple puede revocar la firma en cualquier momento

---

## Mi recomendación honesta

Para Travel OS específicamente:

**Si querés publicar en App Store** (alcance público, downloads):
→ **Codemagic** (Opción 1). Cero conocimiento de Mac requerido, free tier alcanza, todo automatizado. Hagamos esto.

**Si solo querés usarlo en TU iPhone**:
→ **AltStore** (Opción 4). Más rápido, gratis, no necesitás Developer Program siquiera.

**Si querés control visual completo**:
→ **MacInCloud Managed** (Opción 3). USD 20/mes te da una Mac dedicada para siempre. Igual que tener Mac local pero sin comprarla.

**GitHub Actions** (Opción 2) es válida pero más setup. Solo si ya tenés todo en GitHub y querés un solo proveedor.

## Tu camino más corto a TestFlight

```
HOY:
  1. Pagar Apple Developer Program → USD 99 (apple.com/dev)
  2. Crear cuenta Codemagic → gratis (codemagic.io)
  3. Push del repo a GitHub
  4. Conectar Codemagic + Apple credentials → 30 min

EN 48 HORAS:
  5. Primer build automático en TestFlight (notification por email)
  6. Instalás Travel OS en tu iPhone vía TestFlight app
  7. Probás los 6 escenarios del TESTFLIGHT-CHECKLIST.md

EN 1 SEMANA:
  8. Llenás metadata en App Store Connect (10 min con APP-STORE-METADATA.md)
  9. Submit for App Review
  10. Apple revisa en 24-48h con baja prob de rechazo (mitigaciones ya implementadas)
```

**Total dinero gastado**: USD 99 (Apple) + USD 0 (Codemagic free tier) = **USD 99/año**.

**Total tiempo activo tuyo**: ~3 horas (setup) + ~30 min al día para revisar builds y subir metadata.

**Vos nunca tocaste una Mac.**
