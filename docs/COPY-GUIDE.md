# Tampu — Copy Guide

Decisiones de terminología y tono. Auditor externo (mayo 2026) marcó
inconsistencias entre "boarding pass" / "pase", "Vault" / "Documentos",
"command center" / "hero" y mezclas español-inglés en UI. Este doc fija las
reglas — los strings nuevos deben respetarlas y los PR que las violen
deberían ser flaggeados en review.

## Idioma base

- **Español rioplatense, voseo argentino**. "Vos", "tenés", "querés", "andá".
  Nada de "tú" / "tienes" — el target premium argentino (45–60+, profesional)
  lo lee como traducción genérica latam, no como app local.
- **No usar "usted"**. Es la app, no un banco.
- **Inglés**: en.ts es traducción 1:1 del producto, term técnicos correctos
  (boarding pass, expense, itinerary). No es la versión nativa, el español lo es.
- **Tono**: calmo, claro, premium. No corporativo, no gamer, no transaccional.
  Verbos directos: "Pegá tu key", "Cargá tu viaje", "Tocá para abrir".

## Reglas firmes de terminología

### Vault → Documentos (en UI)

`Vault` es **brand-term interno** — vale como nombre de:
- la ruta `/vault`,
- el component `VaultPage` / `VaultRow`,
- los archivos `lib/vault/storage.ts`, `lib/vault/sqlite-backend.ts`,
- el local-storage key `travel-os-vault-${tripId}`,
- el bucket Supabase `travel-vault`.

Pero en **todo texto visible al user**, escribimos "Documentos" o "tus
documentos". El user no piensa en "vault", piensa en pasaporte y boarding
pass.

Excepciones puntuales aceptables:
- comments de código en EN/ES que digan "vault" como term técnico,
- mensajes de telemetría/error que no se renderean al user.

### "Boarding pass" → "Pase de embarque"

En **español**: siempre "pase de embarque" / "pases de embarque". El plural
"pases" solo va cuando el contexto deja claro que son pases de viaje (ej.
"Pases destacados" en /vault — está OK por contexto).

En **inglés**: "Boarding pass" / "boarding passes" (term internacional
reconocido, no se traduce). Cuando se usa el slug `boarding_pass` como
variable/enum, **no se cambia** — es identificador estable.

### "Command center" → no aparece en UI

El término sigue vivo en docs internos (AUDITORIA-Y-PLAN, MARKETING como
tagline alternativa) pero **no debe aparecer como label visible al user**.
Si necesitás describir la pantalla Hoy en un mensaje al user, usá:
"tu viaje", "tu próximo viaje", "tu día", "lo que importa ahora".

El componente `BoardingPassesWidget` y el path `components/command/` se
mantienen — son names internos, no copy.

### "Hero" → solo término técnico

Aceptable en:
- nombres de componentes: `HeroParallax`, `tampu-hero` CSS class,
- comments de código,
- prop names: `hero={true}`.

**No aceptable en texto visible**. Si un mensaje dice "el hero te muestra
X", se reescribe como "la primera pantalla te muestra X" o se elimina.

### Locator → Localizador

Etiquetas de campos de UI siempre en español: "Localizador" (no "Locator"),
"Asiento" (no "Seat"), "Puerta" (no "Gate"). El demo en welcome usaba
"Locator" como anglicismo gratuito — corregido.

## Anglicismos que dejamos pasar

No todo anglicismo es malo. Mantenemos:

- **Apple Wallet, Siri, AirDrop**: nombres propios de Apple. Cambiarlos
  sería incorrecto.
- **WhatsApp, Booking, Airbnb, Despegar**: marcas propias.
- **API key, OAuth, JWT, JSON**: términos técnicos que el user que los
  necesita ya conoce.
- **iPhone, iOS, watchOS**: idem.
- **PDF**: ya está castellanizado.
- **Tap**: NO usamos "tap". Usamos "Tocá" (voseo). "Tap to add" → "Tocá +
  para agregar".
- **Share**: usamos "Compartir". "Share sheet" se queda como term técnico
  cuando describimos el permiso iOS (en docs/privacy).
- **Split**: en /split, el label de nav es "Compartido" (no "Split"). El
  archivo y la ruta sí se llaman split — es brand-term interno.
- **FAB**: floating action button. No aparece nunca en UI visible al user
  — es jerga de diseño que vive en comments.

## Marketing copy (MARKETING.md)

MARKETING.md tiene "Premium travel command center" como tagline alternativa
y "boarding passes" en el copy del Vault. Estas piezas viven fuera del
producto (App Store, landing, press kit) y siguen otra disciplina — no
quirúrgicamente alineadas con la UI. Cuando se actualice MARKETING.md,
**preferir la tagline principal** ("Tu copiloto de viaje") por sobre las
alternativas con anglicismos.

## Cómo agregar un string nuevo

1. ¿Es visible al user? Sí → va en `src/i18n/dictionaries/es.ts` con su par
   en `en.ts`. No → puede ser literal en el component.
2. ¿Usás el voseo? "Tocá", "Pegá", "Tenés" — no "toca", "pega", "tienes".
3. ¿Hay un término del Copy Guide que aplique? Usalo (no inventes sinónimos).
4. ¿El string menciona un término técnico (Wallet, OAuth)? Está OK.
5. Pasalo por `npm run lint && npm run typecheck` antes de PR.

## Auditoría continua

Para auditar el repo por anglicismos no deseados:

```bash
# Términos prohibidos en archivos de UI (src/app, src/components):
rg -i "boarding pass" src/app src/components       # debe estar en EN dict + comments OK
rg "Vault" src/app src/components                  # debe ser solo comments / class names
rg -i "command center" src/app src/components      # NO debe aparecer
rg -i "\bhero\b" src/app src/components | grep -v "// " | grep -v "Hero"  # solo techo names
```

Cualquier finding nuevo se evalúa contra estas reglas. Si el auditor vuelve
en N meses, debería encontrar el repo limpio.
