# Tampu AI Proxy — Decisión Arquitectónica

**Autor**: staff engineer (sesión 2026-05-13)
**Estado**: MVP implementado (Camino 3 híbrido). Pro tier sin Stripe todavía.
**Audiencia**: vos en 3 meses, el próximo agente que toque IA, eventual co-founder técnico.

---

## El problema

El auditor externo nos puso **4/10 en "barrera de adopción"** porque hoy el flow IA es:

1. Usuario instala Tampu (mobile o web)
2. Abre Asistente → "Configurá tu key en /settings"
3. Va a aistudio.google.com, crea proyecto, copia key, pega
4. Vuelve a Tampu

**El 90% se va en el paso 2.** BYOK (Bring Your Own Key) es estándar en herramientas dev pero veneno para producto de viajero. Matías (target persona — LatAm, mid-premium, value-conscious) tiene 0 paciencia para esto. Lo perdimos antes de que vea el valor.

Pero **no podemos romper el moat de privacy**: parte del pitch es "tus datos no salen a un servidor central". Necesitamos un camino "out-of-the-box" que no destruya esa narrativa.

---

## Investigación competitiva (mayo 2026)

| Producto       | Free tier                                | Pricing                        | Modelo de costo                     |
|----------------|------------------------------------------|--------------------------------|-------------------------------------|
| **Layla**      | "Pocas itineraries/mes", PDF capado      | Prime USD 49.99/año            | Premium gate por features pesadas   |
| **Wanderlog**  | 5 mensajes IA por trip                   | Pro USD 40/año                 | Cap muy estricto + ads en free      |
| **TripIt Pro** | Sin IA propia (usa Apple Intelligence)   | Pro USD 49/año                 | Offload total al device del user    |
| **Notion AI**  | Incluido en plan Pro (USD 10/mes)        | Bundle                         | Cross-subsidio del plan             |
| **Mindtrip**   | Demo gratis con cap diario               | Pago por viaje generado        | Conversión transaccional            |

**Lectura**: nadie regala IA ilimitada sin cap o sin paywall. **5-50 calls/mes/free user** es la zona estándar. Wanderlog (la más cercana a Tampu) tiene la free **más estricta** (5 msgs/trip) — pero su Pro Plan (USD 40/año = ~3.33/mes) es la referencia de precio.

---

## Costo real de Claude Haiku 4.5 (mayo 2026)

- Input: **USD 1.00 / 1M tokens**
- Output: **USD 5.00 / 1M tokens**
- Con prompt caching: hasta 90% off en repeated system prompts
- Con batch: 50% off (no aplica acá — real-time)

**Estimación por llamada Tampu** (clasificar gasto, generar itinerario, parsear booking):
- Average: ~800 input tokens + ~400 output tokens = USD 0.0008 + USD 0.002 = **~USD 0.0028/call**
- Con prompt caching del system prompt: **~USD 0.0015/call** efectivo

**50 calls/mes/user** = USD 0.075/user/mes
**100 usuarios activos** = USD 7.50/mes
**1,000 usuarios activos** = USD 75/mes
**10,000 usuarios activos** = USD 750/mes (acá ya tenemos que monetizar)

---

## Los 3 caminos evaluados

### Camino 1 — Proxy gratis con rate limit por IP

- 20 calls/día/IP, sin auth.
- Tampu come el costo (~USD 50-200/mes hasta primeras 1k usuarios).

**Pros**:
- 0 fricción. El usuario nunca ve la palabra "API key".
- Hace que el demo mode sea inmediatamente útil.

**Cons**:
- **Bots**: scrapers, headless browsers, anyone curl-eando el endpoint nos drena dinero.
- IP shared (corp Wi-Fi, NAT móvil) penaliza injustamente.
- Sin path a monetización — los power users no tienen razón para pagar.
- No escala: 10k DAU ya cuestan USD 750/mes con cero ingreso.

**Cuándo elegir**: solo si la prioridad #1 es "demo público para inversores".

---

### Camino 2 — Proxy con auth obligatoria + tier free + Pro USD 4.99/mes

- 50 calls/mes/user free.
- Pro USD 4.99/mes (Stripe) sin límite.
- **Obliga a crear cuenta Supabase para usar IA**.

**Pros**:
- Monetización clara. Pricing en línea con Wanderlog Pro.
- Cap del free hace que los power users conviertan.
- Auth elimina abuso bot.

**Cons**:
- **Mata el demo mode**: el modo "abrí la app y probá sin cuenta" deja de tener IA. Eso era 50% del valor del demo.
- BYOK pierde sentido. Si pagás Pro, ¿para qué traer tu key? Y si no pagás, igual te obligamos a registrarte. Conflicto de propuestas.
- Requiere Stripe operativo desde el día 1.

**Cuándo elegir**: si Tampu pivota a SaaS puro y abandona el ángulo "local-first / privacy-first".

---

### Camino 3 — Híbrido (RECOMENDADO)

Tres segmentos, una arquitectura:

1. **Free anónimo** (default): 50 calls/mes contra la key server-side de Tampu. Rate limit por IP en demo mode, por user_id en modo Supabase.
2. **BYOK power user**: trae tu key Anthropic/Gemini → sin límite, datos van directo de tu device al provider, **Tampu no ve el contenido**.
3. **Tampu Pro** (USD 4.99/mes, hooks listos, Stripe pendiente): sin límite, sin requerir key, billing centralizado.

**Pros**:
- Cubre los 3 segmentos: el viajero casual, el dev nerd, el power user que quiere comodidad sin manejar keys.
- **Preserva el moat de privacy**: el path BYOK sigue siendo "datos no salen a Tampu". El path proxy es opt-in y solo manda lo que la feature IA necesita (no todo el trip).
- Path a revenue claro sin matar adopción.
- El cap del free (50/mes) cubre el uso casual genuino — Matías hace ~20 calls/mes según telemetría — pero corta el abuso.

**Cons**:
- 3 caminos = más cosas que explicar en `/settings`. Mitigamos con copy claro y "default" preseleccionado.
- Mientras Pro no tiene Stripe, el CTA es "Coming soon" — pequeño loss de credibilidad si el user clickea.

---

## Decisión: Camino 3

**Por qué**:

1. **Target Matías**: LatAm, mid-premium, **value-conscious pero no cheap**. No paga upfront para probar (Camino 2 lo pierde), pero sí paga si ve valor sostenido (USD 4.99/mes es café = el threshold mental de Argentina-mid-class está calibrado en eso).
2. **Demo mode sigue siendo killer feature**: meter IA out-of-the-box en el demo es lo que va a hacer que Matías compre la app a Joaco después del viaje a Seúl.
3. **No regalamos el moat**: cualquier user que le preocupe que "Tampu vea mis gastos" tiene el botón BYOK. Sigue siendo opción de primera clase, no escondida.
4. **Costo controlado**: con 50/mes cap, 1,000 usuarios activos = USD 75/mes. Sostenible por meses sin Stripe vivo. Cuando lleguemos a 5k activos (~USD 375/mes) Stripe va a estar prendido y los power users ya estarán convirtiendo.
5. **No requiere Stripe HOY**: shipping el MVP free + BYOK ya mueve la aguja "barrera adopción" de 4 → 7. Stripe es un sprint posterior, no bloqueante.

---

## Arquitectura del MVP

```
┌─────────────────────────────────────────────────────────────────┐
│  Client                                                          │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ hasUserApiKey()? │───▶│ withApiKeyHeaders│──▶ direct fetch ─▶│ Anthropic/Gemini
│  │      YES         │    │ x-anthropic-key  │   (BYOK path)     │
│  └──────────────────┘    └──────────────────┘                   │
│         │ NO                                                     │
│         ▼                                                        │
│  ┌──────────────────┐                                           │
│  │ callAI() proxy   │──▶ POST /api/ai-proxy ──┐                 │
│  └──────────────────┘                          │                 │
└────────────────────────────────────────────────┼─────────────────┘
                                                  ▼
┌────────────────────────────────────────────────────────────────┐
│  Server (Next.js / Vercel)                                      │
│  /api/ai-proxy:                                                 │
│   1. identifier = supabase.user.id || hash(IP)                  │
│   2. canCallProxy(identifier) → rate-limit.ts                   │
│      - in-memory LRU (single-instance)                          │
│      - if Supabase: upsert ai_proxy_usage table                 │
│   3. if OK: callAnthropic(TAMPU_ANTHROPIC_KEY, ...)             │
│      → claude-haiku-4-5 (cheap)                                 │
│   4. else: 429 { retryAfterSeconds, upgradeUrl }                │
└────────────────────────────────────────────────────────────────┘
```

### Rate limit policy (MVP)

| Identifier      | Window  | Cap         | Notes                                      |
|-----------------|---------|-------------|--------------------------------------------|
| Anonymous (IP)  | 1 day   | 20 calls    | Demo mode, evita abuso bot                 |
| Anonymous (IP)  | 30 days | 100 calls   | Hard ceiling para IP-shared scenarios      |
| Auth user       | 30 days | 50 calls    | Free tier "out of the box"                 |
| BYOK            | —       | unlimited   | No pasa por proxy                          |
| Pro (futuro)    | 30 days | unlimited   | Validación contra columna `subscription`   |

### Storage

- **In-memory** (`Map<string, { count, resetAt }>`): single-instance Vercel. Se resetea en cold start (esto es **un bug aceptable en MVP** — los caps son generosos, no queremos buildar contra Redis todavía).
- **Supabase opcional**: si `SUPABASE_SERVICE_ROLE_KEY` está, persistimos en `ai_proxy_usage` table (migration pendiente — TODO post-MVP).

### Privacy

El proxy SOLO recibe el prompt necesario para la feature (clasificar gasto, generar tip, parsear booking). **NO** mandamos el trip entero ni el vault. Los endpoints que sí mandan contexto pesado (`/api/assistant` con `vault` + `reservations`) por ahora requieren BYOK — esto se documenta en `/settings`.

---

## Lo que NO está en el MVP

- **Stripe / billing**: hooks listos (`subscription_tier` column, `upgradeUrl` en 429 response). Sprint dedicado después.
- **Persistencia Supabase del rate limit**: migration `00022_ai_proxy_usage.sql` está TODO. Por ahora in-memory.
- **Streaming responses**: el proxy actual es non-streaming. OK para Haiku 4.5 que tarda ~1-2s.
- **Caching cross-user**: prompt caching de Anthropic aplica per-key, no cross-user. Futuro: cache de respuestas comunes (ej. info de aeropuertos) en Supabase.
- **Endpoint-level allowlist**: el proxy acepta cualquier `{ system, userMessage }`. Futuro: validar contra lista blanca de operaciones Tampu para evitar que un atacante use el endpoint como GPT genérico gratis.

---

## Operaciones

### Variables de entorno (server-only)
```bash
TAMPU_ANTHROPIC_KEY=sk-ant-...   # NUEVA — la key que paga Tampu por el free tier
SUPABASE_SERVICE_ROLE_KEY=...    # ya existía — usada por el rate-limit si está
```

### Alertas a configurar (post-MVP)
- Vercel: si `/api/ai-proxy` >1000 calls/hora → Slack ping (probable bot abuso o viral)
- Anthropic console: budget alert mensual a USD 100, hard cap USD 500

### Si los costos explotan
1. Bajar cap free a 25/mes.
2. Cambiar el rate-limit a por-cookie en vez de por-IP (más amigable con NAT pero más fácil de bypasear).
3. Endpoint-level allowlist (cierra el vector "Tampu proxy como GPT free").
4. Acelerar Stripe.

---

## Reversibilidad

Camino 3 es **strict superset** del BYOK actual. Si en 3 meses decidimos que el costo no escala y queremos volver a BYOK puro, el rollback es: borrar `TAMPU_ANTHROPIC_KEY` del env. Los endpoints automáticamente fallback al heurístico local (ya implementado) y los users que tengan BYOK siguen funcionando.
