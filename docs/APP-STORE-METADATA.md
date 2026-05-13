# Travel OS — App Store Connect Metadata

Plantilla lista para cargar.

## App Information

| Campo | Valor |
|---|---|
| App Name | `Travel OS` |
| Subtitle (30 chars) | `Command center del viaje` |
| Bundle ID | `com.travelos.app` |
| SKU | `travelos-ios-001` |
| Primary Category | `Travel` |
| Secondary Category | `Productivity` |
| Content Rights | "Does not contain third-party content" |

## Description (4000 chars max)

```
Travel OS es el command center que tu viaje merece. No es una app turística más —
es la consola operativa que necesitás para planificar, sobrevivir y disfrutar
viajes complejos.

QUÉ HACE
─────────
• Dashboard que responde en segundos: ¿qué hago ahora? ¿dónde duermo hoy? ¿cuánto me queda?
• Quick Access permanente: pasaporte, seguro, próximo vuelo, cama actual, contactos SOS.
• Modo Today durante el viaje: la información del día sin scroll.
• Money in Flight: pagos próximos con deadlines coloreados por urgencia.
• Cashflow visual: gráfico diario + acumulado vs presupuesto + por destino.
• Risk Register: semáforo en 5 dominios (salud, docs, dinero, camas, transporte).
• Centro de Decisiones: separa lo que requiere DECIDIR de la operación rutinaria.
• Vacunas por país (CDC): perfil completo con malaria, hep A/B, polio, JE, lead times.
• Visas wizard: requisitos por destino con costos, leads y link al sitio oficial.
• Connections analyzer: detecta layovers apretados antes de que pierdas un vuelo.
• Mapa del viaje con ciudades y ruta.
• Modo Emergencia: SOS por país, consulado, seguro, GOP, contactos críticos en una pantalla.
• Emergency Card imprimible (PDF) para llevar en el bolso.
• Asistente IA: pregunta cualquier cosa sobre tu viaje (modo opcional con Claude API).
• Resumen post-viaje: gasto real vs proyectado, variance por categoría.
• Export a Apple Calendar (ICS) para todos los vuelos + check-ins.
• Modo offline real: tu información crítica vive en el dispositivo.

PARA QUIÉN
──────────
• Viajeros que arman itinerarios complejos (varias ciudades, vuelos con conexión).
• Quienes hacen viajes con stakes altos: PNG, Amazonia, expediciones, tours no-refundables.
• Trabajadores remotos y nómades que necesitan controlar presupuesto cruzando monedas.
• Cualquiera que quiera dejar de tener 8 apps abiertas durante el viaje.

PRIVACIDAD PRIMERO
──────────────────
Travel OS NO recolecta tus datos. Sin trackers. Sin anuncios. Sin SDKs de terceros.
Modo demo: todo en tu dispositivo. Modo online: en tu propio Supabase.

100% gratis. Sin compras dentro de la app. Sin suscripción.
```

## Keywords (100 chars total, separados por coma)

```
viaje,travel,itinerario,packing,gastos,seguro,visa,vacunas,cashflow,offline,wanderlog,tripit
```

## Promotional Text (170 chars, editable sin re-review)

```
Tu próximo viaje complejo en una sola app: itinerario, gastos, documentos, vacunas, visas, SOS y asistente IA. Sin trackers, sin anuncios. Gratis para siempre.
```

## What's New (4000 chars — primera versión)

```
v1.0 — Lanzamiento

Travel OS llega a iOS con todo el command center desde el día 1:
• 33 vistas optimizadas para mobile
• Modo offline con PWA + Capacitor
• Asistente IA opcional con Claude
• Vacunas y visas con datos verificados CDC + sitios oficiales
• Risk Register en 5 dominios
• Conexiones críticas detectadas automáticamente
• Export a Calendar (ICS) y compartir nativo iOS
• Demo mode 100% offline para probar sin cuenta

¿Bugs o ideas? Escribinos a hello@travel-os.app
```

## URLs

| Tipo | URL |
|---|---|
| Privacy Policy | `https://travel-os.app/privacy` |
| Support | `https://travel-os.app/support` |
| Marketing | `https://travel-os.app` |

> Nota: estos URLs deben resolver antes del submit. Si todavía no tenés dominio, podés usar la URL del deploy Vercel (`https://travel-os-xyz.vercel.app/privacy`). Apple no exige dominio custom, pero la URL debe responder 200 + tener contenido legible.

## Localization

- Primary language: **Spanish (Mexico)** o **Spanish (Spain)** — elegí uno
- Add localization: **English (U.S.)** — la app es bilingüe

## Pricing

- Tier: **Free**
- Availability: **All territories** (o seleccionar países donde testear primero)

## Age Rating Questionnaire

- Cartoon or Fantasy Violence: None
- Realistic Violence: None
- Sexual Content: None
- Profanity: None
- Alcohol, Tobacco, Drug Use: None
- Mature/Suggestive Themes: None
- Horror/Fear Themes: None
- Medical/Treatment Information: **Infrequent/Mild** (sí — muestra recomendaciones CDC, debe quedar 4+)
- Gambling: None
- Contests: None
- Unrestricted Web Access: **No** (la app NO es un browser)
- User-Generated Content: None visible to others (los datos del usuario quedan en su backend)

**Resultado esperado: 4+**

## Screenshots — guion sugerido (10 frames por dispositivo)

1. **Dashboard hero** — Countdown + Trip Mode + Readiness ring + Quick Access bar
2. **Today card** — "Día 12 de tu viaje. Dormís en Goroka. Mañana POM."
3. **Money in Flight** — pagos próximos con totales 7d/30d
4. **Cashflow chart** — bar chart diario + budget line
5. **Risk Register** — grid 5 dominios con semáforos
6. **Decisions** — lista urgency-sorted
7. **Map** — ruta con pins + popup
8. **Health (vacunas)** — perfil PNG con malaria + Hep A
9. **Emergency** — SOS por país + insurance kit
10. **Assistant** — pregunta + respuesta con sugerencias

Cada frame con título grande superpuesto explicando QUÉ resuelve.
