# Tampu — Autonomous Loop Changelog

Loop iniciado: 2026-05-15 noche. Target: 8 iteraciones hasta 8 AM.
Cron: `7 * * * *` (hourly at minute 7, session-bound).

Cada iteración:
1. 5 audit agents paralelos (IA, Code, Diseño+i18n, Innovación, Funcionalidad)
2. Sintetizar top 10-15 fixes P0/P1
3. 5 fix agents paralelos (territorios disjuntos)
4. Verify tsc + smoke test
5. Commit + push + deploy via Vercel CLI
6. Log changes acá

**Permiso explícito del founder**: romper cosas en pos de mejorar.

---

## Iteration 0 — 2026-05-15 (pre-loop, sync fixes)

Commit `32fde57` — 3 bugs reportados por tester:

| # | File | Fix |
|---|---|---|
| 1 | `assistant/page.tsx:221` | Hardcoded "Claude · Sonnet 4" → dinámico ("Asistente IA" / "Asistente · Modo limitado") según `keyConfigured` |
| 2 | `globals.css:1006` | `@media (max-height: 700px)` escondía MoreFab → disabled (FAB era único acceso a /more) |
| 3 | `AddressDisplay.tsx` | + Botones "Mandármela por email" (mailto self) y "Por WhatsApp" (wa.me share) |

Verificación: tsc 0 errores, deploy Vercel OK, smoke test /welcome /login /api/curated-destinations todos 200.

---

## Iteration 1 — 2026-05-15 09:38 ART

**Pipeline**: 5 audit agents paralelos → 67 findings (15 IA + 15 Code + 17 Diseño+i18n + 10 Innovación + 10 Funcionalidad) → sintesis top 18 P0/P1 → 5 fix agents paralelos territorios disjuntos → verify (tsc 0 + vitest 220/221) → fix regression `withRetry` rethrow → vitest 221/221 → commit `800263b` → deploy FALLÓ (members useSearchParams sin Suspense) → fix Suspense wrap → commit `88acad4` → deploy OK → smoke 3/3.

### Changes aplicados (24 fixes totales)

**Dominio IA** (6 fixes, commit incluido en 800263b):

| # | File:line | Before → After |
|---|---|---|
| 1 | `src/lib/ai/pii-filter.ts:25` | Regex CC non-greedy buggy → `/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b\|\b\d{13,16}\b/g` |
| 2 | `src/lib/ai/pii-filter.ts:35` | Pasaporte over-masking PNRs → requiere label `passport\|pasaporte\|documento` precedente |
| 3 | `src/lib/whatsapp/auto-insert.ts:254-260` | `criticalityFor` dead code → flight/hotel="important", otros="nice_to_have" |
| 4 | `parse-booking + parse-email-confirmation /route.ts` | `selectProvider(req)` → `selectProvider(req, { allowTampuFallback: false })` explícito |
| 5 | `src/lib/whatsapp/parser.ts:329` | Pricing hardcoded Gemini → `estimateCostUsd(in, out, "gemini-2.0-flash")` |
| 6 | `src/lib/ai/agentic.ts:337-378` + `providers.ts:withRetry` exportado | Agentic loop sin retry → wrapped en withRetry + 4xx no se reintenta |
| 7 | `src/app/api/assistant/route.ts:385-395` (post-fix) | try/catch alrededor de runAgenticAssistant para fallback heurístico |

**Dominio Code** (5 fixes):

| # | File:line | Before → After |
|---|---|---|
| 8 | `src/components/layout/error-boundary.tsx:16,47` | `reportError` collision con utils → renombrado a `logBoundaryError` |
| 9 | Dead code cleanup | Borrado: `fetchTrip`, `insertTask`, `useForceUpdate`, `upsertBudgetCategory` single |
| 10 | `src/lib/hooks/use-theme.ts` | `travel-os-theme` → `tampu-theme` + migrateLegacyKey |
| 11 | `src/lib/hooks/use-trip-realtime.ts` | onChange callback único → map `{ reservations?, expenses?, tasks?, cities? }` typed |
| 12 | `src/app/(app)/itinerary/page.tsx:79-83` | Caller actualizado al nuevo onChange shape (out-of-territory pero requerido para tsc) |

**Dominio Diseño+i18n** (11 fixes):

| # | File:line | Before → After |
|---|---|---|
| 13 | `/more/page.tsx:106` | "Cifrado at-rest del Vault" → "Cifrado at-rest de tus Documentos" |
| 14 | `/itinerary/page.tsx:324` | "Tap para detalle" hardcoded → `t.itinerary.tapHint` ("Tocá para detalle") |
| 15 | `/inbox/page.tsx:183` | mailto body EN hardcoded → `t.inbox.mailtoBody` ES localizado |
| 16 | `/cashflow/page.tsx:40` | LargeTitle "Movimiento" → "Dinero" (matchea tab) |
| 17 | `/emergency/page.tsx:206` | `<Pill>OK</Pill>` → `<Pill>Listo</Pill>` |
| 18 | `/import/page.tsx:540` | Placeholder textarea hardcoded → `t.import.pasteEmailPlaceholder` |
| 19 | `src/lib/vault/storage.ts:182,195,255,396` | 4 throws "Vault bloqueado" → "Documentos bloqueados" |
| 20 | `/settings/page.tsx:317,496` | Toasts "Vault" → "Documentos" en UI strings |
| 21 | `/api/assistant/route.ts:133,145,146` | Answers user-facing "Vault" → "Documentos" |
| 22 | `AddressDisplay.tsx:55` | Share title "Mi alias Tampu" → "Mi dirección Tampu" unificado |
| 23 | 7 pages | EmptyStates con prop `action={<Link>...</Link>}` CTA — cashflow, split, assistant, health, emergency, inbox, journal |

**Dominio Funcionalidad** (7 fixes):

| # | File:line | Before → After |
|---|---|---|
| 24 | `src/middleware.ts:12` | `/share` agregado a PUBLIC_PATHS (compartir itinerario funciona end-to-end ahora) |
| 25 | `/reservations/page.tsx` | Sin botón "Nueva" → Sheet con form 6-campos + addReservation mutation |
| 26 | `/welcome/page.tsx` | Auth user sin trips se quedaba → useEffect redirige a `/trips?wizard=1` auto |
| 27 | `/members/page.tsx` | No leía `?invite=` → scroll + highlight ring 4s en la fila matching |
| 28 | `/polls/page.tsx` | Solo localStorage → reads online + realtime (writes siguen local, TODO iter 2) |
| 29 | `/vault/page.tsx:191` | Path `${trip.user_id}/...` → `${callerUser.id}/...` (storage RLS correcto) |
| 30 | `/profile/page.tsx:2,13` | useRouter import no usado → eliminado |

**Dominio Innovación** (1 quick-win):

| # | File:line | Before → After |
|---|---|---|
| 31 | `src/components/passes/AddToWalletButton.tsx` (new) + `/reservations/page.tsx:14,149-160` | UI Apple Wallet pkpass button en rows type=flight. Graceful degrade si endpoint 503 (cert no setup). |

**Build fix post-merge**:

| # | File:line | Before → After |
|---|---|---|
| 32 | `/members/page.tsx` | `useSearchParams` sin Suspense rompía prerender → Refactor a SharePageContent + Suspense wrapper canónico |

### Verificación

- `npx tsc --noEmit` → exit 0 ✓
- `npx vitest run` → 221/221 pass ✓
- `npm run build` local → all 67 routes generated ✓
- Vercel CLI deploy → production READY ✓
- Smoke tests post-deploy:
  - `https://tampu-delta.vercel.app/welcome` → 200 ✓
  - `https://tampu-delta.vercel.app/login` → 200 ✓
  - `https://tampu-delta.vercel.app/share?d=test` → 200 ✓ (validando fix middleware P0)

### Token cost estimado iter

- 5 audit agents: ~80k tokens total
- 5 fix agents: ~70k tokens total
- 2 micro-fixes (regression + Suspense): ~5k
- **Total Iter 1**: ~155k tokens

### Observaciones para Iter 2+

1. **Polls writes** todavía local — los `createPollOnline/castVoteOnline/closePollOnline` están en lib pero CreatePoll/PollCard no los usan. Iter 2 prioridad.
2. **Storage key sweep** parcial — solo `theme` migrado. Quedan ~30 keys legacy `travel-os-*` en lib/components.
3. **TanStack Query coverage** parcial — attachments, trip_members, email_in_entries, polls, journal_* no migrated, queries directas client-side.
4. **Tipos generados** todavía hardcoded en `database.ts` — `supabase gen types` no se corrió.
5. **iPhone SE FAB stacking** — la media query disabled correctamente, pero el spec del UI agent sugirió comprimir `--fab-stack-{1,2,3}` en max-height: 740px. Pendiente.
6. **Email-in DNS** sigue sin configurar — `tampu+SHORT@in.tampu.app` no resuelve sin MX records.

Commits: `800263b` (18 fixes) + `01f3678` (force-dynamic intermedio) + `88acad4` (Suspense wrap).

---

## Iteration 2 — 2026-05-15T13:02:29Z


**Pipeline**: 5 audit agents → 62 findings → sintesis top 16 P0/P1 → 5 fix agents paralelos → verify (tsc 0 + vitest 234/234, +13 tests PII filter) → commit `a0d80bc` → deploy CLI OK → smoke 3/3.

### Changes aplicados (30+ fixes)

**Dominio IA** (7):

| # | File | Before → After |
|---|---|---|
| 1 | `pii-filter.ts:24-26` | Regex CC over-masking IDs largos → split en 2 patrones (separator + label-required) |
| 2 | `pii-filter.ts:30` | DNI: agregado pattern con puntos (`DNI 35.123.456`) |
| 3 | `pii-filter.ts:33` | CUIT: prefijo restringido a 20/23/24/27/30/33/34 |
| 4 | `__tests__/pii-filter.test.ts` (NEW) | 13 tests cubriendo CC, DNI, CUIT, PNR, passport |
| 5 | `agentic.ts:476-493` | Prompt injection: tool_results wrapped en `<tool_output>` + escape backticks |
| 6 | `agentic.ts:402-419` | Loop guards: LOOP_BUDGET_TOKENS=50k + LOOP_TIMEOUT_MS=60s |
| 7 | `providers.ts:186-200, 246-260` | 429/5xx throw status (no más null silente) — withRetry actúa |
| 8 | `assistant/route.ts:6-24` | `getProxyIdentifier` per-user: `byok:user:UID:assistant` |

**Dominio Code** (8):

| # | File | Before → After |
|---|---|---|
| 9 | `src/lib/data/attachments.ts` (NEW) | fetchAttachments + insertAttachment + updateAttachment + deleteAttachment |
| 10 | `use-trip-data.ts` | useAttachments hook + mAddAttachment + mDeleteAttachment con invalidation |
| 11 | `boarding-passes.tsx` | Migrado a useAttachments (-22 LoC) |
| 12 | `vault/page.tsx` | Migrado a useAttachments + mutations |
| 13 | `use-trip-data.ts:mActivateTrip` | + invalidación activeTrip/commandCenter/dashboard |
| 14 | `migrations/00033_realtime_publication_extras.sql` (NEW) | 6 tablas agregadas a realtime |
| 15 | `migrations/00034_attachments_rls_multi_user.sql` (NEW) | RLS basada en trip_members (P0 vault editor) |
| 16 | `components/shared/EmptyState.tsx` (DELETED) | Dead code, callers usan index.tsx |
| 17 | `globals.css:80-91, 1014-1025` | FAB tokens --fab-stack-1/2/3 + media query 740px |
| 18 | `{assistant,more,expense}-fab.tsx` | inline 88/152/216px → var(--fab-stack-N) |

**Dominio Diseño+i18n** (21):

| # | File | Before → After |
|---|---|---|
| 19 | `dictionaries/es.ts + en.ts` | + `common.noActiveTrip`, `common.close`, `trips.edit.*` (17 keys), `visas.*` (16 keys) |
| 20 | `/trips/[id]/edit/page.tsx` | 17 strings hardcoded → `t.trips.edit.*` |
| 21 | `/trips/[id]/edit/page.tsx:12` | `export const dynamic = "force-dynamic"` eliminado (no-op client) |
| 22 | `/visas/page.tsx` | Refactor i18n completo |
| 23 | `/polls + /expenses + /vault + /health + /map + /visas` | EmptyStates con `action={<Link><Button>...}` CTA |
| 24 | `activity-feed.tsx:40` | "Sin viaje activo" → `t.common.noActiveTrip` |
| 25 | `destination-guide.tsx + toast.tsx` | aria-label "Cerrar" → `t.common.close` |

**Dominio Funcionalidad** (7):

| # | File | Before → After |
|---|---|---|
| 26 | `create-poll.tsx + poll-card.tsx` | P0 carry-over: writes online via createPollOnline/castVoteOnline/deletePollOnline |
| 27 | `/members/page.tsx:160-188` | acceptInvite → setActiveTrip + router.push("/today") |
| 28 | `/api/trip-invite/route.ts:48-58` | Self-invite check (400) |
| 29 | `/share/page.tsx + /itinerary/page.tsx` | TTL 30 días via campo `exp` en payload |
| 30 | `/trips/[id]/edit/page.tsx:handleSave` | Preserva contingency_pct ratio en lugar de hardcoded 0.10 |

**Dominio Innovación** (1 quick-win):

| # | File | Before → After |
|---|---|---|
| 31 | `src/components/journal/PrintBookSheet.tsx` (NEW) | Sheet con title + binding selector (softcover/hardcover/lay-flat) + POST /api/print-book |
| 32 | `/journal/page.tsx` | Botón "Pedir libro" en SectionHeader + integración |

### Verificación

- `npx tsc --noEmit` exit 0 ✓
- `npx vitest run` 234/234 (+13 nuevos PII tests) ✓
- `npm run build` 67 routes generated ✓
- Vercel CLI deploy → production READY ✓
- Smoke: /welcome 200 ✓, /login 200 ✓, /api/curated-destinations JSON ✓

### USER ACTIONS post-Iter 2

1. **Aplicar migration 00033** en Supabase SQL Editor (realtime extras)
2. **Aplicar migration 00034** en Supabase SQL Editor (vault RLS multi-user) — sin esto el bug de vault editor invitado persiste
3. Revocar Vercel/GitHub/Resend/Supabase DB pass (carry-over Iter 1)

### Token cost estimado

- 5 audit agents: ~115k tokens
- 5 fix agents: ~135k tokens
- Total Iter 2: ~250k tokens

### Observaciones para Iter 3+

1. Reservations attachments TODO Iter 3 (TanStack migration parcial)
2. Storage keys legacy `travel-os-*` (~30 keys, parcialmente migrado)
3. Tipos generados Supabase (`supabase gen types`) bloqueado por interactive auth
4. SSE streaming real para assistant/itinerary (4-6h)
5. Carbon footprint Climatiq, comments threaded item-level, fare tracker
6. WhatsApp outbound pre-flight cron

Commits Iter 2: `a0d80bc` (consolidado).

---

## Iteration 3 — 2026-05-15T13:24:29Z


**Pipeline**: 5 audit agents → 50+ findings (cobertura proxy gaps + storage policies multi-user + i18n pages críticas + carry-overs) → sintesis top 14 P0/P1 → 5 fix agents paralelos → verify (tsc 0 + vitest 234/234, sin regression) → commit `04998ee` → deploy CLI OK → smoke 3/3.

### Changes aplicados (47 fixes consolidados)

**Dominio IA** (12 fixes):

| # | File | Resolución |
|---|---|---|
| 1 | `src/lib/ai/proxy-identifier.ts` (NEW) | Helper `getProxyIdentifier(suffix, fallback)` con user.id lookup |
| 2 | `assistant/route.ts:1-12` | Imports helper compartido (eliminó def local) |
| 3-7 | 5 LLM routes | BYOK per-user identifier: categorize-expense, parse-booking, parse-email-confirmation, generate-itinerary, classify-document |
| 8 | `email-in/route.ts:262-292` | callLLM→callLLMRich, allowTampuFallback:false, recordProxyCall, identifier per-user |
| 9 | `airport-info/route.ts:57-115` | callLLM→callLLMRich, recordProxyCall, caps 200ch name/city/country + 16ch IATA |
| 10 | `whatsapp/parser.ts:152-260` | callAnthropicHaiku/callGeminiFlash wrapped en withRetry + status throw on 429/5xx |
| 11 | `whatsapp/parser.ts:247-275` | validateDataShape por type (flight/hotel/transport/reservation/note/unknown) |
| 12 | `whatsapp/parser.ts:282-306` | normalizeParsed degrade confidence si shape validation fail |

**Dominio Code** (6 fixes):

| # | File | Resolución |
|---|---|---|
| 13 | `use-trip-data.ts:mActivateTrip` | Removed dead invalidations (commandCenter/dashboard), scope activeTrip by mode |
| 14 | `use-trip-data.ts:invalidateTrip` | +["attachments", mode, tripId] invalidation |
| 15 | `use-theme.ts:23-30` | getServerSnapshot retorna "light" (default real, evita hydration mismatch) |
| 16 | `use-trip-realtime.ts:51-72,113-130` | Handlers opcionales agregados: attachments, tripMembers, polls |
| 17 | `use-trip-realtime.ts:75-160` | Cleanup race fix con canceled flag + scoped channel ref |
| 18 | `use-trip-data.ts:mAddAttachment` | TODO comment para futura cross-invalidation |

**Dominio Diseño+i18n** (20 fixes):

| # | File | Resolución |
|---|---|---|
| 19 | `es.ts + en.ts` | Keys nuevas: passcode.* (~30), health.* (~16), wallet.* (6) — paridad EN garantizada por type |
| 20-32 | `/passcode/page.tsx` | 13 secciones de strings hardcoded movidas a t.passcode.* + StrengthBar refactor + formatRemaining usa time dict |
| 33-37 | `/health/page.tsx` | LEVEL_LABEL/STATUS_LABEL inline + KPI labels + EmptyState + malaria + disclaimer → t.health.* |
| 38-39 | `AddToWalletButton.tsx` | 6 strings hardcoded → t.wallet.*, useI18n imported |
| 40 | `components/ios/index.tsx:293-302` | Sheet: useEffect Escape key listener + cleanup |

**Dominio Funcionalidad** (8 fixes):

| # | File | Resolución |
|---|---|---|
| 41 | `migrations/00035_storage_policies_multi_user.sql` (NEW) | SELECT via JOIN attachments+trip_members activos, INSERT/UPDATE/DELETE solo uploader |
| 42 | `docs/SUPABASE-STORAGE-SETUP.md:30-65` | SQL nuevo + nota explicando bug 00034 incompleto |
| 43 | `/trips/page.tsx:46-54,155-158` | WizardQueryReader sub-component lee ?wizard=1 + abre wizard |
| 44 | `PrintBookSheet.tsx:60-71` | Branch 401 con toast info "Necesitás iniciar sesión" |
| 45 | `/reservations/page.tsx:1-46` | Migrado a useAttachments hook (TanStack), eliminado fetch directo + localStorage legacy |

**Dominio Innovación** (2 fixes):

| # | File | Resolución |
|---|---|---|
| 46 | `src/components/dashboard/QuickStatsCard.tsx` (NEW) | 4-cell grid: Días/Vuelos/Docs/Presupuesto con tone-mapping urgency |
| 47 | `/today/page.tsx:3-22,75-104,262-267` | useMemo derivation + render entre HeroParallax y NBA |

### Verificación

- `npx tsc --noEmit` exit 0 ✓
- `npx vitest run` 234/234 ✓ (sin regression)
- `npm run build` 67 routes ✓
- Vercel CLI deploy → production READY ✓
- Smoke: /welcome 200 ✓, /login 200 ✓, /api/curated-destinations JSON ✓

### USER ACTIONS post-Iter 3

**P0 CRÍTICO**:
- **Aplicar migration 00035** en Supabase SQL Editor (storage policies multi-user)
- Sin esto: miembros del trip NO pueden leer attachments uploaded por otros → vault colaboración rota

### Token cost estimado Iter 3

- 5 audit agents: ~135k tokens
- 5 fix agents: ~110k tokens
- Total: ~245k tokens

### Observaciones para Iter 4+

1. AddToWalletButton iOS download fix (defer, fuera de territorio Iter 3)
2. Storage keys legacy `travel-os-*` sweep masivo (vault, ai-key, journal, weather caches)
3. Page-level i18n carry-over: /today, /settings (hardcoded greetings, profile parts)
4. EmptyStates restantes en /tasks, /reservations, /alerts (action CTAs)
5. Font-size scale sweep en top-5 archivos (settings, itinerary, command, welcome, vault)
6. SSE streaming real /api/assistant y /api/generate-itinerary
7. WhatsApp outbound pre-flight cron (requires prod Twilio ENVs)
8. Tampu Recap MVP @vercel/og
9. Comments threaded item-level extender más allá de itinerary

Commit Iter 3: `04998ee` (consolidado).

---

## Iteration 4 — 2026-05-15T13:51:32Z

**Pipeline**: 5 audit agents (60+ findings) → 5 fix agents paralelos → 59 fixes aplicados → verify tsc 0 + vitest 234/234 + build 69 routes OK → commit `cf7d96e` + Vercel deploy production → smoke /welcome 200, /login 200, /api/curated-destinations JSON ✓.

### Cambios (59) por dominio

**IA (9)** — `src/lib/ai/json-extractor.ts` NEW (extractJson<T> centralizado), 6 endpoints migrados (assistant, parse-booking, parse-email-confirmation, airport-info, classify-document, agentic), `agentic.ts` deep_link whitelist + `sanitizeDeepLink()` contra hallucination, `expense-categorizer.ts` proxy fallback.

**Code (6)** — `src/lib/data/members.ts` NEW (TripMember type + CRUD), `useTripMembers` hook + `mUpdateAttachment` mutation, `members/page.tsx` TanStack + realtime, `vault/page.tsx` toggleFavorite via mutation, `storage/keys.ts` registry expandido.

**Diseño+i18n (30)** — `src/lib/i18n/plural.ts` NEW (Intl.PluralRules), `es.ts`+`en.ts` keys today.*+cashflow.*, `/today/page.tsx` 12 strings + plural helper, `/cashflow/page.tsx` 13 strings, QuickStatsCard i18n, skeleton sweep budget+reservations.

**Funcionalidad (9)** — `mAddTask` mutation + UI inline en `/tasks` (P0 ghost feature resuelto), migration 00036_alert_dismissals.sql (RLS user-scoped), `/alerts` dismiss in-memory, `/inbox` commitEntry partial commit (EmailInStatus extendido con "partial"), `/settings` BYOK Turnstile fallback + checkout redirect.

**Innovación (5) — Tampu Recap MVP** — `@vercel/og` instalado, `src/app/api/recap/[tripId]/route.tsx` NEW Edge (ImageResponse 1200x630 + 4 stats + gradiente tierra, cache 1h+24h SWR), `src/app/recap/[tripId]/page.tsx` NEW HTML wrapper og:image, `src/components/share/RecapShareButton.tsx` NEW Web Share API, middleware PUBLIC_PATHS +/recap+/api/recap/.

### Verificación
- `npx tsc --noEmit` exit 0 ✓
- `npx vitest run` 234/234 ✓
- `npm run build` 69 routes ✓
- Deploy production READY ✓
- Smoke /welcome 200, /login 200, /api/curated-destinations JSON ✓

### USER ACTIONS post-Iter 4
**P0 CRÍTICO**: Aplicar migration 00036_alert_dismissals.sql en Supabase SQL Editor.
**P1**: Revocar 4 tokens (Vercel, GitHub PAT, Resend, Supabase DB password).

### Token cost estimado Iter 4
~280k tokens (5 audit + 5 fix + verify + commit + deploy).

### Observaciones para Iter 5+
1. `/alerts` dismiss → wire DB persistence (migration 00036 lista)
2. `/journal` entries Supabase sync (P0 unfixed)
3. `/itinerary` day ops (drag&drop, edit, complete) P0 unfixed
4. `/settings` i18n masivo (~1234 LOC, deferred 6-8h)
5. Storage keys legacy `travel-os-*` → `tampu-*` sweep
6. SSE streaming `/api/assistant`
7. WhatsApp outbound pre-flight cron
8. Recap button wire en `/today`

Commit Iter 4: `cf7d96e`.

---

## Iteration 5 — 2026-05-15T13:53:30Z

**Pipeline**: 5 audit agents (~40 findings reales) → top-15 priorizados → 5 fix agents paralelos con territorios disjuntos → 36 fixes aplicados + 1 skip → tsc 0 ✓ + vitest 234/234 ✓ → commit `4b66b1d` → push → Vercel CLI deploy production → smoke /welcome 200, /login 200, /api/curated-destinations JSON ✓.

### Cambios (36) por dominio

**IA (8)** — `classify-document` rate-limit + checkDailyBudget guard cuando `source=tampu` (DoS protect); `categorize-expense` migrado a `extractJson<T>` (último endpoint legacy); `providers.ts` temperature param + Gemini default 0.2 (era 0.5, reducía hallucination JSON-strict); `agentic.ts` captureException Sentry + max_tokens 800 default (1500 solo turn final); `parse-email-confirmation` BookingType validator + coerce amounts string→number; `airport-info` Array.isArray coerce 6 arrays; `whatsapp/parser.ts` regla dura voseo argentino.

**Code (7)** — `use-trip-data.ts:useTripFullDataset.ready=!loading` (era `!!data` siempre truthy → dashboard "vacío" pre-load); `invalidateTrip` ahora invalida `tripMembers`; `polls/page.tsx` realtime channel duplicado eliminado (usa `useTripRealtime`); `members/page.tsx` revokeMember/removeMember via data layer; `supabase-generated.ts` 13 TableRow stubs (trip_members + 12 más); `middleware.ts` prod sin envs → redirect `/welcome?config=missing` (era pass-through inseguro); `query-provider.tsx` staleTime 60s + gcTime 10m.

**Diseño+i18n (12)** — `/more` i18n completo (~40 keys); `/split` i18n + "Split"→"Compartido" ES; `/alerts` t.alerts.* completo + plural helper; `create-poll` sheet ~12 keys t.pollsCreate; `emergency` "Checklist mental"→"Repaso mental"; `settings` "Tracking GPS"→"Ubicación GPS"; `expense-fab`+`more-fab`+`assistant-fab` aria-labels i18n + t.common.fabs.*; `AddressDisplay`+`sync-indicator` i18n; `/map` i18n + plural noches; `ai-generator-sheet` spinner→skeleton bars; paridad EN/ES verificada.

**Innovación (5)** — `RecapShareButton` wired en `/today` (era ghost orphan Iter 4 — fix más alto ROI); `/api/recap/[tripId]` enriquecido 4→5 stats (días/países/vuelos/docs/reservas + cities.country distinct); `src/app/api/recap/year/[userId]/route.tsx` NEW (Tampu Unpacked anual: tripsCount + totalDaysInYear + countries + topCountry + flightsCount + topMonth); `src/app/recap/year/[userId]/page.tsx` NEW (HTML wrapper og:image); `/api/print-book` devuelve checkoutUrl placeholder + orderId (MercadoPago wire deferred Iter 6); migration `00037_attachment_expiry.sql` (column + index parcial).

**Funcionalidad (5 + 1 skip)** — Migration `00038_recap_public.sql` (trips.recap_public bool default false); `/api/recap/[tripId]` gate 404 si `recap_public≠true` (privacy by default — coordinado con Innov stats); `welcome/page.tsx` guards `pathname+typeof window` anti-flicker; `share/page.tsx` destHue restringido familia tierra `15+(Math.abs(h)%80)`; `assistant/page.tsx` readVersioned demo (era JSON.parse crudo unsafe); `reservations` "Crear poll" pasa `?suggest=tipo`. SKIP: rename `travel-os-anthropic-key-change` event (requería sweep batch coordinado fuera de territorio).

### Verificación

- `npx tsc --noEmit` exit 0 ✓
- `npx vitest run` 234/234 ✓ (sin regression)
- Deploy production READY ✓
- Smoke /welcome 200 ✓, /login 200 ✓, /api/curated-destinations JSON ✓

### USER ACTIONS post-Iter 5

**P0 CRÍTICO**:
- **Aplicar migration 00037_attachment_expiry.sql** en Supabase SQL Editor (column expires_at + index parcial)
- **Aplicar migration 00038_recap_public.sql** en Supabase SQL Editor (trips.recap_public bool default false)
- Sin 00038, **TODOS los recaps devuelven 404** (correcto — privacy opt-in by default). El user debe togglear `recap_public=true` en /settings o por DB para activar share.

### Token cost estimado Iter 5

- 5 audit agents: ~610k input tokens
- 5 fix agents: ~503k input tokens
- Verify + commit + deploy: ~5k
- Total: ~1.12M tokens (~USD 8 a precios Sonnet)

### Observaciones para Iter 6+

1. **UI toggle `recap_public`** en `/settings` o `/share` — sin esto, el endpoint funciona pero está bloqueado siempre por defecto.
2. **MercadoPago checkout** para print-book (endpoint listo, falta integration).
3. **SSE streaming** `/api/assistant` + `/api/generate-itinerary` — sigue siendo carry-over (Iter 4 obs).
4. **Assistant multi-turn chat** — único response state actual, single-shot.
5. **Journal Supabase sync** — entries siguen en localStorage (P0 unfixed).
6. **`/itinerary` day ops** (drag&drop, edit, complete) — P0 unfixed.
7. **`/settings` i18n masivo** (~1234 LOC) — sigue deferred, sólo "Tracking GPS" fixeado.
8. **Storage keys legacy** `travel-os-*` → `tampu-*` sweep batch coordinado.
9. **WhatsApp outbound pre-flight cron** — requiere prod Twilio ENVs.
10. **mDeleteExpense/Reservation scoped invalidation** — skipped en Iter 5 (refactor breaking de API hook).
11. **Vault Capacitor alert/confirm** → Sheet pattern — skipped (12 call sites, requiere `useConfirmSheet` hook nuevo).
12. **Email-in GET handler** — Funcionalidad agent reportó como TODO (paso #2 del prompt), verificar si quedó implementado.

Commit Iter 5: `4b66b1d`.

---

## Iteration 6 — 2026-05-15T17:23:20Z

**Pipeline**: 5 audit agents (~50 findings) → top-18 priorizados → 5 fix agents paralelos disjuntos → **35 fixes aplicados + 1 skip** → tsc 0 ✓ + vitest 236/236 ✓ (+2 PII tests CBU/IBAN) → commit `720cfb5` → push → Vercel deploy → smoke /welcome 200, /login 200, /api/curated-destinations JSON ✓.

### Cambios (35) por dominio

**IA (7)** — `providers.ts` Anthropic temperature default 0.2 (era 1.0 → hallucination JSON-strict en 8 endpoints, fix sin tocar callers); `assistant`+`generate-itinerary` temperature 0.6 explícito (prosa más natural); `generate-itinerary` validación rango fechas + day_number consecutivo (previene itinerarios imaginarios fuera de viaje); `ai-proxy` Retry-After garantizado 429/503 + temperature param body + default 0.2; `pii-filter` 3 regex nuevas CBU AR (label + bare 22-dígitos) + IBAN europeo + 2 tests passing.

**Code (6)** — `use-trip-data.ts` mDelete{Expense,Reservation,Attachment} **scoped invalidation** (overload pragmatic `string | {id,tripId}` — soluciona el skip de Iter 5); 3 callers actualizados (`/expenses`, `/itinerary`, `/vault`); `use-theme.ts` getSnapshot fallback `"light"` (era `"dark"`, hydration mismatch boot script); `supabase/client.ts` `resetClient()` exportado para logout cleanup; `next.config.ts` `images.remotePatterns` `*.supabase.co`; `twilio.ts` any → `Twilio` types (últimos 2 any del codebase); members race fix usando `activateTrip` mutation en vez de `setActiveTrip` raw.

**Diseño+i18n (7)** — `en.ts` portado `members.roles` + `comments.*` blocks (paridad rota → reparada P0); `/vault` top strings i18n (title, CTAs, sheet labels, retentionFaq, locationShort, name/category/notes, classifyAI, analyzing, autoLinkTo); `comment-thread.tsx` i18n full + plural (commentCount, showResolved); `poll-card.tsx` i18n + `activity.voted` con placeholders {option}/{question} + plural voteCount; `members/page.tsx` `ROLE_LABEL` → `t.members.roles.{owner,editor,viewer}` ("Dueño/Editor/Visor" ES); `attach-doc-button.tsx` `t.vault.attach.*`; `PrintBookSheet.tsx` BINDING_LABELS + defaultTitle i18n.

**Innovación (6)** — `/settings` **nueva sección "Compartí mi viaje"** con toggle `recap_public` (DESBLOQUEA features Iter 4-5 que estaban 404 por privacy gate); `data/trips.ts` `updateTripRecapPublic` helper + `recap_public` en `TRIP_LIST_COLUMNS`; `AnnualRecapPromoCard.tsx` NEW (visible Nov/Dic/Ene → `/recap/year/[userId]`, CAC orgánico anual); `ExpiringDocCard.tsx` NEW (top 3 docs próximos a vencer, ventana 0-90d); ambos cards montados en `/today`; `/api/cron/expiry-check` NEW (Bearer CRON_SECRET, scan attachments `expires_at`, insert alerts TODO).

**Funcionalidad (6)** — `/tasks/[id]` ghost route → página REAL (fetch + toggle complete + edit inline + delete, fix P0 de Iter 6 audit); `/login` "Olvidé mi contraseña" inline form + `resetPasswordForEmail` flow (toast uniform anti-enum); `/trips` wizard `toast.warn` cuando faltan campos (era silent return); `/today` RecapShareButton disabled+toast.info si `recap_public=false` (UX defensiva); `/journal` caption debounce 300ms (era persist por keystroke); `/journal` event rename `tampu-vault-change` con legacy bridge.

### Verificación

- `npx tsc --noEmit` exit 0 ✓
- `npx vitest run` **236/236** ✓ (+2 PII tests CBU/IBAN, sin regression)
- Deploy production READY ✓
- Smoke /welcome 200 ✓, /login 200 ✓, /api/curated-destinations JSON ✓

### USER ACTIONS post-Iter 6

**P0 CRÍTICO**:
- Aplicar migrations pendientes (33-38) en Supabase SQL Editor
- Toggle `recap_public` en `/settings` → "Compartir mi viaje" para activar share del trip activo
- ENV `CRON_SECRET` en Vercel para activar `/api/cron/expiry-check` (cualquier string secreto + scheduler externo: cron-job.org / Vercel Cron / GitHub Actions schedule)

**P1**: Revocar 4 tokens (Vercel, GitHub PAT, Resend, Supabase DB password)

### Token cost estimado Iter 6

- 5 audit agents: ~550k input tokens
- 5 fix agents: ~480k input tokens
- Verify + commit + deploy: ~5k
- Total: ~1.05M tokens (~USD 7.5 Sonnet)

### Observaciones para Iter 7+

1. **/journal i18n masivo** (~30 strings, defer Iter 6 — toca en Iter 7)
2. **/journal Supabase sync entries** (tabla `journal_entries` + RLS — P0 carry-over Iter 4-5-6 unfixed)
3. **/itinerary day ops** (drag&drop, edit, mark complete — P0 carry-over unfixed)
4. **SSE streaming /api/assistant + /api/generate-itinerary** — carry-over
5. **Assistant multi-turn chat** (messages[] state) — carry-over
6. **MercadoPago checkout wire** (print-book endpoint listo, falta integration)
7. **Capacitor `confirm/alert` → ConfirmSheet hook** (~12 call sites — refactor sistémico)
8. **Forward email per-user alias** UI completa (parcial en /inbox)
9. **Apple Wallet auto-add** desde email parsing
10. **WhatsApp outbound pre-flight cron** — requiere Twilio prod ENVs
11. **Comments threaded extender** a reservations/expenses/polls/cities
12. **Polls deadline** column + countdown
13. **`recap_public` opt-in UX** podría ser default-on para usuarios que vieron Recap (signal de intent)
14. **Server Actions opportunities**: addTrip, setActiveTrip, mutaciones varias

Commit Iter 6: `720cfb5`.

---

## LOOP STOPPED — 6 iteraciones reales completadas

**Detenido por el founder** (2026-05-15T17:50Z). Cron `ae9d8198` cancelado. Ejecuté 6 iteraciones de las 8 planeadas (75%). Resumen consolidado abajo en el commit posterior — `docs/AUTONOMOUS-LOOP-SUMMARY.md`.

