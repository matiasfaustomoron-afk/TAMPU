# Tampu — WhatsApp Setup (Twilio)

Esta guía cubre desde cero cómo activar la integración WhatsApp de Tampu para
dev local, testing con 3-5 testers conocidos (Sandbox) y producción (sender
approved por Meta).

## Por qué WhatsApp

Research de 5 competidores (TripIt, Wanderlog, Tripsy, Polarsteps, AwardWallet)
mostró que **ninguno tiene WhatsApp ingestion**. En LatAm la mitad de las
confirmaciones de viaje llegan por WhatsApp: el host de Airbnb local, la
agencia boutique, el conductor de transfer, la agencia de tours. Tampu permite
reenviar esos mensajes a un número Tampu, los parsea con Claude Haiku y los
agrega al viaje. Target costo: ~USD 0.01 por mensaje (Twilio + LLM).

## Stack

- **Provider**: Twilio (más simple para arrancar que Meta directo; pricing
  decente, signature validation documentada, sandbox instant).
- **LLM**: Claude Haiku 4.5 vía `TAMPU_ANTHROPIC_KEY`. Fallback Gemini 2.0
  Flash si Anthropic falla. Costo se contabiliza en `ai_proxy_usage` con
  endpoint `whatsapp-ingestion`.
- **Tablas**: `whatsapp_links` (migration 00024) + `whatsapp_messages`
  (migration 00025).

## Paso 1 — Crear cuenta Twilio (5 min)

1. Ir a [twilio.com](https://www.twilio.com) → Sign up. Email + password.
2. Verificación SMS de tu número personal. **No vincula al sandbox**, solo
   confirma la cuenta.
3. Pregunta de onboarding "¿Qué vas a construir?" → "Messaging / WhatsApp" →
   "Notifications" (la respuesta no afecta nada, es para analytics de Twilio).
4. Llegás al **Console**. Bookmarkealo: [console.twilio.com](https://console.twilio.com).
5. Twilio te regala **USD 15 de crédito** de prueba. Es suficiente para ~3000
   mensajes de WhatsApp Sandbox (USD 0.005 / mensaje).

## Paso 2 — Activar WhatsApp Sandbox (2 min)

El Sandbox es gratis e instant. Sirve para testear con 3-5 personas conocidas
sin la review de Meta. Limitación: cada tester tiene que "unirse" mandando
una palabra clave por SMS, y la sesión dura 72h sin actividad.

1. Console → **Messaging** (menú izquierdo) → **Try it out** → **WhatsApp**.
2. Twilio te muestra el número del sandbox (típicamente `+1 415 523 8886`) y
   una palabra clave única tuya (ej. `join orange-tiger`).
3. Cada tester:
   - Agrega `+14155238886` a sus contactos como "Tampu Sandbox" (no obligatorio
     pero ayuda).
   - Manda **`join orange-tiger`** desde WhatsApp a ese número.
   - Twilio responde "Connected to sandbox. Reply STOP to leave."
4. Listo. El tester puede mandar mensajes al sandbox durante 72h.

## Paso 3 — Configurar el webhook en Twilio (3 min)

1. En la misma pantalla del sandbox, scrolleá hasta **Sandbox Configuration**.
2. **When a message comes in** → URL: `https://TU-DOMINIO.com/api/webhooks/whatsapp`
   - En dev local: usá [ngrok](https://ngrok.com) (gratis). Ver Paso 5.
   - En Vercel preview: la URL es `https://NOMBRE-PREVIEW.vercel.app/api/webhooks/whatsapp`.
   - En prod: `https://tampu.app/api/webhooks/whatsapp`.
3. **HTTP method** → POST.
4. **Status callback URL** → opcional. Twilio te notifica el estado de entrega
   de tus replies (sent/delivered/read). MVP no la usamos.
5. **Save**.

## Paso 4 — Variables de entorno

En `.env.local` (dev) o Vercel env vars (deploy):

```bash
# OBLIGATORIO
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # Console > Account Info
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx       # Console > Account Info (botón "Show")

# OPCIONAL (default = sandbox compartido)
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# OPCIONAL (default 5 USD)
WHATSAPP_INGESTION_DAILY_BUDGET_USD=5

# DEV-ONLY: skip de signature validation (NUNCA en prod)
# WHATSAPP_WEBHOOK_SKIP_SIGNATURE=1
```

Instalar la dep `twilio`:

```bash
npm i twilio
```

(El código degrada gracefully si no está instalada — útil para deploys que
no usan WhatsApp.)

## Paso 5 — Testear localmente con ngrok

Twilio necesita una URL pública para mandarle el webhook. ngrok crea un
tunnel desde `https://abc-123-xyz.ngrok-free.app` hasta `http://localhost:3000`.

```bash
# Una vez:
npm i -g ngrok
ngrok config add-authtoken TU_TOKEN_NGROK

# Cada vez que arranques dev:
npm run dev                                    # tu Next.js corriendo en 3000
ngrok http 3000                                # en otra terminal
# → Forwarding: https://abc-123-xyz.ngrok-free.app → http://localhost:3000
```

Pegá la URL ngrok en Twilio Console → Sandbox webhook URL. Cuando el tester
manda un WhatsApp al sandbox, Twilio hace POST a ngrok, ngrok lo forwardea
a tu localhost. Vas a ver los logs en tu terminal.

**Importante**: la URL de ngrok cambia cada vez (en el plan free). Si querés
una URL estable usá `ngrok http --domain=tampu-dev.ngrok-free.app 3000` con
un dominio reservado.

## Paso 6 — Flow end-to-end de testing

Asumiendo que ya hiciste el setup:

1. **Vincular** (desde la app web):
   - Login en `/welcome` (Supabase auth).
   - Ir a `/settings` → scroll hasta la card **WhatsApp**.
   - Ingresar `+54 9 11 4040 4040` (o el formato que sea) → click "Vincular WhatsApp".
   - El user recibe un WhatsApp con un código de 6 dígitos.
   - El user responde el código en el mismo chat.
   - La UI hace polling cada 3s y muestra "Vinculado ✓".

2. **Reenvío de confirmación** (desde el WhatsApp del user):
   - El user reenvía un mensaje al número Tampu, ej:
     > `Vuelo confirmado LATAM 800 BUE→GRU 15/08 18:30. Localizador: ABC123. Asiento 22F.`
   - El webhook recibe, valida firma, parsea con Claude Haiku.
   - El user recibe una respuesta:
     > `Recibido. Identifiqué: vuelo LATAM LA800 EZE→GRU (2026-08-15T18:30:00). Revisalo en la app (sección WhatsApp) y confirmá si lo agrego al viaje.`
   - En la app `/whatsapp` aparece el mensaje con status `parsed`, expandible.

## Paso 7 — Migrar a sender production (24-48h, Meta review)

El sandbox tiene 3 limitaciones para escalar:
- Cada user tiene que mandar `join <keyword>` cada 72h.
- El "From" es un número compartido US (no marca Tampu).
- Templates de mensajes outbound no aplican (afecta más cuando agregamos
  notificaciones proactivas).

Para producción:

1. Twilio Console → **Messaging** → **Senders** → **WhatsApp senders** → Create.
2. Elegir el número (podés portar uno propio o comprar uno nuevo en Twilio).
3. Llenar el form de Meta Business: nombre del business "Tampu", categoría
   "Travel & Tourism", website `tampu.app`, descripción.
4. Submit → review de Meta dura 24-48h. Te mandan email cuando aprueban.
5. Una vez aprobado, actualizá:
   ```bash
   TWILIO_WHATSAPP_FROM=whatsapp:+5491140404040   # tu nuevo número
   ```
6. (Opcional) Crear **message templates** para outbound proactivo (alertas
   de tasks vencidas, reminders de check-in, etc). Meta aprueba templates
   individuales en ~24h.

## Costos estimados a escala

- **Twilio WhatsApp** (post-sandbox):
  - User-Initiated (UIC): USD 0.005 por mensaje (los que el user manda a Tampu).
  - Business-Initiated (BIC): USD 0.0084 por mensaje (los replies de Tampu y
    notificaciones proactivas).
- **LLM (Claude Haiku 4.5)**:
  - ~USD 0.0003 por parseo (300 tokens in / 200 tokens out promedio).
- **Total por mensaje procesado**: ~USD 0.014 (input UIC + reply BIC + LLM).

### Escenario: 100 users × 50 mensajes/mes = 5000 msgs/mes

- Twilio: 5000 × USD 0.014 = USD 70/mes
- LLM: 5000 × USD 0.0003 = USD 1.50/mes
- **Total: USD ~72/mes** para 100 users activos.

Si Tampu+ lifetime (USD 29) representa ~20% conversión, 20 users × USD 29 =
USD 580 one-time, suficiente para cubrir 8 meses de WhatsApp. Negocio
funciona.

## Troubleshooting

### "invalid_signature" en logs del webhook

- Verificá que `TWILIO_AUTH_TOKEN` esté seteado y sin trailing spaces.
- En dev con ngrok, asegurate de usar la URL **exacta** que pegaste en el
  Twilio Console (incluyendo `https://`).
- Si tenés un proxy/CDN adelante (Cloudflare), puede estar modificando el
  body — Cloudflare Workers a veces re-serializa form-urlencoded. Bypaseá
  el webhook del proxy en este caso.
- Como último recurso en dev: setear `WHATSAPP_WEBHOOK_SKIP_SIGNATURE=1`
  (NUNCA en prod — el check en código exige `NODE_ENV != production`).

### El user no recibe el código de verificación

- Verificá que el user haya hecho `join <keyword>` en el sandbox.
- Mirá los logs de Twilio Console → Monitor → Logs → filter por `Error`.
- Errores comunes: `63016` (number not in sandbox), `21408` (permission to
  send to country), `63003` (template not approved en production).

### "twilio_not_configured" en logs

- `npm i twilio` falta.
- O `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` no están en el env del deploy.

### El parser devuelve siempre `type=unknown`

- Verificá que `TAMPU_ANTHROPIC_KEY` (o `ANTHROPIC_API_KEY` como fallback)
  esté seteada. Si no hay key, el parser cae a Gemini; si tampoco hay
  `GEMINI_API_KEY`, devuelve null y status=`failed`.
- Mirá los logs de `ai_proxy_usage` (Supabase) para confirmar que el costo
  se está registrando — si el row se inserta con `cost_usd > 0`, el LLM
  respondió, el "unknown" es decisión del modelo.

## Out of scope (próxima iteración)

- **Imágenes** (boarding pass, screenshots de Booking): requiere Claude
  vision o Gemini multimodal. El webhook ya guarda los media URLs en
  `whatsapp_messages.media_types`, falta el handler.
- **PDFs** (e-tickets): requiere extracción de texto del PDF antes de
  mandárselo al LLM. Twilio Media URL → fetch → pdf-parse → texto → LLM.
- **Voice notes**: Whisper o Gemini audio.
- **Multi-phone por user**: hoy es 1 phone unique. Cuando agreguemos
  family plan o trips compartidos, el schema necesita evolución.
- **Outbound proactivo**: usar templates de Meta para mandar reminders
  ("Mañana hacés check-in en ${hotel}"). Templates requieren approval
  individual por categoría.
- **Webhook status callbacks**: trackear delivered/read de los replies
  para analytics ("¿Cuánto tarda el user en leer la confirmación?").
