# Deploy runbook — Tampu early access

Este es el camino real para deployar Tampu a Vercel y entregarles el link a 3-5 testers conocidos. Te lleva ~2-3 horas la primera vez si nunca usaste estos servicios; ~30 min si ya estás familiarizado.

No es un workshop corporativo. Es la lista de cosas que tenés que hacer un sábado a la noche con una cerveza. Si algo se rompe, el rollback está al final (sección 9).

> El doc viejo `DEPLOY-GUIDE.md` es **legacy pre-pivot**. Este lo reemplaza en la práctica, pero dejamos el otro como referencia histórica.

---

## Pre-flight local

Antes de tocar nada externo, asegurate que el repo está sano:

```bash
git status                # working tree clean (o al menos sin sorpresas)
npm install               # termina sin errores
npx tsc --noEmit          # exit 0
npm run build             # exit 0
npm test                  # tests pasan (o al menos los que te importan)
```

Si alguno falla, fixealo acá. Vercel va a correr `npm run build` igual y vas a debuggear remoto, que es peor.

---

## 1. Supabase

Postgres + Auth + Storage. Plan free aguanta el early access tranquilo.

1. Signup en https://supabase.com (con GitHub si querés).
2. **New project** →
   - Name: `tampu-prod`
   - Region: **South America (São Paulo)** — latencia más baja para LatAm
   - Generá una password fuerte para el postgres (guardala, te va a hacer falta si después querés conectar `psql` directo)
3. Esperá ~2 min a que el project esté ready.
4. **Settings → API**:
   - Copiá `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copiá `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copiá `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`
5. **Aplicar migrations**. Dos caminos:

   **Camino A — CLI (recomendado)**:
   ```bash
   npx supabase login                          # abre browser
   npx supabase link --project-ref <REF>       # <REF> es el slug del project URL
   npx supabase db push
   ```

   **Camino B — SQL Editor** (si la CLI te tiene podrido):
   - SQL Editor → New query
   - Pegá cada archivo de `supabase/migrations/` **en orden estricto**, uno a la vez:
     ```
     00001_extensions.sql
     00002_profiles.sql
     00003_trips.sql
     00004_cities.sql
     00005_reservations.sql
     00006_documents.sql
     00007_tasks.sql
     00008_trip_days.sql
     00009_budget_expenses.sql
     00010_packing_alerts.sql
     00011_triggers.sql
     00012_rls.sql
     00013_attachments.sql
     00014_notifications.sql
     00015_trip_members.sql
     00016_email_inbox.sql
     00017_realtime_publication.sql
     00018_destination_photos.sql
     00019_print_book_orders.sql
     00020_curated_destinations.sql
     00021_email_in_entries.sql
     00022_ai_proxy_usage.sql
     00023_tampu_plus_lifetime.sql
     00024_whatsapp_links.sql
     00025_whatsapp_messages.sql
     ```

6. **Verificar tablas clave**: SQL Editor →
   ```sql
   select table_name from information_schema.tables
   where table_schema = 'public'
   and table_name in ('tampu_plus_lifetime','ai_proxy_usage','whatsapp_links','whatsapp_messages');
   ```
   Tienen que aparecer las 4.

7. **Auth**:
   - Authentication → Providers → Email → habilitado, "Enable email confirmations" prendido
   - Authentication → URL Configuration → Site URL: dejala vacía por ahora, la setás después del deploy de Vercel
   - Email templates: dejá los defaults; Magic Link funciona out-of-the-box

---

## 2. Stripe (test mode primero)

No vayas a live mode todavía. Argentina verification es un proceso aparte (24-48h, KYC, comprobante de domicilio). Para 5 testers con tarjeta `4242 4242 4242 4242` test mode alcanza y sobra.

1. Signup en https://stripe.com → dejá la cuenta en **test mode** (toggle arriba a la derecha).
2. **Developers → API keys**:
   - Copiá `Secret key` (`sk_test_...`) → `STRIPE_SECRET_KEY`
   - Copiá `Publishable key` (`pk_test_...`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://<tu-deploy>.vercel.app/api/webhooks/stripe`
     *(usá un placeholder, lo actualizamos en sección 6 con la URL real)*
   - Events to send:
     - `checkout.session.completed`
     - `charge.refunded`
     - `charge.dispute.created`
   - Add endpoint → copiá `Signing secret` (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`
4. Test card para los testers: `4242 4242 4242 4242` / cualquier CVC / cualquier fecha futura. Stripe la procesa como aprobada.
5. **NO toques live mode** hasta tener Argentina verification — fuera del scope del early access.

---

## 3. Twilio WhatsApp Sandbox

Diferenciador competitivo. El user reenvía la confirmación del Airbnb al sandbox y el parser la convierte en reservation. Sandbox es gratis y al alcance hoy mismo; el approved sender (número Tampu real) es un proceso de Meta de 24-48h y queda fuera del early access.

1. Signup en https://www.twilio.com/try-twilio (regalan USD 15 de crédito).
2. **Console → Messaging → Try it out → Send a WhatsApp message → Sandbox**.
3. Sender fijo del sandbox: `whatsapp:+14155238886`. **No se puede cambiar** en sandbox mode.
4. Cada tester se "joinea" mandando un SMS por WhatsApp al `+1 415 523 8886` con el texto `join <palabra-código>`. La palabra-código aparece en tu Console — guardala, se la mandás a cada tester individualmente.
5. **Credenciales**:
   - Console → Account Info → `Account SID` → `TWILIO_ACCOUNT_SID`
   - Console → Account Info → `Auth Token` → `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (sandbox default)
6. **Webhook inbound** (mensajes entrantes):
   - Sandbox settings → **When a message comes in**: `https://<vercel>.app/api/webhooks/whatsapp` (POST)
   - Método: `HTTP POST`
   - Dejá el status callback URL vacío por ahora.
7. **Producción** (más adelante, no es scope del early access):
   - Aplicar a WhatsApp Business approved sender via Twilio
   - Meta hace KYC del business (24-48h)
   - Verificás un número Tampu real
   - Cambiás `TWILIO_WHATSAPP_FROM` y desactivás sandbox

---

## 4. Cloudflare Turnstile

Captcha gratis. Se renderiza en login y en la pantalla de BYOK key.

1. Signup en https://dash.cloudflare.com (o usá la cuenta que ya tengas).
2. **Turnstile → Add site**:
   - Site name: `tampu-prod`
   - Hostnames: el dominio del deploy (`<vercel>.app` + custom domain si tenés uno)
   - Widget mode: **Managed**
3. Copiá:
   - `Site Key` → `NEXT_PUBLIC_TURNSTILE_SITEKEY`
   - `Secret Key` → `TURNSTILE_SECRET_KEY`

Si dejás Turnstile sin configurar, podés desbloquear dev local con `ALLOW_DISABLED_TURNSTILE=true` — **NO USAR EN PROD**.

---

## 5. Sentry

Error tracking. Plan free son 5k events/mes — sobra para 5 testers durante semanas.

1. Signup en https://sentry.io.
2. **Create project**:
   - Platform: **Next.js**
   - Project name: `tampu-prod`
3. La página te muestra el DSN — copialo → `NEXT_PUBLIC_SENTRY_DSN`.
4. Ignorá los pasos de "install the SDK" — el código ya está integrado (`src/sentry.client.config.ts`, `src/sentry.server.config.ts`, `src/instrumentation.ts`).

---

## 6. Vercel deploy

El momento de la verdad.

1. Si el repo todavía no está en git remoto:
   ```bash
   git init
   git add .
   git commit -m "initial commit pre-deploy"
   # Crear repo en GitHub (private), después:
   git remote add origin git@github.com:<vos>/tampu.git
   git push -u origin main
   ```
2. Signup en https://vercel.com con la cuenta de GitHub.
3. **Add New → Project** → import el repo `tampu`.
4. Framework: **Next.js** (auto-detected, no cambies nada).
5. Build settings: dejá los defaults.
6. **ANTES de Deploy** → **Environment Variables** → pegá una por una las vars de la **sección 7** acá abajo. Marcá las `NEXT_PUBLIC_*` como expuestas a Production, Preview y Development; las server-only solo a Production.
7. **Deploy** → esperá ~3 min.
8. Cuando termine, Vercel te da una URL `https://<algo>.vercel.app`. **Anotala**.
9. Volvé a:
   - **Stripe → Webhooks** → editá el endpoint con la URL real
   - **Twilio → Sandbox** → editá el webhook inbound con la URL real
   - **Supabase → Authentication → URL Configuration** → Site URL: la URL de Vercel
10. **Redeploy** desde Vercel para que tome los cambios de `NEXT_PUBLIC_SITE_URL` si lo cambiaste.

---

## 7. Env vars consolidadas

Esto es lo que va en Vercel → Settings → Environment Variables. Total: **~30 vars** (sin las opcionales de billing alerts).

| Var | Required | Default | Source |
|-----|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | — | Supabase Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | — | Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | — | Supabase Settings → API (secret) |
| `NEXT_PUBLIC_ENABLE_DEMO_MODE` | — | (vacío) | Dejar vacío en prod |
| `ANTHROPIC_API_KEY` | — | — | console.anthropic.com (fallback assistant) |
| `TAMPU_ANTHROPIC_KEY` | recomendado | — | console.anthropic.com (paga vos el free tier) |
| `AI_PROXY_IP_SALT` | recomendado | default visible | `openssl rand -hex 16` |
| `TWILIO_ACCOUNT_SID` | ✓ | — | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | ✓ | — | Twilio Console → Account Info |
| `TWILIO_WHATSAPP_FROM` | ✓ | `whatsapp:+14155238886` | Sandbox default |
| `WHATSAPP_INGESTION_DAILY_BUDGET_USD` | — | `5` | Kill-switch |
| `WHATSAPP_WEBHOOK_PUBLIC_URL` | — | inferida | Vercel URL + `/api/webhooks/whatsapp` |
| `NEXT_PUBLIC_API_BASE_URL` | — | (vacío) | Solo si build mobile separado |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | ✓ | — | Cloudflare Turnstile |
| `TURNSTILE_SECRET_KEY` | ✓ | — | Cloudflare Turnstile |
| `ALLOW_DISABLED_TURNSTILE` | — | `false` | **NUNCA** en prod |
| `NEXT_PUBLIC_SENTRY_DSN` | recomendado | — | Sentry project settings |
| `STRIPE_SECRET_KEY` | ✓ | — | Stripe → API keys (test) |
| `STRIPE_WEBHOOK_SECRET` | ✓ | — | Stripe → Webhooks → endpoint |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✓ | — | Stripe → API keys (test) |
| `TAMPU_PLUS_PRICE_USD` | — | `29` | Configurable |
| `USD_TO_ARS_RATE` | — | `1200` | Manual, ajustar |
| `USD_TO_BRL_RATE` | — | `5.3` | Manual, ajustar |
| `NEXT_PUBLIC_SITE_URL` | ✓ | — | URL final de Vercel |
| `CRON_SECRET` | ✓ | — | `openssl rand -hex 32` |
| `AI_DAILY_BUDGET_USD` | — | `50` | Kill-switch |
| `AI_MONTHLY_BUDGET_USD` | — | `200` | Kill-switch |
| `ANTHROPIC_ADMIN_KEY` | — | — | Solo si querés billing alerts reales |
| `RESEND_API_KEY` | — | — | resend.com (opcional, alerts email) |
| `RESEND_FROM` | — | `Tampu Billing <alerts@tampu.app>` | Domain verificado en Resend |
| `BILLING_ALERT_EMAIL` | — | `matiasfaustomoron@gmail.com` | Dónde mandar las alerts |

Si dudás de algún valor, leé `.env.example` — cada var tiene comment explicativo.

---

## 8. Smoke test post-deploy

Probá esto vos antes de mandarle el link al primer tester. Si alguno falla, no salgas a producción.

1. **Welcome carga**: abrí `https://<vercel>.app` → tiene que renderizar la landing en <3s, sin errores en console.
2. **Magic link signup**: clickeá login → ingresá tu email → revisá inbox → el link tiene que abrir la app autenticada.
3. **Stripe checkout**: Settings → Tampu+ → "Apoyar" → tiene que redirigir a checkout.stripe.com. Pagá con `4242 4242 4242 4242`. Volvé a Settings → tiene que mostrar "Tampu+ activado" (esto valida el webhook).
4. **WhatsApp link**: Settings → WhatsApp → seguí instrucciones para joinear sandbox → mandá `join <code>` por WhatsApp al `+14155238886` → en la app aparece tu número linkeado.
5. **WhatsApp ingestion**: reenviá un mensaje cualquiera al sandbox → andá a `/whatsapp` → tiene que aparecer con `status='parsed'` (o `'failed'` si no pudo, pero registrado).
6. **Passcode débil**: Vault → "abrir" → ingresá `1234` → tiene que rechazar con mensaje claro (4 palabras o 12 chars min).
7. **Turnstile visible**: Settings → AI → pegar BYOK key → tiene que mostrarse el captcha de Cloudflare antes de guardar.

Si los 7 pasan: estás listo para mandar el invite (ver `TESTER-INVITE.md`).

---

## 9. Rollback

Cuando algo se rompa en prod (porque va a pasar):

- **Vercel**: Dashboard → Deployments → encontrá el deploy anterior que funcionaba → menú "..." → **Promote to Production**. Toma ~30s.
- **Supabase**: Las migrations son **forward-only**. No hay `down` automático. Si una migration rompió algo, escribís manualmente el SQL inverso en el SQL Editor. Antes de cualquier migration destructiva, Supabase tiene snapshot automático diario (Settings → Backups) — podés restaurar desde ahí en plan free (con downtime).
- **Stripe**: No vayas a live mode antes de Argentina verification. Si ya estás en live y necesitás cortar: Dashboard → Developers → API keys → **Roll** la secret key. Eso invalida todo y los checkouts caen al toque.
- **Refunds de Tampu+**: manuales desde Stripe Dashboard → Customers → encontrá al user → Refund. El webhook `charge.refunded` está cableado y revoca el lifetime en la tabla `tampu_plus_lifetime`. No tenés que tocar Supabase a mano.
- **Twilio sandbox roto**: si los testers no pueden joinear, cambiá la palabra-código desde Console (genera una nueva), mandala a los 5 de vuelta.
- **Sentry inundado**: Si Sentry pasa los 5k events del free tier en un día (improbable con 5 testers, pero podría pasar en un loop de error), seteá un `inboundFilter` desde el dashboard de Sentry. O comentá temporalmente `NEXT_PUBLIC_SENTRY_DSN` en Vercel y redeployá — el código tiene guard.

---

## Notas honestas

- Esto no es production-grade para 10k users. Es production-grade para 5 testers conocidos.
- Vas a iterar el deploy varias veces la primera semana. Tené Vercel y Supabase en otra tab.
- Si algo no se entiende, abrí un issue en el repo o mandame DM. Ningún paso es obvio la primera vez.
