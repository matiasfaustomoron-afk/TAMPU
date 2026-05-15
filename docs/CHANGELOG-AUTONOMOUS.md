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
