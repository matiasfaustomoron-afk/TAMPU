# Tampu — Voz de marca

Tampu (quechua *tampu*, también *tambo*): las postas del Camino del Inca donde el viajero se reabastecía. Esa es la promesa: la posta del viajero moderno.

## Personalidad
**Amigo experto que viaja con vos**. No tu agencia, no tu app de productividad. Alguien que sabe la diferencia entre "eSIM Italia" y "roaming caro", te lo dice en una frase, y te ahorra dinero.

## Tres palabras que SÍ somos
1. **Calmo** — sin urgencia falsa, sin badges rojos exagerados
2. **Directo** — el viajero no tiene tiempo, vamos al grano
3. **Honesto** — si recomendamos algo, decimos por qué y cuánto ganamos

## Tres palabras que NO somos
1. **Corporativo** — no decimos "estimado usuario"
2. **Cute** — no decimos "Listoooo ✨🎉"
3. **Técnico** — no decimos "heurística local"

## Reglas de copy

### Persona
- Usamos **vos** (no tú, no usted).
- Conjugación argentina: "tenés", "podés", "querés", "andá".
- Excepción: si la app está en EN, usar "you" y skip subject pronouns.

### Verbos
- **Imperativos directos**: "Cargá tu vuelo", "Adjuntá el PDF", "Andá a Ajustes".
- **NO**: "Por favor, considere cargar...", "Podría querer agregar..."

### Estructura de frase
- **Sujeto + verbo + objeto. Punto.** Frases cortas.
- Máximo 14 palabras por frase en UI principal.
- 2 oraciones por bloque máximo.

### Números
- Siempre con `tabular-nums` en CSS.
- Moneda: `USD 1.250` no `$1250 USD`.
- Fechas: "10 ago 2026" no "08/10/2026" ni "10-08-2026".
- Tiempo: "en 3h" no "in 3 hours", "en 2 días" no "in 2 days".

### Capitalización
- **Sentence case en títulos y botones**: "Crear viaje" (no "Crear Viaje").
- Eyebrows pueden ir UPPERCASE pero con tracking 0.18em.

### Tono según contexto

| Contexto | Voz |
|---|---|
| Welcome | Aspiracional, breve. "Tu copiloto de viaje." |
| Empty states | Invitación, no disculpa. "Sin pases todavía. Cargá el primero." |
| Errors | Honesto. "No pude guardar. Probá de nuevo en un rato." |
| Toast success | Confirmación + dato. "Gasto cargado · USD 25." |
| Toast info | Neutral. "Documento eliminado." |
| Toast warn | Claro qué pasó. "Permisos de notificación denegados." |
| Toast error | No dramático. "No pude conectarme. Reintentá." |
| Acciones críticas | Directo + confirma. "¿Eliminar el viaje? No se puede deshacer." |
| Affiliate disclosure | Explícito. "Tampu gana USD 3.20 si comprás Assistcard acá." |

### Lo que NO decimos NUNCA
- "Por favor"
- "Lo sentimos"
- "Algo salió mal"
- "Espere un momento"
- "Está procesando"
- "Plata" (modismo, queda fuera por consistencia editorial — usar "gasto", "dinero", "presupuesto", "cashflow" según contexto)
- Emojis decorativos en UI (✨🎉🚀)
- Anglicismos sin necesidad: "tip" (use "consejo"), "feature" (use "función"), "feedback" (use "comentario")

### Lo que SÍ usamos
- "Andá", "tenés", "viajás"
- "Gasto", "dinero", "presupuesto", "cashflow" (no "plata" — ver regla arriba)
- "Boletas" (no "tickets" siempre)
- "Boarding pass" se queda (estándar de aerolíneas)
- "Reserva", "vuelo", "alojamiento"
- "Cartera" en UI cuando hablamos del vault de documentos
- Símbolos cuando aportan: "→", "·", "★"
- Emojis funcionales en notificaciones: "✈️ Vuelo en 24h"

## Naming map — incongruencias resueltas

| Antes (inconsistente) | Ahora (canónico) |
|---|---|
| "Travel OS" | **Tampu** (siempre, sin excepciones) |
| "Vault" en URL | mantener `/vault` (legacy URL, OK) |
| "Vault" en UI | **"Cartera"** (siempre) |
| "Cashflow" tab | mantener **"Cashflow"** (término viajero técnico aceptado en es-AR/finanzas) |
| "Cashflow" page title | **"Cashflow"** — el sublabel: "tu dinero en el viaje" |
| "Plata" | retirar de todos los textos y de la voz |
| "Reservation" type interno | mantener en código DB, **"Reserva"** en UI |
| "Dashboard" page | **"Panel"** en UI, mantener `/dashboard` URL (deprecation pendiente — consolidar con `/today`) |
| "Summary" | retirado, usar **"Resumen"** dentro de `/book` |
| "Today" | **"Hoy"** en UI |
| "Vault offline" | **"Cartera offline"** |
| "Trip", "Trip overview" | **"Viaje"**, **"Tu viaje"** |
| "Item" en mutations | **"reserva"** / **"gasto"** / **"tarea"** según contexto |

## Ejemplos antes/después

| ANTES | DESPUÉS |
|---|---|
| "Sin tu key, el Asistente solo da heurísticas locales (limitado)" | "Sin key conectada, el Asistente responde con datos locales nada más." |
| "Gasto cargado: USD 25" | "Cargado · USD 25 a comida" |
| "Recordatorio activado para 2026-08-10T09:00:00" | "Te aviso el 10 de agosto a las 09:00." |
| "Permisos de notificación denegados" | "Falta el permiso de notificaciones en tu teléfono." |
| "No pude consultar el asistente. Probá de nuevo." | "El asistente no respondió. Reintentá en un rato." |
| "Travel OS encontró un error" | "Algo se rompió. Tus datos están seguros." |
| "Reservar más" | "Comprar lo que falta" |
| "Tu guía del destino" | "Tu guía para Roma" (con destino real) |
| "Cargá ciudades en el itinerario." | "Cargá ciudades del viaje primero." |
| "Tu plata en el viaje" | "Tu dinero en el viaje" |
