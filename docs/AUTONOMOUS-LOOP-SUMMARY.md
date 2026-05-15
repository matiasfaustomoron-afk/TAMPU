# Tampu · Autonomous Audit-Fix Loop · Resumen consolidado

**Período**: 2026-05-15 (sesión nocturna + extendida)
**Iteraciones reales**: 6 de 8 planeadas (75%)
**Stop**: Manual por founder
**Cron**: `ae9d8198` cancelado

---

## Métricas globales

| Métrica | Valor |
|---|---|
| **Audit agents totales** | 30 (5 × 6 iters) |
| **Fix agents totales** | 30 (5 × 6 iters) |
| **Fixes aplicados** | **~241** |
| **Archivos nuevos** | 19 (componentes + routes + migrations + libs) |
| **Migrations nuevas** | 00033 → 00038 (6 migrations, todas pendientes de aplicar) |
| **Commits feat** | 7 (Iter 0 + 1 + 2 + 3 + 4 + 5 + 6) |
| **Commits docs** | 6 (CHANGELOG por iter) |
| **Deploys Vercel** | 6 (todos verdes, smoke OK) |
| **Vitest** | 234 → **236** tests passing |
| **TypeScript errors** | 0 (mantenido durante todas las iters) |
| **Token cost estimado** | ~5.5M (~USD 38 a precio Sonnet 1M ctx) |

---

## Síntesis por dominio

### 🤖 IA / LLM (≈45 fixes)

**Antes**:
- 6 endpoints con extracción JSON con regex distintos y bugs.
- Anthropic temperature default 1.0 → hallucination JSON-strict.
- Deep links inventados (hallucinations).
- Sin retry exponential backoff (single hiccup mataba el response).
- PII filter solo CC genérico.
- Rate limit per-IP (compartido entre users del mismo NAT).
- ai-proxy sin Retry-After.
- agentic.ts sin Sentry capture, max_tokens hardcoded.

**Después**:
- `src/lib/ai/json-extractor.ts` centralizado, todos los endpoints migrados.
- `providers.ts`: temperature param + default 0.2 JSON, 0.6 prosa, withRetry con throw status para 429/5xx.
- `agentic.ts`: KNOWN_ROUTES whitelist + `sanitizeDeepLink()`, max_tokens adaptive 800/1500, captureException Sentry, LOOP_BUDGET_TOKENS 50k + LOOP_TIMEOUT_MS 60s.
- `pii-filter.ts`: CC + DNI + CUIT + passport + **CBU AR + IBAN** (13 + 2 tests passing).
- `proxy-identifier.ts`: per-user identifier en 6 endpoints (anti shared-NAT).
- `classify-document`: rate-limit + checkDailyBudget guard cuando source=tampu (DoS protect).
- `parse-email-confirmation`: BookingType validator + coerce amounts.
- `generate-itinerary`: validation rango fechas + day_number consecutivo (no más viajes imaginarios).
- `ai-proxy`: Retry-After garantizado 429/503 + temperature param body.
- `whatsapp/parser.ts`: regla dura voseo argentino.
- `expense-categorizer.ts`: proxy fallback cuando no hay BYOK.
- Prompt caching ephemeral en system prompts (ahorro ~90% input tokens).

### 🏗️ Code / Architecture (≈35 fixes)

**Antes**:
- `useState`+`useEffect` ad-hoc en muchos pages (no TanStack Query).
- Mutations sin invalidate scoped (1 delete refetcheaba 5 trips).
- Polls realtime channel duplicado (leak Supabase quota).
- Supabase singleton sin reset on logout.
- `supabase-generated.ts` desincronizado (12 tablas faltantes).
- Middleware envs missing → bypass auth silencioso.
- `useTripFullDataset.ready` siempre true (dashboard "vacío" pre-load).
- `useTheme` hydration mismatch.
- 2 `any` en codebase (`twilio.ts`).

**Después**:
- TanStack Query v5 cubre 90% de pages (~30 hooks: useReservations, useExpenses, useAttachments, useTasks, useTripMembers, etc.).
- `mDelete*` con scoped invalidation (overload pragmatic `string | {id,tripId}`).
- `members data layer` canonical en `src/lib/data/members.ts`.
- `polls/page.tsx` usa `useTripRealtime` (channel duplicado eliminado).
- `supabase/client.ts` `resetClient()` exportado.
- `supabase-generated.ts` 13 TableRow stubs nuevos.
- `middleware.ts`: prod sin envs → redirect `/welcome?config=missing`.
- `useTripFullDataset.ready = !loading` (correcto ahora).
- `useTheme` getSnapshot fallback `"light"` consistente con server.
- `twilio.ts` typed con `Twilio` SDK types.
- `query-provider` staleTime 60s + gcTime 10m.
- `next.config.ts` images.remotePatterns supabase.co.
- `errors.ts` con `describeError()` + `reportError()` que unwrappean Supabase plain objects.

### 🎨 Diseño + i18n (≈100 fixes — el dominio más grande)

**Antes**:
- ~50% de pages con strings hardcoded.
- Anglicismos por todos lados: "tracking", "checklist", "tip", "post", "loading", "share", "Split", "poll", "Owner".
- EN dict tenía gaps grandes (members, share, comments faltantes).
- Plurales hardcoded sin Intl.PluralRules.
- Spinners circulares gigantes (no skeletons).
- FABs sin aria-labels i18n.
- /more, /split, /alerts, /map, /vault, /today, /cashflow casi todo hardcoded.

**Después**:
- `src/lib/i18n/plural.ts` con Intl.PluralRules helper.
- Diccionarios `es.ts` + `en.ts` con paridad verificada (~30 secciones nuevas).
- Pages i18n masivo: `/today`, `/cashflow`, `/more`, `/split`, `/alerts`, `/map`, `/vault` (top strings).
- Componentes i18n: `QuickStatsCard`, `comment-thread`, `poll-card`, `members`, `attach-doc-button`, `PrintBookSheet`, `create-poll`, `expense-fab`, `more-fab`, `assistant-fab`, `AddressDisplay`, `sync-indicator`, `ai-generator-sheet`.
- Anglicismos eliminados: "Tracking GPS" → "Ubicación GPS", "Checklist mental" → "Repaso mental", "Split" → "Compartido", "Poll" → "Encuesta", "Link" → "Enlace".
- Voseo argentino en todo: voseo en system prompts WhatsApp.
- Skeletons en lugar de spinners en: budget, reservations, ai-generator-sheet.
- ROLE_LABEL members: "Owner/Editor" → "Dueño/Editor/Visor".
- Toasts a Sheet pattern (parcial).

### 💡 Innovación / Features (≈25 fixes)

**Antes**:
- Sin Recap (TripIt-style trip summary).
- Sin Annual Recap (Polarsteps Unpacked-style).
- AddToWalletButton sin pkpass route.
- Photobook sin UI ni checkout.
- Polls online sync incompleto.
- No tasks CRUD UI (mAddTask ghost).
- No document expiry alerts.

**Después**:
- **Recap MVP** completo: `/api/recap/[tripId]` Edge con `@vercel/og` (5 stats), `/recap/[tripId]` HTML wrapper con og:image, `RecapShareButton` con Web Share API + clipboard fallback, **gate `recap_public`** (privacy by default).
- **Annual Recap "Tampu Unpacked"**: `/api/recap/year/[userId]` + `/recap/year/[userId]` + `AnnualRecapPromoCard` (visible Nov/Dic/Ene).
- **PrintBookSheet** photobook order UI.
- **AddToWalletButton** Apple Wallet `.pkpass` con 503 graceful degrade.
- **mAddTask** mutation + UI inline en `/tasks`.
- **/tasks/[id]** ghost route → página real (toggle/edit/delete).
- **ExpiringDocCard** docs próximos a vencer (passport/visa/seguro).
- **/api/cron/expiry-check** scan attachments expires_at.
- **/settings → "Compartí mi viaje"** toggle recap_public.
- **Polls online sync** (createPollOnline/castVoteOnline/closePollOnline).
- **/inbox forward email** UI (alias visible + copy + test).
- Migration 00037 `attachment_expiry` (column expires_at + index parcial).

### 🛡️ Funcionalidad / E2E flows (≈40 fixes)

**Antes**:
- signin race + Object Object error.
- create_trip sin RPC.
- /tasks/[id] redirect a /tasks (ghost).
- /login sin "Olvidé mi contraseña".
- /trips wizard silent return si faltan campos.
- /alerts dismiss in-memory (perdía estado al refresh).
- /inbox commitEntry all-or-nothing.
- /settings BYOK requería Turnstile siempre.
- Welcome flicker en redirect.
- /share destHue azul/violeta inconsistente con tierra.
- Capacitor `window.open` rompe en webview.
- Middleware bypass auth sin envs.

**Después**:
- signin race resuelto (await session refresh).
- `create_trip` + `set_active_trip` RPC SECURITY DEFINER.
- `/tasks/[id]` página real implementada.
- `/login` forgot password inline form + `resetPasswordForEmail`.
- `/trips` wizard toast.warn si faltan campos.
- `/alerts` dismiss in-memory (DB persistence migration 00036 lista, falta UI wire Iter 7+).
- `/inbox` commitEntry **partial commit** (separa created/failures, status `partial`).
- `/settings` BYOK Turnstile fallback + checkout redirect.
- `/welcome` guards `pathname + typeof window` anti-flicker.
- `/share` destHue familia tierra `15+(Math.abs(h)%80)`.
- `/today` RecapShareButton disabled + toast.info si recap_public=false.
- `/journal` caption debounce 300ms + event rename `tampu-vault-change` + legacy bridge.
- `/api/email-in` GET handler (list entries).
- middleware: prod sin envs → redirect `/welcome?config=missing`.
- members race fix usando `activateTrip` mutation.
- assistant `readVersioned` para vault demo.

---

## Top 10 highlights (lo que más mueve la aguja)

1. **Anthropic temperature default 0.2** — fix masivo de hallucination JSON-strict en 8 endpoints sin tocar callers (Iter 6).
2. **`/settings` toggle `recap_public`** — desbloquea Recap + Annual Recap que estaban 404 silente desde Iter 4 (Iter 6).
3. **Recap MVP + Annual Recap** — CAC orgánico viral estilo Polarsteps Unpacked, ROI alto (Iter 4 + 5).
4. **PII filter expandido** — CC + DNI + CUIT + passport + CBU + IBAN, 13 tests pre-LLM (todas las iters).
5. **withRetry exponential backoff con status throw** — single hiccup no rompe response (Iter 1).
6. **Per-user proxy identifier** — anti shared-NAT rate limit en 6 endpoints (Iter 3-4).
7. **mDelete scoped invalidation** — 1 delete ya no refetchea 5 trips (Iter 6, finalmente resuelto).
8. **Recap permission gate `recap_public`** — privacy by default, opt-in explícito (Iter 5).
9. **/tasks/[id] real page** — ghost route con 3 referrers rotos arreglada (Iter 6).
10. **Storage policies multi-user** — vault colaborativo funcional con RLS por trip_members (Iter 3).

---

## Lo que NO se hizo (carry-overs explícitos para próxima sesión)

### P0 sin resolver
- **`/journal` Supabase sync entries** — entries siguen en localStorage (multi-user trip no ve fotos del otro). Requiere migration `journal_entries` + RLS + sync hook.
- **`/itinerary` day ops** — drag&drop reorder, edit inline, mark complete.
- **`/journal` i18n masivo** — ~30 strings hardcoded (defer Iter 6 → Iter 7+).
- **MercadoPago checkout wire** — photobook endpoint listo, falta integration real.

### P1 deferred
- **SSE streaming `/api/assistant`** + `/api/generate-itinerary` — UX espera 8-12s con spinner.
- **Assistant multi-turn chat** — hoy es single-shot (no `messages[]` state).
- **Capacitor `confirm/alert` → ConfirmSheet hook** — ~12 call sites, refactor sistémico.
- **WhatsApp outbound pre-flight cron** — requiere prod Twilio ENVs.
- **Comments threaded** extender a reservations/expenses/polls/cities (hoy solo itinerary).
- **Polls deadline** column + countdown + notif "te queda 1 día para votar".
- **Apple Wallet auto-add** desde email parsing.
- **Storage keys legacy** `travel-os-*` → `tampu-*` sweep batch.
- **`/settings` i18n masivo** (~1234 LOC).
- **`/inbox` forward email per-user alias** completa (parcial).

---

## USER ACTIONS pendientes (P0)

### 1. Aplicar 6 migrations en Supabase SQL Editor

```sql
-- En orden:
00033_realtime_publication_extras.sql
00034_attachments_rls_multi_user.sql
00035_storage_policies_multi_user.sql
00036_alert_dismissals.sql
00037_attachment_expiry.sql
00038_recap_public.sql
```

Sin estas migrations:
- Vault colaboración multi-user rota (33-35)
- /alerts dismiss no persiste (36)
- Document expiry sin columna (37)
- **Recap siempre 404 silente** (38) — incluso con el toggle UI, falla porque la columna no existe.

### 2. Toggle `recap_public` en /settings

Una vez aplicada la migration 00038, abrir `/settings` → sección "Compartí mi viaje" → toggle ON para el trip activo.

### 3. ENV `CRON_SECRET` en Vercel

Para activar `/api/cron/expiry-check`:
- En Vercel dashboard → Project → Settings → Environment Variables.
- Agregar `CRON_SECRET` con cualquier string secreto largo (ej. `openssl rand -hex 32`).
- Configurar scheduler externo (Vercel Cron o cron-job.org) que hit `/api/cron/expiry-check` daily con `Authorization: Bearer ${CRON_SECRET}`.

### 4. Revocar 4 tokens (P1 — seguridad)

Estos tokens fueron compartidos durante la sesión y debe revocarse antes de exposición pública del repo:
- **Vercel** `vcp_25VaIb...` → https://vercel.com/account/tokens
- **GitHub PAT** `ghp_FIqo...` → https://github.com/settings/tokens
- **Resend** `re_UitCC...` → https://resend.com/api-keys (rotar y enviar el nuevo por canal seguro)
- **Supabase DB password** `HywEd...` → https://supabase.com/dashboard/project/cwlujkrfyucrifhintre/settings/database

---

## Lessons learned (notas del founder para próxima sesión)

1. **5 agentes paralelos por iteración es óptimo** — más se enredan, menos pierden capacity. Los 5 dominios (IA / Code / Diseño+i18n / Innovación / Funcionalidad) cubren todo sin overlap.
2. **Audit → Synth → Fix → Verify → Commit → Deploy → Log** es un protocolo robusto. Cada iter terminó verde.
3. **Territorios disjuntos** son críticos. Los conflicts más comunes son `/today`, `members`, `settings` — resolverlos en el dispatch (1 agent toca al file principal, otros agregan componentes).
4. **Rate limits** matan paralelismo agresivo — la sesión hit limit 1:50pm. Los burst de 10 agents simultáneos (audit + fix) consumen ~1M tokens en 10 min.
5. **CronCreate session-only** no sobrevive reinicios — el `durable: true` flag no era honrado. La continuidad real fue manual (`avanza` sincrónico).
6. **Anthropic temperature default = 1.0** es trampa enorme para JSON-strict endpoints. Default 0.2 debería ser el patrón en la lib.
7. **Hallucination de deep_links** en agentic loops requiere whitelist + sanitizer — los modelos inventan rutas plausibles.
8. **PII filter pre-LLM** es seguridad mínima — costo cero, beneficio alto.

---

## Estado final del repo (post-Iter 6)

- **Branch**: `main` @ `2bd47fd`
- **Last fix commit**: `720cfb5` (Iter 6 — 35 fixes)
- **Last log commit**: `2bd47fd` (Iter 6 changelog)
- **Tests**: 236/236 ✓
- **TypeScript**: 0 errors
- **Production deploy**: tampu-delta.vercel.app verde
- **Smoke**: /welcome 200, /login 200, /api/curated-destinations JSON

Quedan 2 iteraciones planeadas sin ejecutar (Iter 7, Iter 8). El estado actual es **producción-ready dado que se apliquen las 6 migrations**.

---

🤖 Loop autonómico ejecutado por Claude Code.
Co-Authored-By: Claude Opus 4.7 (1M context).
