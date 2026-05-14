# Tampu — Security Checklist

Checklist de prácticas mínimas para no leakear secrets. Auditor externo
(mayo 2026) levantó este flag y este doc + `scripts/audit-secrets.cjs` +
`.husky/pre-commit` son la respuesta defensa-en-profundidad.

## Qué NUNCA va al repo

Estos archivos / valores nunca deben aparecer en `git status` antes de un
commit. Si los ves, **paralizá el commit** y rotá el secret correspondiente.

- `.env`, `.env.local`, `.env.production`, `.env.development` — solo
  `.env.example` está permitido (template público sin valores reales).
- API keys de cualquier proveedor:
  - Anthropic: `sk-ant-api...` / `sk-ant-admin...`
  - Google: `AIza...`
  - OpenAI: `sk-...` (excepto `sk-ant-*` que es Anthropic)
  - Supabase: `sb_secret_...`, `sb_publishable_...`, y JWTs `eyJhbGc...`
    (especialmente la `service_role`).
  - AWS: `AKIA...` access keys + sus secret pairs.
  - Slack: `xoxb-...`, `xoxp-...`, etc.
- Archivos `*.pem`, `*.key` (private keys).
- `credentials.json` (Google Cloud, Firebase, etc).
- Archivos `*.bak`, `*.old` — históricamente son la vía por la que un dev
  guarda un dump de `.env` "por las dudas".
- `.vercel/` y `.netlify/` directories (contienen tokens de deploy).
- iOS provisioning profiles `*.mobileprovision` y signing certs `*.p12`.

## Cómo agregar un secret nuevo

Cuando necesitamos integrar un proveedor nuevo (ej. agregar Stripe, Heymondo,
Wise API, etc):

1. **Decidí dónde vive el secret**:
   - Si es **client-side** (visible al user): usar `NEXT_PUBLIC_*` y aceptar
     que es público de facto. Solo para keys publishable (Stripe pub key,
     Supabase anon key).
   - Si es **server-side**: nunca con prefijo `NEXT_PUBLIC_*`. Va en Vercel
     env vars (deploy) y en `.env.local` (dev). Nunca hardcoded.
2. **Documentá la variable en `.env.example`** con su nombre, valor dummy y
   un comentario corto de qué hace. El próximo dev (o vos en 3 meses) lo va
   a necesitar.
3. **Si el secret tiene formato detectable por regex**, agregalo a
   `scripts/audit-secrets.cjs` (sección PATTERNS). Testealo contra 3 strings
   reales que SÍ deberían matchear y 3 que NO antes de commitear el cambio.
4. **Rotación**: anotá la fecha de creación + último uso en una nota privada
   (no en el repo). Rotá keys cada 90 días o ante cualquier sospecha de leak.
5. **Acceso**: solo gente que necesita el secret debe tenerlo. Compartilo
   por 1Password (o equivalente), nunca por Slack/WhatsApp/email.

## Si leakeás un secret

Aunque tengamos pre-commit, accidentes pasan (ej. `--no-verify` por error,
clone de un repo histórico con leak, push de un dump de logs). Si te pasa:

1. **Rotá la key inmediatamente** — no esperes a "ver qué pasa". Los
   bots scrapean GitHub público en minutos.
2. **Revocá la key vieja** en el dashboard del proveedor.
3. **No rebases para "borrar" el commit** si ya hiciste push. La key vive
   en el historial de cualquiera que haya clonado el repo y en el reflog de
   GitHub. La única defensa real es revocar.
4. **Notificá al equipo** — si la key tenía permisos elevados (Supabase
   service_role, AWS admin), asumí compromiso y revisá logs del proveedor.

## Auditoría

Corré el scanner manualmente cada tanto para asegurarte de que el repo está
limpio:

```bash
npm run audit:secrets
```

El pre-commit hook (`.husky/pre-commit`) ya lo corre sobre los archivos
staged en cada commit. Si necesitás bypass por una emergencia documentada:
`git commit --no-verify` — pero acordate que es excepcional, no la norma.

## Sprint seguridad 05/2026 — env vars requeridas en Vercel

Antes de cualquier deploy a production, confirmar que estas variables
están seteadas en Vercel (Project Settings → Environment Variables):

### Cloudflare Turnstile (anti-bot signup/BYOK/passcode setup)

- `NEXT_PUBLIC_TURNSTILE_SITEKEY` — public sitekey. Sin esto, el widget se
  monta en modo "DISABLED" y el flow no protege contra bots. **OBLIGATORIO en prod.**
- `TURNSTILE_SECRET_KEY` — secret key para validar tokens server-side en
  `/api/verify-turnstile`. **OBLIGATORIO en prod.**
- `ALLOW_DISABLED_TURNSTILE` — sólo `true` en preview/dev cuando no se quiere
  configurar Turnstile. **NUNCA en prod.**

Crear par sitekey/secret en https://dash.cloudflare.com/?to=/:account/turnstile.

### Rate limiting + circuit breaker (AI proxy)

- `AI_PROXY_IP_SALT` — salt para hashear IPs en la tabla `ai_proxy_usage`.
  Si rotás este valor, los buckets diarios se resetean (clientes vuelven al
  cap fresh). Generá con `openssl rand -hex 32`.
- `AI_DAILY_BUDGET_USD` — opcional, default `50`. Cuando el sum(cost_usd)
  del día supera este valor, el endpoint `/api/ai-proxy` devuelve 503
  `daily_budget_reached` y loguea a Sentry. Subilo si el negocio escala.

### Stripe (Tampu+ Lifetime — USD 29 one-time)

Tampu+ es un upgrade lifetime opcional (no subscription) que desbloquea
proxy IA gestionado, badge y crédito de marketplace futuro. Implementado
en `/api/checkout/create-session` (POST) y `/api/webhooks/stripe` (POST).

- `STRIPE_SECRET_KEY` — secret key del backend (`sk_live_...` en prod,
  `sk_test_...` en dev/preview). NUNCA prefijo `NEXT_PUBLIC_`. **OBLIGATORIO**
  para que el checkout funcione.
- `STRIPE_WEBHOOK_SECRET` — signing secret (`whsec_...`) del endpoint
  configurado en Stripe Dashboard → Webhooks. Sin esto, el webhook rechaza
  todas las requests (correcto: no aceptamos eventos sin firma).
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — publishable key (`pk_live_...` o
  `pk_test_...`). Hoy no se usa client-side (todo el flow es server-side
  redirect a Stripe Checkout) pero la dejamos seteada por si después se
  integra Stripe Elements en una página propia. **Es público de facto.**
- `TAMPU_PLUS_PRICE_USD` — opcional, default `29`. Permite ajustar el
  precio sin cambiar código. Cambios aplican a la próxima session creada
  (no retroactivo).
- `USD_TO_ARS_RATE` — opcional, default `1200`. Rate fija para display
  del precio en ARS en el UI (`formatLifetimePriceLocal()`). Rotar
  manualmente cuando el oficial se desvía > 15%.
- `USD_TO_BRL_RATE` — opcional, default `5.3`. Análogo para Brasil.
- `NEXT_PUBLIC_SITE_URL` — opcional pero recomendado en prod. Si está,
  el checkout lo usa para `success_url` y `cancel_url`. Si no, se infiere
  del header `host` del request (frágil con proxies/CDN raros).

Setup en Stripe Dashboard antes del primer deploy:
1. Activar account + completar onboarding fiscal.
2. Webhooks → Add endpoint → URL `https://tampu.app/api/webhooks/stripe`,
   eventos: `checkout.session.completed`, `charge.refunded`,
   `charge.dispute.created`. Copiar el signing secret.
3. (Opcional) Customer Portal → activar self-service refunds.
4. Tax → configurar Stripe Tax si querés que cobre IVA/VAT automatic.

**Apple IAP**: el flow Stripe funciona en PWA + Android. iOS requiere
StoreKit por Guideline 3.1.1. Ver `docs/APPLE-IAP-TODO.md` para el plan
cuando lleguemos a App Store.

### Twilio WhatsApp (mayo 2026)

WhatsApp ingestion: el diferenciador estructural Tampu vs competidores LatAm.
Implementado en `/api/webhooks/whatsapp` (inbound), `/api/whatsapp/*` (linking
flow). Ver `docs/WHATSAPP-SETUP.md` para el guide completo.

- `TWILIO_ACCOUNT_SID` — empieza con `AC...` (Twilio Console → Account Info).
  Server-only, NUNCA prefijo `NEXT_PUBLIC_`. **OBLIGATORIO** para que el
  webhook y el send funcionen.
- `TWILIO_AUTH_TOKEN` — token rotable (Twilio Console → Account Info). Se
  usa para validar la firma HMAC-SHA1 de cada webhook inbound. Si no está
  seteado, el webhook devuelve 503 y rechaza todo.
- `TWILIO_WHATSAPP_FROM` — opcional, default `whatsapp:+14155238886`
  (sandbox compartido). En producción cambialo a `whatsapp:+TUNUMERO` del
  sender approved por Meta.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — placeholder para futuros health-checks,
  no usado por Twilio en MVP. Generá con `openssl rand -hex 32` igual.
- `WHATSAPP_WEBHOOK_PUBLIC_URL` — opcional, override de la URL usada para
  validar firma. Útil si tenés proxy/CDN exótico delante de Vercel. Si no
  está, se reconstruye del request (`x-forwarded-proto://x-forwarded-host
  /api/webhooks/whatsapp`).
- `WHATSAPP_WEBHOOK_SKIP_SIGNATURE` — opcional, **solo dev**. Si vale `1`
  y `NODE_ENV != production`, el webhook acepta sin validar firma (útil con
  ngrok local). En production lo ignoramos a propósito.
- `WHATSAPP_INGESTION_DAILY_BUDGET_USD` — opcional, default `5`. Kill-switch
  específico para WhatsApp. Cuando el sum(cost_usd) de `whatsapp_messages`
  del día supera este valor, respondemos al user "sin presupuesto" y no
  parseamos hasta el próximo día UTC.

Setup en Twilio Console:
1. Activar WhatsApp Sandbox (Messaging → Try WhatsApp). Free instant.
2. Sandbox webhook URL: `https://tampu.app/api/webhooks/whatsapp` (POST).
3. Tester: cualquier número que mande "join <sandbox-keyword>" por SMS al
   `+14155238886` se "une" al sandbox y ya puede mandar mensajes durante 72h.
4. Producción: aplicar a sender approved (24-48h Meta review). Ver
   `docs/WHATSAPP-SETUP.md`.

### Observability

- `NEXT_PUBLIC_SENTRY_DSN` — DSN client + server. Sin esto, todos los
  `captureException()` son no-ops. **OBLIGATORIO en prod.**
- `CRON_SECRET` — token para autenticar `/api/cron/billing-check`. Generá
  con `openssl rand -hex 32`. **OBLIGATORIO en prod.**
- `ANTHROPIC_ADMIN_KEY` — opcional, usado por `/api/cron/billing-check` para
  consultar usage del workspace Anthropic. Sin esto, el cron sólo chequea
  consumo local de la tabla `ai_proxy_usage`.
- `BILLING_ALERT_EMAIL` — opcional, default `matiasfaustomoron@gmail.com`.
  Destinatario de alertas cuando el daily/monthly cost supera umbral.

### Checklist pre-deploy

- [ ] Sitekey + secret Turnstile creados y seteados
- [ ] `AI_PROXY_IP_SALT` rotado (no usar default `tampu-default-salt-change-me`)
- [ ] `NEXT_PUBLIC_SENTRY_DSN` válido (test ping con `npx sentry-cli send-event ...`)
- [ ] `CRON_SECRET` seteado y guardado en 1Password
- [ ] Tabla Supabase `ai_proxy_usage` migrada (00022) y RLS deny-all desde
      client
- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` seteados (live keys en prod, no test)
- [ ] Webhook endpoint registrado en Stripe Dashboard con los 3 eventos
      (`checkout.session.completed`, `charge.refunded`, `charge.dispute.created`)
- [ ] Migration `00023_tampu_plus_lifetime.sql` aplicada en Supabase prod
- [ ] Test de compra real con `sk_test_*` + tarjeta `4242 4242 4242 4242` antes
      de switchear a live keys
- [ ] `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` seteados (sandbox para MVP,
      production sender para escala)
- [ ] Webhook URL registrado en Twilio Console (Sandbox o sender)
- [ ] Migrations `00024_whatsapp_links.sql` y `00025_whatsapp_messages.sql`
      aplicadas en Supabase prod
- [ ] `WHATSAPP_INGESTION_DAILY_BUDGET_USD` ajustado al volumen esperado
      (default USD 5 cubre ~1000 mensajes/día con Haiku)

## Por qué este setup y no otra cosa

- **No git-secrets**: requiere Python instalado, no garantizado en Windows
  ni en CI minimalistas. Nuestro script es Node.js puro (la toolchain que
  ya tenemos para Next.js).
- **No trufflehog/gitleaks como dep**: son herramientas excelentes pero
  agregan toolchain pesada y requieren install separado. Para una app que
  todavía no llegó a producción consumer, el ROI no justifica el peso.
- **Husky**: ~700KB, estándar 2026, da una API consistente cross-platform
  para hooks. La alternativa (`.git/hooks/pre-commit` a pelo) no se versiona
  con el repo y se pierde en cada clone fresh.
- **Pre-commit, no pre-push**: queremos el feedback inmediato cuando el dev
  todavía está en el flow. Pre-push llega muy tarde — la key ya vivió en
  el branch local y puede haber sido pusheada a un fork.
