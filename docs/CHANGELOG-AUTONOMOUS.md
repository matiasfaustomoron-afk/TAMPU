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

