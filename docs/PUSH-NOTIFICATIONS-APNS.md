# Travel OS — Push Notifications via APNs

Travel OS implementa el wrapper cliente para push notifications con `@capacitor/push-notifications`. Lo que sigue es la configuración del lado **APNs** (Apple) + **server** (Vercel + Supabase) para hacerlo funcionar end-to-end.

## Arquitectura

```
[iOS device]                    [Vercel /api/push]              [APNs]            [Supabase]
   │                                  │                            │                  │
   │  registerForPush()               │                            │                  │
   │ ─────────────────────────────► token                          │                  │
   │                                  │                            │                  │
   │  POST /api/push/subscribe        │                            │                  │
   │  { token, user_id }      ──────► │ ─── insert ───────────────────────────────► device_subscriptions
   │                                                                                  │
   │                                                                                  │
   │                  [alert engine detects critical deadline]                        │
   │                                  │                                               │
   │                                  │ ◄─ SELECT tokens WHERE user_id = X ─────────  │
   │                                  │                                               │
   │                                  │ ── HTTP/2 POST → APNs ──► │                   │
   │                                  │                            │                  │
   │ ◄────── push notification ──────────────────────────────────  │                  │
```

## Pre-requisitos

1. **Apple Developer Program** activo (USD 99/año)
2. **App ID** registrado en developer.apple.com con Push Notifications capability habilitado
3. **APNs Auth Key** (.p8) — preferido sobre certificate. Lo generás en developer.apple.com → Keys → +

## Setup paso a paso

### 1. En el Apple Developer portal

```
1. Identifiers → + → App IDs → App
   - Description: Travel OS
   - Bundle ID: com.travelos.app
   - Capabilities: ✓ Push Notifications, ✓ Sign In with Apple (opcional)

2. Keys → + → Apple Push Notifications service (APNs)
   - Name: TravelOS APNs Auth Key
   - Description: Production push
   - Download AuthKey_XXXXXXXXXX.p8 (only once — guardalo seguro)
   - Anotá el Key ID + Team ID
```

### 2. En Xcode (en la Mac, después de `npm run cap:add:ios`)

```
- App target → Signing & Capabilities → + Capability → Push Notifications
- App target → Signing & Capabilities → + Capability → Background Modes
  - ✓ Remote notifications
```

### 3. En el server (Vercel)

Agregá variables de entorno:
```
APNS_AUTH_KEY=-----BEGIN PRIVATE KEY-----\n<contents-of-p8>\n-----END PRIVATE KEY-----
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=YOUR_TEAM_ID
APNS_BUNDLE_ID=com.travelos.app
APNS_PRODUCTION=true   # false en TestFlight builds
```

### 4. Endpoint para suscribir devices

Crear `src/app/api/push/subscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { token, platform } = await req.json();
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  await supabase.from("device_subscriptions").upsert({
    user_id: user.id,
    endpoint: `apns:${token}`,
    p256dh: platform, // reusing column for platform marker
    auth_key: "",
  });

  return NextResponse.json({ ok: true });
}
```

### 5. Disparar push desde el alert engine

Crear `src/app/api/push/dispatch/route.ts`. Pseudocódigo:

```ts
// Iterate over active critical alerts, find users with deadlines in <24h, push.
// Use a JWT-signed APNs HTTP/2 request.
import jwt from "jsonwebtoken"; // npm install jsonwebtoken
import { connect } from "node:http2";

function makeApnsJwt() {
  return jwt.sign({}, process.env.APNS_AUTH_KEY!, {
    algorithm: "ES256",
    issuer: process.env.APNS_TEAM_ID,
    keyid: process.env.APNS_KEY_ID,
  });
}

async function send(token: string, payload: object) {
  const host = process.env.APNS_PRODUCTION === "true"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
  const client = connect(host);
  const req = client.request({
    ":method": "POST",
    ":path": `/3/device/${token}`,
    "apns-topic": process.env.APNS_BUNDLE_ID,
    "apns-push-type": "alert",
    authorization: `bearer ${makeApnsJwt()}`,
    "content-type": "application/json",
  });
  req.end(JSON.stringify({ aps: { alert: payload, sound: "default" } }));
}
```

### 6. Schedule (cron o Vercel cron)

Crear `vercel.json` cron entry:
```json
{
  "crons": [
    { "path": "/api/push/dispatch", "schedule": "0 9 * * *" }
  ]
}
```

## Cliente (ya implementado)

En `src/lib/native/platform.ts` ya hay:
```ts
export async function registerForPush(): Promise<PushRegistration | null>
```

Para activarlo en algún punto del flujo (ej. después del primer login en Settings):

```tsx
import { registerForPush } from "@/lib/native/platform";

const handleEnableNotifications = async () => {
  const reg = await registerForPush();
  if (!reg) {
    alert("No se pudo activar push notifications");
    return;
  }
  await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: reg.token, platform: reg.platform }),
  });
};
```

## Testing

```bash
# Local: usar APNS sandbox (APNS_PRODUCTION=false)
# Necesitás un device físico inscripto en TestFlight + tu .p8 key

# Probar push manualmente con tu token:
curl -X POST https://api.sandbox.push.apple.com/3/device/<DEVICE_TOKEN> \
  -H "authorization: bearer <JWT>" \
  -H "apns-topic: com.travelos.app" \
  -H "apns-push-type: alert" \
  -d '{"aps":{"alert":"Test from Travel OS","sound":"default"}}'
```

## Quota / Cost

APNs es **gratis** sin límite documentado (sujeto al fair-use). Tu costo está en:
- Vercel function invocations (1M gratis/mes en hobby tier)
- Supabase rows en device_subscriptions (incluido en free tier de Supabase)

## Privacy compliance

- **Permission**: solo se pide al usuario después de un opt-in explícito (botón "Activar notificaciones")
- **Background mode**: solo "Remote notifications", no "Background fetch" (Apple es estricto con esto)
- **Privacy nutrition label**: marcar `Device ID` como NOT collected, `User ID` solo si online mode activo
