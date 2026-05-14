# Apple IAP — TODO (Tampu+ Lifetime en iOS)

Este doc es el placeholder para implementar Apple In-App Purchases (IAP)
cuando Tampu llegue a iOS App Store. **No está implementado todavía** —
el flow Stripe web cubre el early access (PWA + Vercel).

## Por qué Apple IAP es mandatory en iOS

Apple App Store Guideline **3.1.1** ("In-App Purchase") obliga a usar
StoreKit para cualquier "digital good or service" que se consuma dentro
de la app. Tampu+ Lifetime (proxy IA gestionado, badge, themes, crédito
marketplace) cae claramente en esa categoría.

Consecuencias:
- **NO podés mostrar un link a Stripe / web payment** dentro de la app iOS
  para venderle Tampu+ al user. Resultado: rechazo en review.
- **NO podés referirte indirectamente** al checkout externo ("comprá en
  nuestra web"). Apple lo considera "steering" y también lo rechaza.
- Sí podés mantener Stripe en **PWA + Capacitor para Android** — solo iOS
  necesita StoreKit obligatorio.

## Setup necesario (cuando llegue el momento)

### 1) Apple Developer account
- USD 99/año (individual o organization)
- Acceso a App Store Connect

### 2) Product en App Store Connect
- Crear In-App Purchase de tipo **Non-Consumable** (lifetime = una vez, no se gasta)
- Product ID sugerido: `com.tampu.plus.lifetime`
- Reference name: `Tampu Plus Lifetime`
- Precio: tier que mapee a USD 29 (Apple tier 30 = USD 29.99 aproximado)
- Display name + description en 3 idiomas (es, en, pt)
- Screenshot review (1 imagen)

### 3) Small Business Program (importante)
- Inscribirse a **Apple Small Business Program** si revenue < USD 1M/año
- Reduce comisión de **30% → 15%**
- USD 29 → Apple se queda con USD 4.35 en lugar de USD 8.70
- Setup en App Store Connect → Agreements → Apple Small Business Program

### 4) Capacitor plugin
Dos opciones:

**Opción A — `@capacitor-community/in-app-purchases`** (preferida)
- Plugin oficial-comunidad, bien mantenido (2024+)
- API simple: `Purchases.purchase(productId)`
- npm: `npm i @capacitor-community/in-app-purchases`
- Capacitor sync + iOS native config en `Info.plist`

**Opción B — RevenueCat** (más completo)
- Dashboard de analytics + recovery + entitlements management
- Free tier hasta USD 10k MTR
- Necesita SDK + dashboard separados
- Vale la pena si planeamos múltiples planes/regiones después

### 5) Server-side receipt validation
Apple devuelve un `receipt` (base64 string) al cliente cuando la compra
es exitosa. Hay que validarlo server-side antes de marcar al user como
Tampu+:

- Endpoint Apple production: `https://buy.itunes.apple.com/verifyReceipt`
- Endpoint sandbox: `https://sandbox.itunes.apple.com/verifyReceipt`
- Shared secret en App Store Connect → App-Specific Shared Secret

Crear `src/app/api/iap/verify-apple/route.ts`:
1. Recibe `{ receipt: string, product_id: string }` del cliente
2. POST al endpoint Apple con `{ "receipt-data": receipt, "password": SHARED_SECRET }`
3. Si valida y `product_id === "com.tampu.plus.lifetime"`, insertar
   row en `tampu_plus_lifetime` (igual que el Stripe webhook)
4. Idempotencia: usar `original_transaction_id` de Apple como
   `stripe_session_id` (renombrar columna a `provider_purchase_id` y
   agregar `provider` enum: 'stripe' | 'apple' | 'google').

### 6) Migración a la tabla
Cuando integremos Apple, refactorizar `tampu_plus_lifetime`:

```sql
alter table public.tampu_plus_lifetime
  add column provider text not null default 'stripe'
    check (provider in ('stripe', 'apple', 'google'));

alter table public.tampu_plus_lifetime
  rename column stripe_session_id to provider_purchase_id;

-- Drop columnas stripe-specific cuando ya no se usen exclusivamente.
```

### 7) Restore Purchases (Apple lo exige)
Apple Guideline 3.1.1 también exige un botón explícito **"Restore Purchases"**
para que el user que reinstala la app o cambia de device pueda recuperar
su lifetime. El `useTampuPlus().refresh()` ya está conectado a esto en
el UI de settings — solo hay que llamar `Purchases.restorePurchases()`
desde Capacitor en iOS antes del refresh.

## Estimación

- Setup Apple Developer + product: **0.5 días** (esperar approval del
  enrollment puede ser 1-7 días)
- Capacitor plugin integration: **0.5 días**
- Server-side validation endpoint: **0.5 días**
- Migración tabla + tests: **0.5 días**
- App review submission: **1-3 días** wait time

**Total trabajo activo: 1-2 días** (cuando Apple Dev account esté lista).

## Orden de operaciones en iOS

**CRÍTICO**: cuando deployemos a iOS, el flow tiene que ser:

1. Si `Capacitor.getPlatform() === 'ios'`:
   - Mostrar UI de Tampu+ con botón que dispara **Apple IAP** (StoreKit)
   - NO mostrar el link Stripe en absoluto
   - NO mencionar "USD 29 vía web" ni copy similar
2. Si web (PWA) o Android:
   - Stripe checkout como hoy
3. Si Apple rechaza el app: revisar que no haya ningún string del estilo
   "support us at tampu.app/upgrade" — Apple agarra esos disclaimers.

## Sin urgencia

Mientras Tampu sea PWA + early access en web, este TODO puede esperar.
El día que decidamos publicar en App Store (probablemente después de
validar product/market fit con el flow Stripe web), abrimos este doc y
lo ejecutamos.
