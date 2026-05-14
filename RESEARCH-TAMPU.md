# Tampu — Investigación de mercado y auditoría profunda

**Loop activo** · 20 min de intervalo · 15 ejes · 5 hs reales
**Progreso**: 3/15 completados
**Iniciado**: 2026-05-12

---

## Ejes de investigación

### Competidores directos (planificadores y trip aggregators)
- [x] **AXIS 1**: TripIt (deep dive) — features actuales, pricing 2026, reviews críticas App Store, churn reasons, qué hacen bien, qué les falta
- [x] **AXIS 2**: Wanderlog (deep dive) — modelo gratuito + premium, colaboración multi-user, ranking en App Store, lo que se quejan los users
- [x] **AXIS 3**: Tripsy + Polarsteps — UX patterns, foto-journey, suscripción, retención
- [ ] **AXIS 4**: Hopper + Flighty — algoritmos diferenciadores (price prediction, delay prediction), modelo de negocio
- [ ] **AXIS 5**: Booking.com / Skyscanner / Kayak — patrones mobile, fees ocultos, lo que la gente odia

### Plataformas adyacentes
- [ ] **AXIS 6**: Apple Wallet para viajes — .pkpass spec, qué aerolíneas lo soportan, cómo integran, costos
- [ ] **AXIS 7**: Programas de afiliados travel — Booking Partner, Assistcard, Airalo, Wise, Heymondo, IATI, Skyscanner: rates específicos 2026, cookie windows, requisitos, payouts, mínimos

### Tendencias y movimientos
- [ ] **AXIS 8**: Movimiento "transparent affiliate" — Wirecutter, Beli, Consumer Reports, NerdWallet: cómo declaran fees, conversion impact, casos de éxito
- [ ] **AXIS 9**: r/travel + r/solotravel pain points 2024-2026 — top 30 threads sobre apps de viaje, qué piden los viajeros que no existe

### Mercado y benchmarks
- [ ] **AXIS 10**: App Store top 100 travel — análisis de qué tienen en común, pricing tiers, frecuencia de update, categorías de feature, reviews promedio
- [ ] **AXIS 11**: iOS App Store submission 2026 — requisitos para una PWA-wrapped Capacitor app, costos Apple Developer, tiempos de review, common rejections para travel apps

### Restricciones técnicas
- [ ] **AXIS 12**: PWA limitations en iOS Safari 2026 — qué funciona y qué no (push, geolocation, storage limits, file access, biometrics, Wallet add)

### Branding e identidad
- [ ] **AXIS 13**: Quechua brand precedents — empresas que usaron palabras quechuas/aymaras como brand, recepción del mercado, riesgos de cultural appropriation, casos exitosos vs fallidos
- [ ] **AXIS 14**: Premium Latam brand identity — sistemas visuales de marcas hospitality/travel latinoamericanas que funcionaron (Faena, Tierra Hotels, &Beyond, etc.), tipografías y paletas, lessons

### Síntesis final
- [ ] **AXIS 15**: SÍNTESIS — Top 3 cosas que Tampu DEBE hacer · Top 3 cosas para skipear · Top 3 ángulos únicos · Riesgos top 5 · Roadmap 90 días concreto

---

## Resultados

*(Cada burst del loop agrega su sección abajo en el orden de los axes.)*

---

## AXIS 1 — TripIt deep dive

**Método**: 4 sub-agentes paralelos investigando en simultáneo (features/pricing 2026, App Store reviews críticas, posición de mercado, killer-feature email auto-import). Triangulación entre help center oficial, Trustpilot, Reddit, blogs técnicos de la industria, prensa M&A, y documentación de competidores que replican la feature.

### Fuentes citadas (verificadas)

- https://help.tripit.com/en/support/solutions/articles/103000063275-adding-travel-plans-to-tripit (help center)
- https://help.tripit.com/en/support/solutions/articles/103000127241-vendor-confirmation-email-support
- https://help.tripit.com/en/support/solutions/articles/103000243036-supported-booking-sites
- https://help.tripit.com/en/support/solutions/articles/103000063327-problem-with-your-tripit-submission
- https://help.tripit.com/en/support/solutions/articles/103000063336-authorizing-inbox-sync
- https://help.tripit.com/en/support/solutions/articles/103000063317-inbox-sync-security
- https://help.tripit.com/en/support/solutions/articles/103000063289-inbox-sync-supported-providers
- https://www.tripit.com/uhp/privacyPolicy (TripIt Privacy Statement)
- https://www.concur.com/about/processor-privacy-statement (SAP Concur Processor Privacy)
- https://techcrunch.com/2011/01/13/concur-acquires-tripit/ (M&A primary source, $82M-$120M)
- https://venturebeat.com/business/tripit-concur-acquisition
- https://www.tripit.com/web/blog/business-travel/tripit-pro-concur-triplink (free-via-employer channel)
- https://www.tripit.com/web/blog/news-culture/automate-your-tripit-itineraries-inbox-sync
- https://www.tripit.com/web/blog/news-culture/automate-travel-plans-tripit-pro-apple-intelligence (Apple Intelligence integration 2024+)
- https://funneltravel.wordpress.com/2019/01/22/parsing-travel-e-mails/ (análisis técnico independiente del parser)
- https://www.quora.com/How-does-Tripit-parse-emails
- https://techcrunch.com/2010/08/10/with-new-auto-import-itinerary-feature-for-gmail-tripit-just-got-easier-to-use/
- https://developers.google.com/workspace/gmail/markup/reference/flight-reservation (Gmail schema.org JSON-LD)
- https://schema.org/FlightReservation
- https://wanderlog.com/blog/2024/11/26/wanderlog-vs-tripit/
- https://www.aitooldiscovery.com/guides/wanderlog-reddit (Reddit review aggregado 2026)
- https://tripsy.help/article/45-forwarding-emails-to-tripsy
- https://tripsy.blog/tripsy-automation-forward-your-reservations-emails-to-tripsy/ (520 providers, 10k templates, 42 idiomas)
- https://awardwallet.com/supportedEmail (cubre LATAM, Aerolineas, Avianca, Gol, Azul, Copa, Despegar)
- https://awardwallet.com/email-parsing-api
- https://airparser.com/email-parser/ (LLM-powered alternativa moderna)
- https://parseur.com/extract-data/flight-booking
- https://github.com/JohannesBuchner/flight-reservation-emails (open source EN/ES/DE)
- https://skift.com/2017/01/26/worldmate-itinerary-management-tripcase-tripit/ (historia del mercado)
- https://www.trustpilot.com/review/www.tripit.com (1.7/5 actual)
- https://www.going.com/guides/tripit-review (2026 review)
- https://www.usecarly.com/blog/tripit-alternative/ (2026 guide)
- https://support.apple.com/en-us/123179 (Apple Wallet boarding pass auto-detect — el sustituto nativo de TripIt)
- https://www.concur.com/en-us/business-intelligence
- https://www.concur.com/consultative-intelligence (productos B2B que monetizan datos agregados)
- https://en.wikipedia.org/wiki/Despegar (Decolar — líder LatAm que TripIt no cubre)

### Hallazgos clave (con números)

1. **Pricing 2026**: TripIt es freemium. **Free**: itinerario consolidado, vista calendario, share con familiares. **Pro: USD 49/año** (~USD 4.08/mes equivalente, no hay plan mensual standalone). **Pro for Teams: USD 29/usuario/año** mínimo 10 asientos. Sin tier intermedio. (Trustpilot reviews mencionan reiteradamente "auto-renewal sticker shock" — la app renueva silenciosamente y muchos usuarios reportan haberse enterado al revisar el statement.)
2. **Base instalada**: ~22M usuarios registrados acumulados desde 2006 (cifra de la propia compañía, no MAU). El número de Pro activos no es público — estimaciones cruzadas con LinkedIn (27 empleados, equipo de mantenimiento, sin product hires recientes) sugieren que el producto está en modo cosecha, no crecimiento.
3. **Killer feature original**: forwardear cualquier confirmación a `plans@tripit.com` → la app la parsea y la incrusta en el itinerario. Funciona desde 2007. El plan B (Inbox Sync) escanea Gmail/Workspace/M365/Outlook/Yahoo automáticamente cada pocas horas — disponible **gratis** desde 2010 (no es solo de Pro).
4. **Mecánica del parser (importante para Tampu)**: NO es ML. Es un motor de **regex + templates por vendor + parsing de JSON-LD `schema.org`** que las aerolíneas grandes ya emiten para integrarse con Gmail. TripIt mantiene un portal B2B donde aerolíneas/hoteles registran sus templates. Esto es un **maintenance treadmill brutal** — cada vez que una aerolínea cambia el HTML del email, el parser se rompe hasta que un humano escribe un nuevo template. Trustpilot recoge quejas literales: "el parser dejó de funcionar el último verano de 2024", "mezcla fechas y vuelos".
5. **Cobertura de idiomas oficial**: EN / FR / DE / JA / ES. **Portugués NO está soportado** — confirmado por TripIt y por reviewers terceros. Esto saca a Brasil del juego (Gol, Azul, LATAM-BR, Decolar emiten en pt-BR).
6. **Cobertura LatAm = vacío total**: ninguna aerolínea latinoamericana aparece en la lista pública de vendors soportados (revisé la página `supported-booking-sites`). No están LATAM, Aerolineas Argentinas, Avianca, Gol, Azul, Copa, Viva, JetSmart, Sky, Despegar/Decolar, Almundo. AwardWallet (competidor de nicho miles/points) sí los tiene: **LATAM 131 templates, Aerolineas 80, Avianca 79, Gol 75, Copa 57, Azul 41**. Esto prueba que el problema es solucionable y que TripIt simplemente no priorizó la región.
7. **Las 9 razones documentadas de falla del parser** (del propio help center): (1) vendor cambió el formato, (2) idioma no soportado, (3) no es el email original (copy-paste o screenshot), (4) vendor chico, (5) tipo de plan no soportado (seguro, calendar invite), (6) email tiene varios attachments (solo lee el primero), (7) confirmación requiere login en el sitio para ver el detalle, (8) HTML mangleado por el cliente de email, (9) más de 60 ítems en un solo email.
8. **Quality rating**: Trustpilot **1.7/5**. App Store iOS mantiene rating decente (~4.3) porque incluye millones de reviews históricas, pero las reviews recientes (2024–2026) son demoledoras: parser roto, UI sin actualizar, soporte que no responde, auto-renewal sin aviso. La UI fue actualizada por última vez con un refresh menor en 2023.
9. **Inbox Sync**: lee solo la **bandeja primaria**, no labels/folders. Primer scan abarca **últimos 7 días** y luego es continuo (hasta 24h de delay). OAuth estándar, sin password. **Bloqueado por Google Advanced Protection Program** y por configuraciones de admin en Microsoft 365 — segmento corporativo se cae.
10. **Costo de compliance escondido**: cualquier app que lea Gmail con scope `gmail.readonly` cae en Google "Restricted Scope" y debe pasar **CASA Tier 2 annual assessment** (~USD 15k–75k inicial + USD 10k–30k/año). Este es el verdadero foso del producto, no la tecnología. Es la barrera real contra entrantes.
11. **Privacy concern serio**: TripIt es propiedad de **SAP** desde 2014 (Concur compró TripIt en 2011 por USD 82M–120M, SAP compró Concur en 2014). La privacy policy permite explícitamente crear "anonymized or de-identified aggregated data sets" para mejorar productos. SAP vende productos B2B (`Concur Consultative Intelligence`, `Business Intelligence`) que monetizan datos agregados de viajes corporativos. Cuando un usuario TripIt es además empleado Concur, los trip data se filtran al empleador por default vía TripLink.
12. **Distribución corporativa**: muchos Pro users tienen Pro **gratis** porque su empleador usa Concur TripLink. Esto distorsiona toda métrica pública — el ARPU real consumer es desconocido pero claramente bajo (sería material para inversores si fuera alto, SAP no lo reporta).
13. **Movimiento estratégico 2024–2025**: TripIt promociona la **integración con Apple Intelligence** en iOS 18+ para mostrar resúmenes on-device de viajes. Es un movimiento defensivo — Apple Wallet + Mail ya detecta automáticamente boarding passes y reservas (vía schema.org), reduciendo la razón para abrir TripIt. Google hizo lo mismo en Gmail desde 2013 (cards de viaje nativas). El "core moat" de TripIt está siendo erosionado por los OS.
14. **Competidores que copian el killer feature** (matriz comparativa real):
    - **Wanderlog**: forwarding con address por trip (incómodo), Inbox Sync **solo en Pro**, cubre solo vuelos+hoteles, mayormente EN — más débil que TripIt en parsing pero más fuerte en planificación visual/colaborativa.
    - **Tripsy** (indie, iOS-only): forwarding con address por usuario, **NO hace inbox sync por privacidad como pitch**, **520 providers, 10.000+ templates, 42 idiomas** (incluido portugués). Es la **amenaza más cercana al modelo Tampu** — privacy-first + multi-idioma. Su debilidad es ser solo iOS y ser un indie shop con bandwidth limitado.
    - **AwardWallet**: nicho de miles/points, cobertura LatAm completa, API pública que terceros pueden licenciar.
    - **Google Travel / Gmail nativo**: lee cualquier email con JSON-LD. Excelente para senders modernos, ciego para el resto. No tiene producto standalone después de cerrar Google Trips.
    - **Apple Wallet + Mail**: detecta boarding passes y .pkpass automáticamente, sugiere acciones via Siri. Complementario, no un planner standalone.

### Qué nailan los competidores (lo que TripIt sigue haciendo bien)

- **Una sola address para todos los usuarios** (`plans@tripit.com`). Memorizable. Friction cero — no hay que setear nada por viaje. Compará con Wanderlog que usa `trips+153334@wanderlog.com` por viaje, lo cual rompe el flujo.
- **El producto en sí está dimensionado correctamente**: la app no intenta ser planner+booking+social network. Hace una cosa bien (consolidar itinerarios). Es un "single-job product" disciplinado — algo raro en travel.
- **Integración silenciosa con Apple Wallet** desde hace años: si TripIt detecta un boarding pass, te ofrece bajarlo al wallet de iOS con un tap. Esto baja el "abandono cognitivo" del usuario (no necesita la app en el día del vuelo).
- **TripIt Pro tiene 3-4 features de Pro que sí mueven la aguja**: alertas de cambio de gate, refund finder (te avisa si el precio bajó y tenés derecho a credit), seat tracker (avisa cuando se libera un asiento), interactive airport maps. No son revolucionarias pero son útiles.
- **15 años de marca**: cuando un viajero veterano necesita "una app para itinerarios", piensa TripIt primero. Brand recall por antigüedad es real aunque la calidad haya bajado.

### Qué les falta / dónde fallan (oportunidades para Tampu)

- **No hablan portugués**. Brasil queda fuera de raíz. Esto es una decisión deliberada — agregar pt-BR requeriría reescribir el parser y hacer QA continuo. SAP no lo va a invertir.
- **No cubren ningún vendor latinoamericano**. Esto incluye OTAs locales (Despegar/Decolar es la #1 de la región y emite confirmaciones en formato único), aerolíneas regionales, hoteles boutique, agencias de turismo argentinas/chilenas/peruanas. Es un agujero estructural.
- **Maintenance treadmill que pierde velocidad**: con un equipo de 27 personas en modo cosecha, no hay bandwidth para mantener templates al ritmo que las aerolíneas cambian sus emails. La calidad del parser está degradándose públicamente (Trustpilot 1.7).
- **UX visualmente obsoleta**: la última actualización mayor de UI fue 2023. La generación que viaja desde el móvil compara con apps fluidas (Hopper, Wanderlog) y TripIt se siente como un producto de 2015.
- **Privacy posture vulnerable**: ser parte de SAP es un liability narrativo. Inbox Sync requiere dar acceso a Gmail completo. La cláusula de aggregated data es contractualmente real. Cualquier competidor con un pitch privacy-first (Tripsy lo hace) corta narrativamente con TripIt.
- **Cero presencia en WhatsApp**: en LatAm el canal donde el viajero recibe la confirmación a menudo NO es email, es WhatsApp (agencia local, host de Airbnb, conductor de transfer). Nadie está parseando esto. Es un blue ocean.
- **Auto-renewal silencioso**: una porción no despreciable de las críticas Trustpilot 2024–2026 son de usuarios que descubrieron el cobro post-facto. Daño marcario continuo.
- **Soporte unreachable**: tickets sin respuesta es queja recurrente. Es una señal de equipo en modo defensivo.
- **No tienen modo offline real**: la app necesita conectividad para cargar la mayoría de las vistas. Para un viajero en zona remota es un punto de falla.
- **No hay precio mensual**: USD 49/año sin opción mensual es una barrera para el viajero ocasional. Pierde adopción de "primer viaje del año".
- **Apple Wallet + Gmail está comoditizando el core**: los OS hacen casi todo lo que TripIt hace, gratis, sin instalar nada. Para senders modernos con JSON-LD ya no se necesita TripIt.

### Implicaciones para Tampu (acciones concretas)

1. **Construir parser email LLM-native, no template-based**. Pipeline: (a) JSON-LD `schema.org` extractor primero (gratis, instantáneo, ~60% de aerolíneas grandes lo emiten), (b) regex de fallback para 20–30 vendors LatAm clave, (c) Claude Haiku 4.5 / GPT-4o-mini / Gemini Flash como tercer nivel con structured-output. Costo: ~USD 0.002 por email parseado. Esto **destruye el maintenance treadmill** que está hundiendo a TripIt y permite cubrir cualquier idioma, incluido portugués, español argentino con voseo, y emails que mezclen idiomas. **Stack alineado con el LLM que el usuario ya integró (Anthropic) — sin nueva infra**.
2. **Beachhead explícito: LatAm carriers + Despegar/Decolar + WhatsApp**. Comprar/scrapear un corpus seed de 500 confirmaciones reales de LATAM, Aerolineas, Gol, Azul, Avianca, Copa, JetSmart, Sky, Despegar, Almundo, Atrápalo en español argentino, chileno, peruano, mexicano, y portugués brasileño. Usarlos como **evals**, no como templates. Tunear el prompt LLM contra estas evals. Trabajo: 1 dev × 4–6 semanas. Esto es el moat regional que TripIt no va a construir.
3. **Habilitar ingestión por WhatsApp**, no solo email. Un número Tampu (vía WhatsApp Business API o Twilio) al que reenviás un mensaje y se parsea igual que un email. Esto es **único en el mercado** y resuelve el caso donde el host de Airbnb o el conductor del transfer mandan la confirmación por WhatsApp. Costo de Twilio: ~USD 0.005/msg inbound. Probable golpe de gracia diferenciador en LatAm.
4. **Privacy positioning quirúrgico**: "tus datos viven en tu dispositivo, no vendemos nada agregado, no escaneamos tu inbox". Mensaje literal contra SAP/Concur. Hacer del **opt-in granular** un valor narrativo: el usuario decide qué emails forwardear, no le damos OAuth Gmail por default. Tampu como **anti-TripIt en privacidad**.
5. **No copiar el modelo de suscripción anual silenciosa**. Si Tampu llegara a tener tier paga (no es el modelo actual), tiene que ser monthly o lifetime con renovación explícita. Aprovechar el daño marcario de TripIt como diferenciador.
6. **Skip OAuth Gmail al menos en el MVP**. El costo de CASA Tier 2 (USD 15k–75k inicial + recurrente) no se justifica antes de tener product-market fit. Apostar 100% a **forwarding manual** + WhatsApp como ingesta. Esto también refuerza la narrativa privacy.

### Notas del investigador

El insight estructural más importante de esta investigación no es sobre TripIt sino sobre **la oportunidad que abre el cambio tecnológico de 2024–2026**: el parser de TripIt es un activo construido con tecnología de 2010 (regex + templates + corpus humano), y está siendo comoditizado simultáneamente por (a) JSON-LD schema.org que cualquiera puede leer, (b) LLMs que parsean cualquier formato sin templates, y (c) los OS (Apple Wallet, Gmail cards). En 2026 un equipo de 2–3 personas puede construir un parser superior al de TripIt en 8 semanas usando Claude o Gemini, en cualquier idioma, sin maintenance treadmill. La asimetría está en el go-to-market: TripIt tiene 15 años de brand recall en US/EU, Tampu tiene que ganarse el suyo en LatAm donde TripIt es **inutilizable** (no habla portugués, no cubre carriers regionales, no parsea Despegar). El moat para Tampu se construye sobre tres pilares específicos: **(1) cobertura LatAm + portugués, (2) ingestión WhatsApp, (3) postura privacy explícita**. Ningún otro competidor (incluyendo Tripsy, que es la amenaza más cercana) cubre los tres juntos.

### Suplemento — features + pricing 2026 (sub-agente #4)

Fuentes adicionales verificadas en este sub-research:
- https://www.tripit.com/web/pro/pricing
- https://help.tripit.com/en/support/solutions/articles/103000063396-tripit-or-tripit-pro-
- https://help.tripit.com/en/support/solutions/articles/103000063409-tripit-app-and-system-requirements
- https://apps.apple.com/us/app/tripit/id311035142
- https://help.tripit.com/en/support/solutions/articles/103000063388-inner-circle-automatic-trip-share-
- https://help.tripit.com/en/support/solutions/articles/103000063380-fare-tracker
- https://help.tripit.com/en/support/solutions/articles/103000063390-point-tracker-current-programs
- https://news.sap.com/2026/03/sap-concur-fusion-2026-ai-capabilities-integrated-travel-expense-enhancements-global-partnerships/
- https://theguycornernyc.com/2026/03/18/sap-concur-ai-new-travel-expense-updates-for-tripit-pro/
- https://flighty.com/compare/tripit
- https://nomad-labs.com/flighty-vs-tripit-vs-app-in-the-air/
- https://www.pilotplans.com/blog/review-of-tripit
- https://theplanetd.com/benefits-of-tripit-pro-that-you-did-not-know/

**Pricing fino 2026** (mejora sobre lo que se asumió antes):
- **TripIt Free**: USD 0.
- **TripIt Pro**: **USD 48.99/año** (Apple App Store, verificado mayo 2026). Sin opción mensual.
- **Pro for Teams**: USD 29/usuario/año, mínimo 10 asientos.
- **Free trial Pro**: **30 días**.
- **Family plan**: **No existe**. Solo cuentas individuales. Sharing vía Inner Circle (cualquiera puede ser invitado sin necesitar Pro).
- **Regional pricing**: **No hay**. USD global. Sin tier LatAm específico.
- **Refund**: complaints recurrentes en Trustpilot sobre auto-renovación silenciosa sin warning.

**Caps de cuotas free vs Pro**:
- **Free**: 3 documentos/trip.
- **Pro**: 25 documentos/trip (con PIN 4 dígitos opcional).
- Power-users (nomads, journalists) reportan 25 docs como restrictivo.

**Features Pro reales (no slogans) y sus límites concretos**:
1. **Real-time flight alerts** — son **reactivas**, llegan después de que la aerolínea acknowledgea el incident. NO hay tracking del aircraft inbound, NO hay predicción de delays (Flighty los supera técnicamente).
2. **Fare/Refund Tracker** — **US-only**, solo 7 aerolíneas (Alaska, American, Delta, Frontier, Hawaiian, JetBlue, United), economía no-refundable, ventana de 100 días pre-departure, requiere que el usuario llame a la aerolínea (TripIt no auto-claima). Inútil para LatAm.
3. **Seat Tracker** — monitorea seat map y avisa cuando se libera exit row / bulkhead / upgrade.
4. **Alternate Flight Finder** — para cancelaciones, muestra opciones.
5. **Point/Mile Tracker** — **150 programas de rewards** (vs AwardWallet con 600+). Cubre miles, hoteles, dining, parking, tarjetas. Auto-import vía `points@tripit.com` solo para AA / Delta / Southwest / United.
6. **LoungeBuddy integration** (AmEx la compró 2018) — solo info, NO da acceso a lounges.
7. **Inner Circle**: auto-share con N personas, dos permission levels (View / Edit), unlimited members, invitees no necesitan Pro. **Pero**: one-directional (cada uno tiene que agregarte por separado), **flight notifications NO se comparten** (solo el texto del itinerario), **no hay edición colaborativa en vivo** (Wanderlog y Pilot la tienen).
8. **Risk Alerts**: en 2026 SAP las expandió de solo vuelos a **lodging + car + rail + activities** — único movimiento notorio del producto en 18 meses.
9. **Interactive airport maps** para **103 aeropuertos** — wayfinding, lounges, restaurantes.
10. **Neighborhood safety scores**.
11. **Country info** (embajadas, exchange rates, tipping, plug types).
12. **EU261 compensation eligibility checks**.
13. **Carbon footprint tracking + offset purchase**.
14. **Travel stats dashboard**, **passport renewal reminders** basado en issue date.
15. **Image-to-Plan con Apple Intelligence** (marzo 2026) — **iOS-only**, on-device. Foto/PDF → plan extraído. Es la primera feature LLM-native de TripIt y es defensiva, no ofensiva.

**Plataformas soportadas (versiones mínimas)**:
- iOS 17.3+, iPad incluido.
- watchOS 9.0+ con complications.
- macOS 13.3+ Apple Silicon (M1+) — es la app iPad corriendo en Mac, no nativa.
- visionOS 1.1+ — Apple Vision Pro soportado.
- Android 10+.
- Wear OS: **no listado oficialmente**, soporte efectivamente nulo.
- Web: tripit.com funciona en cualquier navegador moderno.

**Cadencia de release (señal de equipo)**:
- App version **20.5.0** publicada **27 de abril de 2025**.
- En mayo 2026 = **más de 12 meses sin release significativo**. Esta es la señal pública más clara de equipo en cosecha, no en build.

**Strategic posture 2026 (CONFIRMADO)**: SAP Concur Fusion 2026 (marzo 2026) anunció los **Joule AI agents** (Expense Automation Agent, Pre-Submit Audit Agent). El anuncio aclara explícitamente: "**TripIt Pro itself isn't being replaced**" — Pro solo se beneficia indirectamente del data flow más limpio. **TripIt está siendo posicionado como compañero corporativo del SAP Concur stack, no como producto consumer de leisure**. La ruta del roadmap está fijada por la agenda enterprise-expense de SAP, no por el viajero consumer.

**Implicaciones adicionales para Tampu (resumen de este sub-research)**:
- **Anchor de pricing**: USD 49/año es la marca del mercado para "Pro travel companion". La opción mensual (USD 4.99–6.99/mes) es un hueco abierto que ningún serio competidor ocupa. Tampu **no necesita cobrar** (modelo affiliate honesto), pero si el día de mañana se introdujera un tier paga, la cadencia mensual es la jugada diferencial.
- **Equipo enterprise = ventana abierta**: SAP no va a invertir consumer en TripIt en 24 meses (mínimo). La ventana competitiva es real.
- **No competir en breadth de vendors (1000s con 15 años de templates)**: usar **LLM multimodal** (Claude / GPT-4o / Gemini Flash) iguala o supera la extracción sin maintenance treadmill. TripIt mismo recién agregó esto en marzo 2026 y solo en iOS via Apple Intelligence — Tampu puede correrlo en cualquier plataforma, en cualquier idioma, desde día uno.
- **Inner Circle es débil**: no hay co-edición real-time ni notificaciones compartidas. Con **Supabase Realtime** (que el stack Tampu ya tiene preparado) se puede construir un itinerario CRDT con presencia y cursores en pocas semanas. Defensible diferenciador para grupos / parejas / familias.
- **Fare Tracker es un agujero global gigante**: 7 aerolíneas y solo US. Un fare tracker que cubra LatAm + Europa con LLM-driven scanning de OTAs (no requiere API oficial de la aerolínea) es un greenfield.
- **Sin family plan**: en LatAm el viaje familiar es la norma. Un **shared trip plan que permita 4–6 miembros sin friction** captura una experiencia que TripIt simplemente no ofrece.

---

## AXIS 2 — Wanderlog deep dive

**Método**: 4 sub-agentes paralelos investigando en simultáneo (features/pricing 2026, App Store + Google Play + Reddit reviews críticas, colaboración multi-user UX/técnica, posicionamiento de mercado + métricas + cobertura LatAm). Triangulación entre help center oficial, App Store, Google Play, Reddit (r/travel, r/solotravel, r/digitalnomad), Rick Steves Forum, Product Hunt, Trustpilot, blogs de comparativas 2024–2026, Crunchbase, YC, Tracxn, GetLatka, SimilarWeb, PhocusWire, TechCrunch, y job posts oficiales (que revelan stack técnico).

### Fuentes citadas (verificadas, acceso 2026-05-13)

**Oficiales Wanderlog**:
- https://wanderlog.com/pro (parcial — solo nav scraping)
- https://wanderlog.com/pricing
- https://wanderlog.com/features
- https://wanderlog.com/trip-plan-assistant/
- https://wanderlog.com/blog/faq/
- https://wanderlog.com/travel-budget-expense-splitting-app
- https://wanderlog.com/blog/jobs/full-stack-engineer/
- https://wanderlog.com/es/plan-a-trip (UI español parcial)
- https://help.wanderlog.com/hc/en-us/articles/4625495771163-Add-friends-to-plan-together
- https://help.wanderlog.com/hc/en-us/articles/13303034352667 (How does Wanderlog make money)
- https://help.wanderlog.com/hc/en-us/articles/13303044510875 (Language availability — "English only")
- https://help.wanderlog.com/hc/en-us/articles/13301772286491-Travel-time-estimates-not-accurate-or-not-available
- https://help.wanderlog.com/hc/en-us/articles/13545300431259-Download-guides-for-offline-reading
- https://help.wanderlog.com/hc/en-us/articles/4625693334811
- https://help.wanderlog.com/hc/en-us/sections/5154400242843--Manage-costs

**Stores y agregadores**:
- https://apps.apple.com/us/app/wanderlog-travel-planner/id1476732439
- https://play.google.com/store/apps/details?id=com.wanderlog.android
- https://wanderlog-trip-planner-app.en.softonic.com/android
- https://justuseapp.com/en/app/1476732439/wanderlog-travel-planner/problems
- https://www.appbrain.com/app/wanderlog-trip-planner-app/com.wanderlog.android

**Reviews terceros 2024–2026**:
- https://monkeyeatingmango.com/blog/wanderlog-pricing-2026/
- https://monkeyeatingmango.com/blog/wanderlog-alternatives-2026/
- https://www.wandrly.app/reviews/wanderlog
- https://www.wandrly.app/comparisons/wanderlog-vs-tripsy
- https://goosed.ie/reviews/wanderlog-review-is-premium-worth-it/
- https://aitravel.tools/wanderlog-review/
- https://www.aitooldiscovery.com/guides/wanderlog-reddit (Reddit aggregado)
- https://www.weplanify.com/en/alternatives/best-group-trip-planner-apps
- https://www.demflyers.com/2019/08/05/best-trip-planning-site-travelchime/
- https://www.producthunt.com/products/wanderlog/reviews
- https://www.trustpilot.com/review/wanderlog.com
- https://community.ricksteves.com/travel-forum/general-europe/trial-of-wanderlog-and-tripit-inspired-by-trip-research-post

**Métricas y empresa**:
- https://www.ycombinator.com/companies/wanderlog (YC W19)
- https://www.ycombinator.com/companies/wanderlog/jobs/cfZ4def-full-stack-software-engineer-2-years-experience-united-states
- https://www.crunchbase.com/organization/travelchime
- https://tracxn.com/d/companies/wanderlog
- https://getlatka.com/companies/wanderlog.com
- https://www.similarweb.com/website/wanderlog.com/
- https://marlvel.ai/intel-report/travel/wanderlog-travel-planner
- https://techcrunch.com/2021/09/01/general-catalyst-abstract-back-wanderlogs-1-5m-round-for-collaborative-travel/
- https://www.phocuswire.com/Wanderlog-1-5M-seed-funding
- https://canvasbusinessmodel.com/blogs/how-it-works/wanderlog-how-it-works
- https://www.apfdigital.com.ar/noticias/2026/05/11/455292 (gobierno argentino lanza AI travel planner propio, mayo 2026 — competidor estatal latente)

**Limitación**: App Store individual review pages, Trustpilot directo, y Crunchbase tras paywall devolvieron 403; se citó vía agregadores que las extrajeron.

### Hallazgos clave (con números)

1. **Pricing fragmentado y dynamic**: En App Store iOS (mayo 2026, app version 2.200) el precio mensual es **USD 5.99/mes**, anual entre **USD 31.99 y USD 59.99** según región. Fuentes secundarias documentan **USD 49.99/año** como precio histórico 2024–2025 y reportes 2026 mencionan subas a **USD 79.99/año** (no verificado contra App Store oficial — posible A/B test o pricing por país). **No existe lifetime, family plan, ni regional pricing AR/BR documentado**.
2. **Cuotas y free tier sorprendentemente generoso**: Free incluye **trips ilimitados, colaboradores ilimitados, route optimization, edición colaborativa real-time, community itineraries, presupuesto básico, AI Assistant con cap de 5 mensajes por viaje**. Pro desbloquea: offline maps, offline trip data, PDF export, Google Maps export, document/PDF attachments (storage "ilimitado"), dark mode, ad-free, AI ilimitado, flight price tracking. **La única cuota dura del free es los 5 mensajes de AI por viaje**.
3. **Trip Plan Assistant "Powered by ChatGPT"** (OpenAI API directa, no modelo propio, no fine-tuned). Genera Q&A + sugerencias de lugares que se inyectan al mapa con un click. **NO genera itinerarios completos from-scratch desde un prompt vacío** — confirmado por monkeyeatingmango: *"No AI itinerary generation — Wanderlog is a manual planner"*. Gap fundamental vs Layla / Mindtrip / Wonderplan.
4. **Plataformas**: iOS 15.1+, Android (versión mínima incierta — Softonic lista Android 15.0, sospechoso), Web (SPA). Sincronización con la misma cuenta cross-device. **macOS, watchOS, visionOS, Wear OS: no soportados oficialmente**.
5. **Cadencia de release ALTA — equipo en modo build, no cosecha**: 8 versiones iOS publicadas en ~10 semanas (de 2.192 el 2 mar 2026 → 2.200 el 8 may 2026). Feature reciente clave: **Trip Journal** (lanzada 2 mar 2026, iterada 7 versiones consecutivas). Esto es lo opuesto a TripIt (que pasó 12+ meses sin release significativo). **Indicador serio: Wanderlog está en growth phase, no en harvest**.
6. **Email parsing roto en mercados no-anglo**: dos paths — (a) forwarding manual a `trip+<ID>@wanderlog.com` (rompe la mnemónica simple de TripIt: una address por viaje, no una global), (b) OAuth Gmail scanning automático. **Solo parsea flight + hotel + rental car** — no transport ground, no tours, no insurance, no eSIM, no train, no bus. Quejas múltiples en reviews: "we couldn't parse this email" forzando entrada manual, falla con confirmaciones no-inglés, requiere dirección literal en email de Airbnb. **NO tiene integración WhatsApp** — confirmado por búsqueda explícita, cero resultados. **Ventana de oportunidad estructural para Tampu en LatAm**.
7. **Idiomas — gap declarado oficialmente**: el help center dice literal *"because we're a small team and over half of our users are still in the US, we haven't focused on adding languages"*. El App Store metadata lista inglés, francés, español, coreano, portugués, japonés, alemán, italiano, chino, pero la **UI completa no está localizada en ninguno excepto inglés**. UI español parcial existe en `wanderlog.com/es` pero el contenido es autogenerado vía AI con hallucinations documentadas (atracción listada como gratis cuando costaba €25, datos de 2023 desactualizados). **No hay español argentino (voseo) ni portugués brasileño nativos**.
8. **Empresa lean**: razón social **Travelchime Inc.** (dba Wanderlog), HQ San Francisco, fundada 2018. **YC W19**. Founders **Harry Yu (CEO) y Peter Xu**. Funding total **USD 1.65M** (seed USD 1.5M de General Catalyst + Abstract Ventures + USD 150K YC, septiembre 2021). **Headcount: 5–7 empleados** (Tracxn dice 7 a dic-24; YC y Latka dicen 5). **Revenue ~USD 1M ARR en 2024** (GetLatka). Estimado revenue mensual ~USD 100K. **Modelo extremadamente lean** — un equipo argentino de 4 personas puede igualarlos en headcount.
9. **Mix de revenue**: ~55% suscripciones Pro + ~45% affiliates. Affiliates confirmados: **Booking.com (hoteles) + Viator (tours)** + "rental providers". Bookings in-app crecieron **35% YoY en 2024**. **No declaran formalmente comisiones al usuario en la UI del booking flow** — gap competitivo claro para una postura "transparente con afiliados".
10. **Ratings y reputación split**: App Store iOS **~4.90/5 con ~31K ratings** (last update 29 abr 2026). Trustpilot wanderlog.com: **1-2 estrellas dominante** — reviews del sitio web (no app) con quejas serias de billing y privacy. Google Play: rating alto pero con caudal vocal de 1-stars sobre subscripción + bugs. **La disonancia entre store rating y Trustpilot indica problema de monetización/billing, no de producto core**.
11. **Top 10 quejas recurrentes 2024–2026**: (1) **offline solo en Pro** dealbreaker para nómadas, (2) **cobros sin consentimiento** — review noviembre 2025: la app *"charged a bank account without the user subscribing"*; otro: *"immediately imported credit card from Google wallet without permission"* durante el free trial, (3) **cancelación difícil**: *"would take a week"* y *"instructions had no results"*, (4) **app lenta con itinerarios grandes**: *"unusably slow as trips grow"*, (5) **crashes y white screens** al agregar destinos, (6) **travel time estimates inexactos** — Wanderlog admite oficialmente que está roto en Japón (Google APIs limitadas), (7) **email parser falla con confirmaciones no-inglés** y B&Bs pequeños, (8) **AI con datos desactualizados de 2023**, (9) **datos personales publicados sin consentimiento** — caso Trustpilot enero 2026: fotos y nombres aparecieron en sitio público de Wanderlog, removal ignorado tras *"long email exchanges"*, (10) **pérdida de datos / sync rota**: hotel reservations desaparecidas, soporte rebotando.
12. **¿Vale Pro la plata? Sentimiento crítico LEAN NEGATIVO**: Goosed.ie: *"I really struggle to see how I could justify the massive price tag"*. Producthunt: *"we have to pay [to export] when sharing is the main benefit promoted?!"* Quejas concretas: Google Maps export *"completely useless"* (sospecha que las locations expiran con la sub), Route Optimization *"manual optimization equally effective"*, AI Assistant *"no impresiona"*. Modelo solo-anual molesta — piden **mensual o lifetime**.
13. **Colaboración — la fortaleza #1, tipo Google Docs**: invite por **link compartible o email**, sin códigos numéricos. 3 modos visibilidad (Public / Friends / Private). **2 roles binarios**: *Can view* / *Can edit*. **Sin límite de colaboradores en ningún tier** (Free incluido). Real-time multi-cursor, cross-platform (web + iOS + Android). **Voting** mediante upvotes/thumbs sobre lugares ya agregados (no es voto formal A vs B). **Expense splitting nativo "who owes who"** integrado en el mismo viaje, multi-moneda, **sin necesidad de Splitwise externo**. Notes a nivel viaje y a nivel place (no threaded).
14. **Colaboración — debilidades estructurales**: (a) **sin chat ni comentarios threaded** (FAQ lo confirma explícitamente — único feature de comments son notes no threaded), (b) **sin polls A vs B** formal con deadline, (c) **notificaciones débiles** — no hay push *"Juan agregó X"* en tiempo real para colaboradores; las notifications documentadas son de bookings/precios/vuelos, no de actividad social del trip, (d) **sin offline-first real** — edición offline con merge en grupo NO está documentada, (e) **sin permission granular** (no commenter-only, no item-level ACL, no admin role formal, no transferencia de ownership), (f) bugs Android de sync — hotel reservations desapareciendo.
15. **Stack técnico (revelado por job postings)**: TypeScript end-to-end, **React + React Native**, **Node.js/Express**, **Redis + Elasticsearch**, **Python pipelines**, **Docker/Kubernetes**. **LLM pipeline propio** para parsear emails. **NO Firebase, NO Firestore, NO CRDTs documentados (sin Yjs/Automerge/OT papers públicos)**. Sync "tipo Google Docs" probablemente vía websockets contra Node con last-write-wins o OT custom — pero esto **no está confirmado**. Sin engineering blog técnico.
16. **Mercado y distribución**: downloads acumulados 3.3M–5M+ (rango entre AppBrain y MWM). Visitas web mensuales **7.3M en SimilarWeb (cayó -12.5% MoM en Q1 2026)** — primera señal de plateau. Ranking App Store: **#4 Grossing en Travel (US)**. SimilarWeb top-5 países: **US 41%, CA 6%, SG 6%, AU 6%, UK 5%** — **Argentina, México, Brasil NO aparecen en top-5**. **0% LatAm visible**.
17. **Press dead — ventana abierta**: Skift sin coverage material 2024–2026, TechCrunch última mención sustantiva sept 2021 (seed round), PhocusWire mención menor en maps article oct 2024. **Press silence sostenido = competidor sin amplificación mediática contra una propuesta nueva local LatAm**.
18. **Sin B2B/API/white-label**: no hay producto enterprise público confirmado, no API docs, no pricing enterprise, no case studies. *"Wanderlog for Business"* aparece en writeups secundarios pero es especulativo. Canal corporativo abierto para un competidor.
19. **Competidor estatal latente AR**: el gobierno argentino lanzó un AI travel planner propio en mayo 2026 (apfdigital). No es competencia de producto consumer todavía, pero indica que la **categoría "AI travel planner LatAm" está siendo nombrada por actores no-tech**, lo cual valida demanda y crea ruido de marca.

### Qué nailan los competidores (lo que Wanderlog hace bien)

- **Colaboración multi-user free e ilimitada**: es el verdadero killer feature. Invitar 20 personas a un viaje sin costo, con edición real-time multi-cursor, cross-platform — TripIt no lo tiene, Tripsy solo iOS, Pilot lo tiene pero más débil. Es la razón #1 por la que el público de viajes grupales lo elige.
- **Cadencia de release casi semanal** (8 versiones en 10 semanas en Q1 2026). Equipo de 5–7 personas con CI/CD maduro y trunk-based development que produce más velocidad que TripIt (27 personas, 12 meses sin release). Eficiencia operativa real.
- **Expense splitting nativo** "who owes who" en multi-moneda dentro del mismo viaje, sin Splitwise externo. Esto es importante para LatAm donde el viaje mezcla ARS/USD/BRL/CLP.
- **Trip Journal lanzado mar 2026** — Wanderlog cubrió rápido el espacio de journaling/foto-journey, anticipando el movimiento de Polarsteps.
- **Maps clustering** — el feature más alabado en r/travel ("the map is the whole point"). Visualmente es lo que hace que la app "se sienta" un planner, no un spreadsheet.
- **AI Assistant en el free tier** (con cap de 5 mensajes) — barrera de entrada baja para probar la IA, conversión hacia Pro razonable.
- **Free tier real, no fake**: trips ilimitados, colaboradores ilimitados, route optimization, parser de email — esto cierra la conversación con el viajero ocasional. El usuario pago es el power-user/nómada que necesita offline.
- **Brand recall en r/travel**: Wanderlog es la respuesta default en threads "free trip planning app" 2024–2026 (~5 menciones vs TripIt 4 en sample late-2024).

### Qué les falta / dónde fallan (oportunidades para Tampu)

- **Idiomas — gap declarado y estructural**: solo inglés UI real. ES y PT son metadata de store, no UI funcional. Con 5–7 empleados no van a invertir en localización profunda en 24 meses. **Esto es estratégico, no táctico**.
- **Cobertura LatAm cero**: SimilarWeb confirma 0% de tráfico desde AR/MX/BR. Contenido autogenerado con hallucinations sobre destinos LatAm. No partnerships locales (Despegar, Civitatis LatAm, Almundo, Atrápalo, agencias boutique).
- **Parser falla con vendors no-anglo y small B&Bs**: confirmaciones de Despegar, LATAM, Aerolíneas Argentinas, Gol, Azul, hoteles boutique argentinos en español casi seguro no parsean.
- **NO tiene WhatsApp**: cero. El canal donde el viajero LatAm recibe la mitad de las confirmaciones (host de Airbnb local, agencia, conductor de transfer) está completamente fuera del producto. **Blue ocean estructural**.
- **AI itinerary generation from-scratch ausente**: solo Q&A + sugerencias. Layla / Mindtrip / Wonderplan ya lo hacen. Wanderlog admitió implícitamente este gap. Con un LLM moderno + datos propios un competidor puede leapfrog acá.
- **Notificaciones de actividad social débiles**: no hay activity feed *"María cambió el vuelo, hace 2h"*. Sin push de cambios. Para un trip grupal de 5 personas esto es fricción importante.
- **Sin comentarios threaded item-level**: el feature #1 pedido en reviews de colaboración. Wanderlog tiene notes globales, no comentarios por flight/hotel/day.
- **Sin polls A vs B con deadline**: votar entre hotel Hyatt vs hotel Lotte con deadline jueves no existe. Sustituido por upvotes informales sobre items.
- **Offline tras paywall**: dealbreaker para nómadas y para LatAm donde la conectividad es irregular. Esta es la **queja #1 de reviews** y un anti-feature claro para usuarios viajando "in trip".
- **Solo pricing anual**: USD 49.99–79.99/año sin opción mensual. Tampu si fuera a cobrar (no es el modelo actual) podría diferenciarse con mensual ARS o lifetime.
- **Reputación de billing dañada**: cobros sin consentimiento, cancelación difícil. Daño marcario sostenido en Trustpilot. Cualquier competidor con billing transparente y cancelación 1-click pega narrativamente.
- **Sin offline-first con CRDT real**: edición offline con merge no documentada. Para viajeros LatAm con conectividad regular fuera de capitales esto es disfuncional. Con Yjs/Automerge un competidor puede liderar la categoría.
- **Sin Apple Wallet integration boarding-pass-aware** confirmada (a diferencia de TripIt que lo tiene desde hace años). Hueco menor pero acumulable.
- **Sin family plan / role formal de admin**: roles binarios view/edit. Para viajes familiares con menores, padres, abuelos esto no funciona bien.
- **Sin disclosure formal de afiliados** en UI: postura *"transparente con comisión visible"* (estilo Wirecutter) es defensible y diferencial.
- **Sin producto B2B**: agencias LatAm, operadores boutique, hoteles independientes sin canal API/white-label desde Wanderlog. Tampu puede abrir B2B como segundo motor.

### Implicaciones para Tampu (acciones concretas)

1. **Pivotar el spec de colaboración hacia "Wanderlog++": tres movimientos concretos**: (a) **comentarios threaded item-level** (place / flight / day / cost-item) con menciones, (b) **polls A vs B/C/D con deadline** y notificación al voter "te queda 1 día para votar Hotel Hyatt vs Lotte", (c) **activity feed/inbox** con push *"María agregó vuelo LATAM 800 a Día 3"*. Roles formales **Owner / Admin / Editor / Commenter / Viewer** con transferencia de ownership. Construir esto sobre **Supabase Realtime + Yjs CRDT** para que la edición offline con merge funcione bien — Wanderlog explícitamente no tiene esto. **Stack ya disponible en Tampu** (Supabase + Next.js).
2. **WhatsApp ingestion como diferenciador estructural #1**: Wanderlog tiene cero. Número Tampu vía WhatsApp Business API o Twilio donde el usuario reenvía cualquier mensaje (foto de boarding pass, voucher de host de Airbnb, recibo de excursión, mensaje del transfer driver) y se parsea con LLM + structured output. Costo Twilio ~USD 0.005/msg inbound. **Esta es la pieza que rompe con todo el mercado en LatAm, no solo Wanderlog**.
3. **LLM-native parser multi-vendor multi-idioma**, NO templates (combinar con AXIS 1): pipeline (a) JSON-LD schema.org extractor → (b) regex fallback para 20–30 vendors LatAm clave (Despegar, LATAM, Aerolíneas, Gol, Azul, Avianca, Copa, JetSmart, Almundo, Sky, Atrápalo) → (c) Claude Haiku 4.5 / GPT-4o-mini con structured output. Soporta ES-AR, ES-MX, PT-BR, EN, y cualquier idioma. Costo ~USD 0.002/email. **Soluciona simultáneamente el gap idiomático y el gap de vendors LatAm de Wanderlog, sin maintenance treadmill**.
4. **Free tier sin paywall en offline**: ofrecer offline maps + offline trip data + offline doc vault en free como mensaje diferencial. Esta es la queja #1 de Wanderlog y la conversión es alta porque el viajero LatAm conecta poco en ruta. Monetizar con affiliates honestos (Booking, Airalo, Heymondo, Wise) en lugar de paywall offline.
5. **Postura "afiliados transparentes" explícita**: badge UI "Tampu gana USD X si reservás acá" arriba de cada link partner, página /como-ganamos-plata pública con tabla de comisiones por partner. Diferenciador narrativo directo contra Wanderlog (que tiene affiliates pero no declara) y contra TripIt (que monetiza datos B2B SAP). Tampu como **Wirecutter del travel**.
6. **Expense splitting nativo en multi-moneda + ARS/USD/BRL/CLP**: copiar de Wanderlog el "who owes who" pero con conversion rates de Banco Nación / BCRA / casa de cambio paralela (Argentina tiene blue + MEP + oficial), Wise rate como default, y reconciliación con tarjeta de crédito argentina (cuotas, cuotas sin interés). Wanderlog no resuelve la complejidad real LatAm de monedas múltiples + tarjetas locales.

### Notas del investigador

El takeaway estratégico es que Wanderlog es un **producto bien construido pero estructuralmente vulnerable en tres ejes simultáneos**: idioma + LatAm + UX de colaboración. Es un equipo de 5–7 personas con USD 1.65M de funding total que está en growth phase técnico (cadencia semanal) pero en plateau geográfico (US 41% del tráfico, 0% LatAm). **Esto no es un competidor que pueda defender LatAm con dinero** — la guerra contra ellos no se gana con marketing pago, se gana con producto local mejor y un canal (WhatsApp) que ellos no tocan. La asimetría es perfecta: Wanderlog tiene 5M+ downloads y se va a defender en US/Europa, dejando LatAm vacante. La pregunta operativa para Tampu no es "podemos competir con Wanderlog" sino "qué partes del producto Wanderlog tenemos que igualar (colaboración core, maps, expense splitting) y qué partes podemos dejar fuera o hacer al revés (offline gratis vs paywall, WhatsApp vs solo email, ES-AR nativo vs ES superficial, afiliado declarado vs oculto)". El **Trip Journal** que Wanderlog lanzó marzo 2026 valida que la categoría está moviéndose hacia journaling/foto-journey — Tampu ya tiene Fotos como 5ª tab troncal (decisión correcta validada), pero debería ir un paso más allá con reviews por lugar (rating + price level $-$$$$) que Wanderlog no tiene formalmente. Hay también una **señal cultural importante**: que el gobierno argentino haya lanzado su propio AI travel planner en mayo 2026 muestra que la categoría "travel planner local LatAm" tiene aire de relevancia política — el mercado está nombrando la categoría, lo cual es bueno para el demand-side y permite que Tampu surfee la ola sin tener que crearla. El riesgo simétrico es que el gobierno o Despegar/Decolar lancen un planner gratis con escala instantánea: la respuesta no es competir en escala sino en privacy + curaduría + WhatsApp + transparencia de afiliados.

---

## AXIS 3 — Tripsy + Polarsteps deep dive

**Método**: 2 sub-agentes paralelos investigando en simultáneo cada producto con mínimo 8 WebSearch + WebFetch a fuentes primarias. Tripsy se investigó como "indie premium iOS-native" (foco UX patterns, pricing, ingestion, AI posture); Polarsteps se investigó como "auto-tracking journal con monetización photobook" (foco foto-journey, retención, network effect, modelo de revenue alternativo a SaaS). Triangulación entre sitios oficiales, App Store, Play Store, blogs founders, Tracxn, Crunchbase, Peecho (print partner Polarsteps), Mapbox showcase, releases changelog, prensa especializada (Skift, Phocuswire, 9to5Mac, MacStories), interviews de founders (Substack `infounderswords`, Startuprad.io), reviews 2024–2026.

---

### TRIPSY — Indie premium iOS-native (Brasil, 2 personas, unfunded)

#### Fuentes citadas (verificadas, acceso 2026-05-13)
- https://tripsy.app/ — Sitio oficial: plataformas (iPhone, iPad, Mac, Apple Watch, Vision Pro), features core, posture privacy
- https://tripsy.app/pro — Pricing Pro: lifetime USD 299, anual USD 59, Family Sharing
- https://tripsy.app/updates — Changelog: v3.8.10 (mayo 2026), v3.8.0 (mar 2026 Calendar + Trip Duplication), Recap 2025
- https://tripsy.help/article/21-whats-the-price-of-premium — Precios oficiales mensual USD 9.99, anual USD 59.99, lifetime USD 299
- https://tripsy.help/article/45-forwarding-emails-to-tripsy — Forwarding: `my@tripsy.app` (shared) + `*.tripsy.email` (per-user autogenerada), 1.000+ providers, "no scaneamos tu inbox"
- https://apps.apple.com/us/app/tripsy-travel-planner/id1429967544 — App Store US: 4.7/5, 5.400+ ratings, iOS 18+, 204.7 MB, 32 idiomas, Editor's Choice
- https://apps.apple.com/br/app/tripsy-itinerários-de-viagem/id1429967544 — App Store BR: localizada en portugués
- https://tripsy.blog/introducing-tripsy/ — Founder story: Rafael Kellermann Streit + Thiago Sanchez, 2018, Brasil
- https://tripsy.blog/how-are-we-integrating-tripsy-with-chatgpt-to-automate-some-travel-planning-flows/ — Mayo 2025: integran ChatGPT/Raycast/Perplexity vía App Intents, **NO LLM nativo**
- https://www.sketch.com/blog/tripsy/ — Feb 2024: equipo de 2, design en Sketch, Apple HIG estricto
- https://tracxn.com/d/companies/tripsy/ — Brazil, 2018, **unfunded** (zero raised), sin investors
- https://www.wandrly.app/reviews/tripsy — Quejas top: performance (save 4 min), iOS-only, sharing paywalled, location search rota
- https://setapp.com/apps/tripsy/customer-reviews — Elogio top "no plan trip without it"; quejas "UI clunky", "no PDF export", sharing paywall USD 35
- https://9to5mac.com/2024/10/02/tripsy-travel-planner/ — Refresh 2024: customizable overview, widgets interactivos, lock screen complications

#### Hallazgos clave (con números)
1. **Equipo de 2 personas brasileros**. Rafael Kellermann Streit (dev/business) + Thiago Sanchez (designer). Fundada 2018 en Brasil. **Cero funding raised** (Tracxn verificado). Es el caso extremo de indie premium en travel.
2. **Plataformas mayo 2026**: iPhone, iPad, Mac (Apple Silicon), Apple Watch (watchOS 10+), Vision Pro. iOS 18+ mínimo. **Web y Android en waitlist sin fecha, public statement "approach thoughtfully, only when we can do it right"**. Probabilidad alta de que Android nunca shippee con headcount 2.
3. **App Store US: 4.7/5 con 5.400+ ratings** (modesto para 8 años live). Editor's Choice. Tamaño estimado entre 100k–500k MAU (no publicado, **no verificado**).
4. **Cadencia release ALTA**: ~12 versiones en últimos 6 meses (bi-semanal). Major release v3.8.0 marzo 2026 (Calendar integration + Trip Duplication). Anterior major v3.7 dic 2025 (Recap anual tipo Spotify Wrapped). Cadencia comparable a Wanderlog y muy superior a TripIt.
5. **32 idiomas listados** (English + 31), **TODOS GENÉRICOS** — solo "Português" y "Español" sin diferenciar BR vs PT ni AR vs ES. Voseo argentino: no soportado (alta probabilidad — convención iOS estándar).
6. **Email forwarding: 1.000+ providers parseados** (creció desde 520 reportados en 2023). Address dual: `my@tripsy.app` shared + **address única `*.tripsy.email` per-user autogenerada** para nuevos signups desde 2025. Mejor UX que TripIt o Wanderlog.
7. **Posture privacy explícita = forwarding ONLY, NO OAuth Gmail/Inbox Sync**. Cita oficial: "We don't connect to your email accounts or mail apps to scan emails." Es feature publicitada, no limitación. Diferenciador defensible contra TripIt Inbox Sync.
8. **Pricing mayo 2026**: USD 9.99/mes — USD 59.99/año — **USD 299 lifetime** — Family Sharing via Apple. Sin pricing regional documentado. **Aumento de precio histórico ~8x desde 2018** (USD 0.99/mes → USD 9.99/mes; USD 7.49/año → USD 59.99/año).
9. **AI NATIVO = CERO**. No generan itinerarios, no resumen, no parsean emails con LLM, no captioning. Solo integración indirecta vía App Intents iOS donde el USUARIO invoca ChatGPT/Raycast/Perplexity y pega resultado. **Esto es regresivo para 2026** — Wanderlog, Polarsteps, Travo ya tienen LLM nativo.
10. **WhatsApp / Telegram / iMessage ingestion: NO existe**. Solo email. Tripsy solo aparece como destino del share-sheet iOS para invitar colaboradores, no como receptor de mensajería entrante.
11. **Apple Wallet (.pkpass): NO documentado**. No aparece en updates, ni sitio oficial, ni reviews. Tripsy almacena PDFs y boarding pass como documents pero no genera ni consume .pkpass nativos.
12. **Features Apple-ecosystem fuertes**: Live Activities (lock-screen widgets desde v3.8.5), Widgets interactivos iOS/iPadOS/macOS, watchOS Smart Stack, Siri Shortcuts, App Intents, Sign in with Apple, Apple Maps deep links, multi-window iPad. Stack: Swift + SwiftUI + CloudKit (inferido, no confirmado oficialmente).
13. **Free tier severamente limitado**: aunque marketing dice "unlimited trips" en free, en práctica forwarding email, unlimited documents, unlimited guests collaboration y 10-day weather están **detrás del paywall**. Top queja reviews: sharing tras paywall mata viralidad grupal.
14. **Top 5 quejas 2024–2026**: (a) **performance/lag** al guardar (hasta 4 minutos reportados), (b) **iOS-only deal breaker** para grupos mixtos, (c) **sharing locked tras paywall** USD 35-59, (d) location search falla, (e) **zonas horarias erróneas** (auto-detect de hotel en Japón no setea Japan TZ).
15. **Top 5 elogios**: (a) diseño Apple-native premium, (b) email forwarding "como magia" cuando funciona, (c) widgets/Live Activities pulidos, (d) colaboración multi-guest fluida (cuando pagás), (e) privacy-first sin OAuth Gmail.
16. **Cobertura LatAm**: founders brasileros sugiere parsing GOL/Azul/LATAM Brasil decente (no verificado). **Despegar, Aerolíneas Argentinas, Copa, Avianca, Flybondi, JetSMART: no verificado en docs públicas**. App Store BR localizada en portugués pero rating BR no separable de US.

#### Qué nailan
- **Forwarding email + privacy posture clara**: limpia, confía en el usuario, evita el debate Gmail-scope CASA Tier 2.
- **Diseño Apple-native premium**: Live Activities, widgets interactivos, watchOS, Vision Pro — pulido que solo equipos chicos obsesionados logran.
- **Cadencia release bi-semanal** con bug fixes serios — disciplina extrema con 2 personas.
- **Modelo lifetime USD 299** crea ancla psicológica y reduce churn — única forma honesta de competir contra TripIt mensual sin trampa.
- **Unique forwarding address per-user** (`*.tripsy.email`) — superior a Wanderlog (`trips+ID@`) y TripIt (`plans@` global).
- **Recap anual** (Recap 2025) como gancho de retención y growth viral shareable.
- **Calendar integration bidireccional** v3.8 mar 2026 — diferenciador vs TripIt y Wanderlog.
- **Stack disciplinado** Swift + SwiftUI + CloudKit-style explica cómo 2 personas sostienen el producto a 5k+ ratings.

#### Qué les falta / dónde fallan
- **Cero AI nativo en 2026** — gap regresivo. Wanderlog, Polarsteps, Travo lo tienen. Tampu puede leapfrog acá con LLM stack ya disponible.
- **iOS-only es kryptonita en LatAm** (~70-80% Android share AR/BR/MX). Tripsy literalmente no puede ser app de grupo regional.
- **Performance/save bugs** documentados (4 min saves) — el equipo de 2 no escala QA al ritmo del feature output.
- **Idiomas genéricos** sin localización regional. Solo "Español" y "Português" pelados.
- **Sharing tras paywall** mata viralidad. Tampu con sharing free tier desbloquea growth orgánico.
- **Sin WhatsApp ingestion** (igual que TripIt y Wanderlog) — el blue ocean LatAm sigue intacto.
- **Web waitlist sin fecha años** — signal de capacity limit del equipo.
- **Sin pricing PPP/regional**: USD 59.99/año = ARS ~70k/año a oficial mayo 2026, prohibitivo para clase media argentina.

#### Implicaciones para Tampu (Tripsy)
1. **Robar el "unique forwarding address per-user" pattern**: cada usuario Tampu recibe `tu-nick@in.tampu.app` autogenerada en onboarding. Mejor UX que Wanderlog (`trips+ID@`) y matchea Tripsy. Costo cero, valor alto.
2. **Robar el "Recap anual"** como growth viral. Spotify Wrapped del viaje. Genera shareables que el usuario postea voluntariamente — CAC orgánico. Implementable como server-side render de PDF/PNG en Vercel.
3. **No igualar el diseño Apple-obsesivo de Tripsy** — Tampu es web-first via Capacitor, no nativo SwiftUI. Pero **igualar la posture privacy** ("tus datos en tu device, sin OAuth Gmail") es 100% transferible y narrativamente fuerte.
4. **Pricing wedge claro**: si Tampu llegara a tener tier paga (no es el modelo affiliate actual), un lifetime USD 49 o un anual ARS 15k local cierra un gap 4x vs Tripsy USD 60 anual, con narrativa "pagás una vez, no te sorprenden". Tampu como anti-suscripción.

---

### POLARSTEPS — Auto-tracking journal con monetización photobook (Amsterdam, 90 personas, $5M raised)

#### Fuentes citadas (verificadas, acceso 2026-05-13)
- https://apps.apple.com/us/app/polarsteps/id947925763 — App Store iOS: v9.30.0, 4.9★, 7.900 US ratings, 189.5 MB, iOS 17+, 12 idiomas
- https://play.google.com/store/apps/details?id=com.polarsteps — Play Store: 4.7★, 174K ratings, **10M+ descargas**, Editor's Choice
- https://www.polarsteps.com/ — Homepage: claim "20M+ travelers", 4.8 con 370K reviews agregadas, "proudly ad-free", "<4% batería/día"
- https://news.polarsteps.com/news/polarsteps-summer-2025-release-is-here — Summer 2025 (24 jun 2025): **AI Itineraries powered by Claude AI**, Trip Reel, visual redesign
- https://news.polarsteps.com/news/polarsteps-hits-15-million-users-as-travelers-embrace-authentic-storytelling — 15M usuarios (4 jul 2025)
- https://news.polarsteps.com/news/from-dutch-startup-to-global-sensation — Francia +290% en 2024, 21% del userbase, **5.5M dutchies (≈1/3 NL)**
- https://www.peecho.com/case-studies/polarsteps — Print partner: photobooks = **"100% of the revenue"**
- https://www.mapbox.com/showcase/polarsteps — Stack confirmado: **Mapbox Mobile SDK + GL JS**, 20B km trackeados en 2024
- https://infounderswords.substack.com/p/the-viral-growth-playbook-how-to — Clare Jones (CEO) interview: 13M+ users, target **100M MAU**, ~5 amigos/trip
- https://www.startuprad.io/post/polarsteps-growth-privacy-first-travel-app-at-18m-users — 18M+ users, revenue books + afiliados (Booking, Airbnb, Hostelworld), **subscription "planeada pero no lanzada"**
- https://support.polarsteps.com/hc/en-us/articles/24003935464466 — Travel Book €36–€150 (no verificado por 403, confirmado agregadores)
- https://support.polarsteps.com/hc/en-us/articles/24004788343954 — Envío mundial gratis, **customs no cubierto**
- https://press.polarsteps.com/100387-apple-watch-app-shows-live-travel-statistics — Apple Watch app confirmada
- https://www.wandrly.app/reviews/polarsteps — Comparativa 2025: free tier completo, sólo book es pago
- https://careers.polarsteps.com/ — Headcount: **"90 y contando, 25+ nacionalidades"**
- https://www.crunchbase.com/organization/polarsteps — **Funding total $5.05M** (Series A €3M INKEF Capital 2019), fundada 2014

#### Hallazgos clave (con números)
1. **18–22M usuarios registrados (mayo 2026 estimado)**. Inconsistencia oficial: home dice 20M+, julio 2025 anunciaron 15M, Substack interview menciona 13M+. Target declarado **100M MAU** sin timeline. CAGR 117% FT1000 (2021–2024).
2. **Francia es el caso de hipergrowth 2024**: **+290% YoY**, ahora **21% del userbase global**. París es la ciudad #1 mundial en usuarios activos. NL = 5.5M usuarios = **1/3 de la población nacional**.
3. **Ninguna mención a LatAm en comunicaciones oficiales 2024-2025**. Plan documentado: replicar FR/DE/UK/US en 4 años. **LatAm explícitamente fuera del roadmap declarado**.
4. **Revenue mix: 100% photobooks físicos** (Peecho case study oficial). Afiliados Booking/Airbnb/Hostelworld mencionados como adicionales pero sin breakdown público. **Subscription explícitamente diferida** por la CEO ("travel is one of the best spaces for subscription pero primero hay que hacer algo amazing").
5. **Travel Book: €36 (24 páginas) a €150 (premium lay-flat)**. Envío mundial gratis declarado, **pero customs NO cubierto** — para Argentina/Brasil/México esto significa AFIP/Receita Federal duplica el costo efectivo. Descuentos volumen: 10% por 2, 15% por 3+.
6. **Funding total $5.05M en 12 años**. Series A €3M INKEF Capital 2019. **$0.25/user lifetime raised** — eficiencia capital extraordinaria. Probablemente rentables desde 2021–2022.
7. **Headcount 90 personas Amsterdam HQ**, 25+ nacionalidades. Stack: **Mapbox** (Mobile SDK + GL JS), **Claude AI (Anthropic)** para itineraries opt-in, iOS/Android nativos, Peecho para print fulfillment.
8. **iOS rating 4.9★ con 7.900 US ratings, 370K global agregadas**. Android **4.7★ con 174K ratings, 10M+ descargas, Editor's Choice Google Play**. Gap 0.2★ entre iOS y Android sugiere mejor experiencia iOS pero ambas premiadas.
9. **Versión iOS actual: 9.30.0**. iOS 17+ mínimo. 189.5 MB. Cadencia release ALTA — el major Summer 2025 (jun 2025) shippeo AI Itineraries + Trip Reel + redesign simultáneamente.
10. **AI Itineraries (jun 2025)**: opt-in, usa historial del user + contenido editorial humano + **Claude (Anthropic)** como motor. UI map-centric, NO chatbot. **Fotos/videos NO se envían a servicios externos de IA** — privacy claim explícito.
11. **Trip Reel**: video corto cinematográfico autogenerado desde fotos/videos/locations. Competencia directa al output IG/TikTok pero como producto interno, no consumo de feed.
12. **Battery claim: <4%/día trackeando**. Técnica: NO polling GPS continuo, sino "breadcrumbs" asincrónicos via WiFi+celda+GPS asistido de otras apps. Sin sync tiempo real — feature, no bug.
13. **Idiomas (12)**: Inglés, Holandés, Alemán, Francés, Español, Portugués, Italiano, Danés, Finlandés, Noruego Bokmål, Sueco, Indonesio, Malayo. **Español NO diferenciado AR/ES, Portugués NO diferenciado BR/PT**.
14. **Polarsteps Unpacked = Spotify Wrapped del viaje**. Requiere ≥1 trip. Activo en polarsteps.com/unpacked. Gancho retención + shareability.
15. **Colaboración multi-user: NO soportada**. Solo una persona puede agregar fotos/notas por trip. **Queja recurrente verificada** en reviews 2024-2025. Viajes en pareja/familia son segundo-clase ciudadano estructural.
16. **NO es planner**: NO guarda vuelos, hoteles, reservas, confirmation numbers, documentos. Es journal puro post-evento o durante. **Esto deja el gap "agregador de documentos" estructuralmente abierto** — exactamente el espacio Tampu.
17. **Stat icónica 2024: 20 mil millones de km trackeados** (≈40 viajes a Marte). Marketing storytelling como artefacto cultural.

#### Qué nailan
- **Onboarding pasivo cero-fricción**: "instalo y olvido", el tracking pasa solo. Diferencia abismal vs apps que exigen check-ins manuales (Tripsy, Wanderlog, TripIt).
- **Storytelling de marca contracultural**: "ad-free, by travelers for travelers, privacy-first" + KPIs poéticos (20B km a Marte, "1/3 of the Netherlands"). Vibe anti-feed-social-tóxico.
- **Travel Book como monetización elegante**: regalo emocional físico, márgenes altos vía Peecho, opt-in al final del viaje con engagement máximo. **Sin paywall en la experiencia core**.
- **Mapa como producto, no como feature**: la "vista de viaje" con ruta real (no líneas rectas) es el shareable artifact que dura años.
- **Network effect orgánico**: ~5 amigos/familia siguen por trip → cuando ven el mapa en persona, descargan. **CAC orgánico bajísimo**.
- **AI integrada al map UX, no chat**: aprovecharon LLMs sin caer en el "chatbot kid genérico". Claude para itineraries pero captioning de fotos lo evitan deliberadamente (autenticidad).
- **Editor's Choice ambas stores** + iOS 4.9★ = engineering execution alta.
- **Penetración cultural NL** prueba que el producto puede convertirse en default behavior cultural.

#### Qué les falta / dónde fallan
- **Cero presencia LatAm**: ningún partnership, ninguna mención roadmap, ningún PR. Portugués sin BR.
- **Travel Book a Argentina = customs nightmare**: envío gratis pero AFIP duplica el costo. Producto efectivamente inaccesible o caro 2x en LatAm.
- **Cero soporte multi-user/shared trips**: queja #1 recurrente. Viajes en pareja/familia segundo-clase.
- **Bugs persistentes de tracking**: "mystery flights", "teleportations", fotos que no aparecen en mapa, datos que no sincronizan. Sin solución completa 2024-2025.
- **NO es planner**: no guarda vuelos, hoteles, reservas, documentos. CEO admite que no van a hacerlo (no es su DNA).
- **Sin subscription = revenue cap real**: dependen 100% de un product físico con logistics + customs. No escala lineal con MAU.
- **Sin Wear OS** (solo Apple Watch), sin colaboración real, sin export sólido (no PDF/MP4 confirmado más allá de Trip Reel).
- **Idiomas no localizados culturalmente**: español es España-flavored, no rioplatense ni LatAm.

#### Implicaciones para Tampu (Polarsteps)
1. **NO competir en "auto-tracking + journal"**: Polarsteps lo gana en NL/FR/DE estructuralmente. Tampu dobla apuesta en **agregación de documentos + viaje + dinero** (vuelos, hoteles, reservas, seguros, visas, confirmaciones, gastos, transporte). El gap explícito que la CEO de Polarsteps **deliberadamente** no quiere cerrar.
2. **Tab "Fotos" como sidecar contextualizado a documentos, NO como journal social**: Polarsteps ya nailó journal-as-output con 20M users. Tampu compite si las fotos se **conectan a documentos** (foto del boarding pass auto-extrae datos, foto del hotel auto-rellena reserva, foto del recibo auto-categoriza gasto). Que la 5ª tab sea "fotos útiles", no "fotos lindas".
3. **Robar el Recap/Unpacked anual + shareability**: Polarsteps demostró que el artifact final (mapa) genera ~5 amigos/trip que ven el output. Tampu necesita su artifact equivalente para documentos — propuesta: **"historial verificable de viajes"** útil para visas/inmigración LatAm + Recap anual con stats de gasto, km, países, vuelos.
4. **Resolver el "Travel Book customs LatAm" como nicho**: Tampu puede ofrecer **photobook + courier local AR/BR/MX** (vía Locucal, Cuponstar, partner regional print on-demand). Margen alto, Polarsteps físicamente no puede atender bien. **No es prioridad MVP pero está mapeado como revenue stream futuro**.
5. **Adoptar el modelo "ad-free + revenue alternativo"** explícitamente. Polarsteps probó que se puede tener 18M users con $5M raised y rentabilidad — la disciplina de NO SaaS-recurrente es defensible. Tampu con **affiliate honesto + photobook regional + lifetime opcional** matchea ese modelo mejor que cualquier suscripción mensual.

---

### Comparación cruzada Tripsy vs Polarsteps vs Tampu

| Dimensión | Tripsy | Polarsteps | Tampu (target) |
|---|---|---|---|
| **Categoría** | Planner aggregator iOS-native | Journal auto-tracker map-centric | Aggregator + Documentos + Dinero + Fotos contextualizadas |
| **Plataforma** | iOS-only (Web/Android waitlist) | iOS + Android + Web | iOS + Android + Web (Capacitor + Next.js) |
| **Equipo** | 2 personas, unfunded, Brasil | 90 personas, $5M raised, NL | Solo founder + IA, Argentina |
| **Idiomas** | 32 (genéricos) | 12 (sin BR/AR diferenciado) | ES-AR + PT-BR nativo + EN |
| **AI nativo** | Cero (App Intents pasarela) | Claude para itineraries (jun 2025) | Claude/Gemini para parsing + chat (planificado) |
| **Ingestion email** | Forwarding only (no OAuth) | No aplica (no es planner) | Forwarding + WhatsApp + JSON-LD + LLM fallback |
| **WhatsApp** | No | No aplica | **Sí (diferenciador estructural)** |
| **Colaboración** | Multi-guest tras paywall | No soportada | Multi-user free + Yjs CRDT |
| **Pricing** | USD 59.99/año + USD 299 lifetime | Photobook €36-150 | Free + affiliate + lifetime opcional |
| **Revenue model** | Subscription | 100% photobook físico | Affiliate honesto + photobook regional |
| **LatAm coverage** | Founders BR pero sin AR | Cero declarado | Native (target #1) |
| **Privacy posture** | "No OAuth Gmail" explícito | Ad-free, fotos no van a AI | Cifrado at-rest + BYOK + no OAuth |
| **Shareable artifact** | Recap anual | Mapa + Trip Reel + Unpacked | **(gap a llenar: Recap + mapa + historial)** |
| **Network effect** | Bajo (sharing paywalled) | Alto (mapa viral) | Medio-alto (objetivo) |

### Implicaciones cruzadas para Tampu (síntesis de ambos competidores)

1. **Adoptar el "Recap anual" como gancho de retención y growth viral**. Tanto Tripsy como Polarsteps Unpacked validan el patrón. Implementación: server-side render de PDF/PNG/MP4 al fin de año o al fin de viaje. Costo trivial (Vercel server actions), valor alto (CAC orgánico + retention spike).
2. **Adoptar el "unique forwarding address per-user"** estilo Tripsy `*.tripsy.email`. Mejor UX que Wanderlog `trips+ID@`. Costo cero, mensaje "tu email privado para reenviar confirmaciones". Patron: `{nick}@in.tampu.app` autogenerada en onboarding con opción de personalizar.
3. **Pricing wedge claro contra ambos**: Tampu no necesita suscripción mensual. Modelo "free + affiliate honesto + lifetime USD 29-49 opcional" mata 3 pájaros: (a) anti-TripIt USD 49/año silencioso, (b) anti-Tripsy USD 60/año, (c) anti-Polarsteps subscription-pendiente. **El lifetime es el ancla emocional**: Tripsy lo prueba con USD 299, Tampu puede ofrecer USD 29-49 con margen positivo dado el costo casi cero del backend (Supabase free tier + Vercel Hobby).
4. **No competir en "diseño Apple obsesivo" (Tripsy) ni en "auto-tracking journal" (Polarsteps)**. Ambos son moats estructurales construidos por años. Tampu compite en **agregación de documentos + voseo argentino + WhatsApp ingestion + ES-AR + PT-BR + cobertura LatAm carriers**. Es un juego diferente, no copia.
5. **Adoptar el modelo "ad-free + revenue alternativo" explícitamente**, estilo Polarsteps. Mensaje literal en landing: "Sin ads. Sin venta de datos. Sin suscripción mensual. Si reservás por Tampu, ganamos una comisión declarada. Si no, también te servimos." Esta postura es defendible y narrativamente fuerte contra TripIt (SAP) y Wanderlog (billing dañado).
6. **Photobook regional LatAm como revenue stream futuro (no MVP)**: Polarsteps prueba que el photobook físico monetiza un journal sin paywall. Tampu puede mapear partnership con printer regional AR/BR/MX a 12-18 meses, cuando haya base de usuarios suficiente.

### Notas del investigador

El takeaway transversal entre Tripsy y Polarsteps es que **ambos eligieron jugar un juego deliberadamente acotado** y eso los hizo defendibles. Tripsy es "el planner iOS premium para nerds Apple" — 2 personas, USD 60/año, 5k+ ratings, lifetime USD 299, no quieren ser Android-ni-web. Polarsteps es "el mapa-recuerdo del viajero" — 90 personas, photobook físico como único revenue, no quieren ser planner-ni-aggregator. Cada uno renunció al 80% del mercado para dominar el 20% donde tienen ventaja estructural. **Esto es la lección clave para Tampu**: el peor camino sería intentar ser Tripsy + Polarsteps + Wanderlog + TripIt simultáneamente. El mejor camino es **elegir explícitamente "el agregador travel-OS para el viajero LatAm premium adulto"** y renunciar al 80% que no entra en eso (auto-tracking pasivo, photobook glossy físico, diseño Apple-obsesivo, planner from-scratch tipo Layla, social feed). El segundo takeaway es que **Polarsteps lleva Claude (Anthropic) en producción desde junio 2025 para itineraries, sin captioning de fotos por privacidad declarada** — esto valida la stack que Tampu eligió (Claude Haiku + Gemini Flash via BYOK) y prueba que el mercado está aceptando AI nativo en travel apps cuando se posiciona como "asistencia al usuario", no "automatización del recuerdo". El tercer takeaway es operativo: **Tripsy con 2 personas brasileros y unfunded shippea ~12 versiones cada 6 meses** — Tampu con 1 founder + IA puede shippear cadencia similar si la disciplina técnica está. El cuarto y más importante: **ningún de los cinco competidores investigados hasta ahora (TripIt, Wanderlog, Tripsy, Polarsteps) tiene WhatsApp ingestion**. Es el blue ocean estructural más limpio identificado hasta el momento del research. Cada burst que pasa lo confirma.

