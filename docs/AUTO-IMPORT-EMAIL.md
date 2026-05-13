# Travel OS — Auto-import via inbound email

El parser de bookings con IA (`/import` + `/api/parse-booking`) ya está implementado y funciona con **paste-to-parse**. Para alcanzar la paridad completa con TripIt Pro (forward `plans@tripit.com` y bookings aparecen mágicamente), agregá un email-forward endpoint.

## Arquitectura

```
[User's email]                 [SendGrid Inbound Parse]      [Vercel /api/inbound-mail]   [Supabase]
   │                                  │                              │                          │
   │ Forward booking confirmation     │                              │                          │
   │ ───────────────────────────►  travelos@inbound.travelos.app     │                          │
   │                                  │                              │                          │
   │                                  │  POST email payload          │                          │
   │                                  │ ─────────────────────────►   │                          │
   │                                  │                              │  Parse with Claude       │
   │                                  │                              │  Identify user by from   │
   │                                  │                              │  Insert reservation ──►  │
   │                                                                                            │
[User opens app]                                                                                │
   │  Notification: "Nueva reserva detectada: Emirates GRU→DXB→MNL"                            │
```

## Pre-requisitos

1. Dominio propio: `travelos.app` (o el que uses para deploy)
2. Cuenta en **SendGrid** (free tier: 100 emails/día inbound, suficiente para uso personal). Alternativas: **Mailgun Routes**, **AWS SES + Lambda**, **Postal** (self-host).

## Setup paso a paso

### 1. DNS

Configurar MX record para subdomain inbound:
```
inbound.travelos.app.   IN MX 10 mx.sendgrid.net.
```

### 2. SendGrid Inbound Parse

```
SendGrid dashboard → Settings → Inbound Parse → Add Host & URL
  Subdomain: inbound
  Domain: travelos.app
  Destination URL: https://travelos.app/api/inbound-mail
  Check: ✓ Spam Check
```

### 3. Endpoint Vercel

Crear `src/app/api/inbound-mail/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // SendGrid sends multipart/form-data
  const form = await req.formData();
  const from = String(form.get("from") || "");
  const subject = String(form.get("subject") || "");
  const text = String(form.get("text") || "");
  const html = String(form.get("html") || "");

  // 1. Identify user by from-email (must match a registered Supabase user)
  const email = from.match(/<([^>]+)>/)?.[1] || from;
  // ... lookup user_id

  // 2. Parse the body using Claude (same logic as /api/parse-booking)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const parsed = apiKey ? await callClaude(text || html, apiKey) : null;
  if (!parsed) return NextResponse.json({ ok: false }, { status: 200 });

  // 3. Insert reservation into the user's active trip
  // ... Supabase service-role insert

  // 4. Send a push notification ("Nueva reserva detectada")
  // ... use APNs flow from PUSH-NOTIFICATIONS-APNS.md

  return NextResponse.json({ ok: true, parsed });
}
```

### 4. Address del usuario

Cada usuario tiene una address única tipo:
```
travelos+<user-hash>@inbound.travelos.app
```

Donde `<user-hash>` es un hash corto del user_id que validás server-side. Esto evita spoofing (alguien forwardea email a otra cuenta).

### 5. UX en la app

En /settings agregar:
```tsx
<div>
  <p className="text-sm">Tu address de auto-import:</p>
  <code className="font-mono text-xs">travelos+{user.id.slice(0,8)}@inbound.travelos.app</code>
  <button onClick={() => navigator.clipboard.writeText(...)}>Copiar</button>
  <p className="text-[10px]">Forwardear emails de confirmación a esta address y aparecen en /reservations.</p>
</div>
```

## Privacidad

- Los emails SE PROCESAN en SendGrid + Vercel + Anthropic (si la API key está). Comunicarlo claramente en la privacy policy.
- **NO** se almacenan emails crudos en Supabase. Solo el resultado parseado.
- Botón "Disable auto-import" debe stoppear el procesamiento en una flag por usuario.

## Costo

- SendGrid free: 100 emails/día = suficiente para usuario individual
- SendGrid Essentials: USD 14.95/mes para 50k emails — solo si escalás
- Anthropic API: ~$0.003/parse con Sonnet → 100 emails/día ≈ $9/mes en API costs

## Plan B sin SendGrid

**Postal** (open source, self-hosted) elimina el costo SendGrid. Necesita server VPS + DNS. Más trabajo de mantenimiento pero data soberanía 100%.

## Por qué importa

Esto es lo único que TripIt Pro tiene y Travel OS no. Implementarlo elimina la última razón racional para pagar $49/año de TripIt.
