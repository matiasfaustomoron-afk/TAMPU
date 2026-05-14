# Tester invite — Tampu early access

Doc operativo para Matías. Tres secciones:

- **A** — Mensaje que le mandás al tester por WhatsApp/Telegram
- **B** — Onboarding interno que el tester lee la primera vez que entra
- **C** — Checklist tuyo antes de mandar el invite

---

## A. Mensaje a mandar (WhatsApp / Telegram / DM)

Template editable. Reemplazá `<vercel>.app` por la URL real, `<código>` por la palabra del Twilio sandbox, y el nombre del tester arriba.

> Che [nombre], estoy probando algo que armé. Se llama **Tampu** — una app para juntar todo el lío del viaje (vuelos, hoteles, documentos, gastos) en un lugar, en español y con WhatsApp ingestion (le reenviás la confirmación del Airbnb y la agrega solo).
>
> Sos 1 de 5 que la prueba antes de que la suelte públicamente. Tu input me importa más que cualquier review post-launch.
>
> **Link**: https://<vercel>.app
> **Cuenta**: con tu email, te llega magic link al inbox.
> **WhatsApp**: mandale `join <código>` por WhatsApp al `+1 415 523 8886` y ya quedás en el sandbox. Después en Settings → WhatsApp vinculás tu número.
>
> Quería que pruebes 3 cosas:
> 1. Cargá un viaje real tuyo (uno próximo o uno que estés planeando).
> 2. Reenviá por WhatsApp una confirmación que tengas (de Airbnb, vuelo, lo que sea).
> 3. Andá al modo demo si querés ver cómo se siente con data ya cargada.
>
> Va a haber bugs. Mandame palo honesto — qué te parece feo, qué no entendiste, qué te haría volver mañana. No me cuides los sentimientos, prefiero que me digas "no entiendo qué hace este botón" a un "está buenísimo" de compromiso.
>
> Privacy: todo vive en tu device o en una DB mía con RLS estricto. No vendo nada, no rastreo. Hay botón para borrar todo si querés salir.
>
> Si querés apoyar el proyecto hay un Tampu+ Lifetime de USD 29 — pero estamos en Stripe test mode, así que **NO pongas tu tarjeta real**. Usá `4242 4242 4242 4242` / cualquier CVC / cualquier fecha futura. Es para probar el flow, no te cobra nada.
>
> Feedback: matiasfaustomoron@gmail.com o por acá.
>
> Gracias por el favor.
>
> — Matías

---

## B. Onboarding interno

Texto que el tester lee la primera vez que entra. Por ahora vive solo en este doc (no creamos página todavía); podés copiarlo y mandarlo aparte si querés, o ponerlo en un `/about/early-access` más adelante.

---

### Bienvenido al early access de Tampu

Estás entre los primeros 5. Esto está crudo.

#### Qué funciona hoy

- Crear y gestionar viajes (vuelos, alojamientos, ciudades, días).
- Vault encriptado para documentos sensibles. Passcode = 4 palabras o 12 caracteres mínimo (frases débiles rechazadas).
- WhatsApp ingestion: reenviás una confirmación al sandbox y el parser la convierte en reservation automáticamente (text-only por ahora).
- Gastos con conversión multi-moneda (USD/ARS/BRL).
- Asistente AI con tu propia key (BYOK) o el free tier que cubre Tampu (50 llamadas/mes a Claude Haiku).
- Apoyo opcional **Tampu+ Lifetime USD 29**. Estamos en Stripe **test mode** — usá tarjeta `4242 4242 4242 4242`, no se cobra plata real.

#### Qué NO funciona todavía

- **iOS app**: en desarrollo, viene en las próximas semanas (Capacitor build ya armado, falta TestFlight).
- **Real-time collab** entre viajeros del mismo grupo: planeado, no entregado.
- **Marketplace de itinerarios**: mes 2.
- **Imágenes y PDFs por WhatsApp**: solo procesamos texto por ahora. Si reenviás un PDF de boarding pass, el sistema lo guarda pero no extrae info.
- **Pagos en producción**: Stripe está en test mode hasta verificación de cuenta Argentina (24-48h, proceso aparte).

#### Cómo dar feedback

Mandame por DM o al mail (`matiasfaustomoron@gmail.com`):

- "esto está roto: X" — bug report
- "esto me confundió: Y" — UX confusion
- "esto me haría volver mañana: Z" — feature pull
- "esto está bueno: W" — confirmación de hipótesis (también sirve)

Cuanto más específico, mejor. Capturas de pantalla bienvenidas. Si encontrás un bug crítico, mandame igual aunque sea las 3am.

Gracias por estar acá temprano.

---

## C. Checklist del founder antes de mandar el invite

No le mandes el link a nadie hasta que todo esto esté tildado.

- [ ] Vercel deploy funciona en `https://<vercel>.app` (smoke test sección 8 del runbook pasó)
- [ ] Magic link emails llegan al inbox (probaste con tu propio email)
- [ ] Stripe en **test mode** — confirmado en el toggle del dashboard
- [ ] Twilio sandbox configurado, palabra-código `join <X>` lista para repartir
- [ ] Webhook Twilio inbound apunta a la URL real de Vercel (no a un placeholder)
- [ ] Webhook Stripe apunta a la URL real de Vercel
- [ ] Turnstile site key configurada para el hostname del deploy
- [ ] Sentry recibe events (probaste tirando un error a propósito en algún flow)
- [ ] Conozco los 5 testers personalmente (no random people de Twitter — eso es para el launch público)
- [ ] Tengo canal de feedback fijo (grupo WhatsApp dedicado, o DM 1-a-1 ordenado)
- [ ] Estoy listo para responder bugs en <24h durante la primera semana — bloqueé tiempo en la agenda
- [ ] Backup mental: si algo se prende fuego, sé cómo hacer rollback (sección 9 del runbook)

Cuando todo esté tildado, mandá el mensaje de la sección A a los 5. De a uno, no en grupo — la primera semana es 1-a-1.
