# Travel OS — App Store Review Notes

Material que se carga en App Store Connect → App Information → Review Information.

## Cuenta demo para el reviewer

> App Review necesita poder probar la app sin tu cuenta personal de Supabase.

### Opción A (recomendada): Modo demo embebido

Decile al reviewer:
```
Travel OS funciona en MODO DEMO sin necesidad de cuenta.
1. Al abrir la app, tocá "Entrar en modo demo" en la pantalla de login.
2. Se carga un viaje de ejemplo (PNG + Seúl, Ago 2026) con 70+ tareas, 7 reservas, 13 docs, 38+ items de packing.
3. Toda la app es funcional: Dashboard, Today, Cashflow, Risk, Decisions, Emergency, Health, Visas, Connections, Map, Vault, Assistant.
4. Los datos quedan en localStorage del dispositivo del reviewer.

No se requieren credenciales.
```

### Opción B: Cuenta de prueba en Supabase
Si vas a forzar online mode para review:
```
Email: review@travel-os.app
Password: AppleReview2026!
```
**(NO comprometer esta cuenta antes de la review. Crearla en tu Supabase y poblarla con datos de prueba.)**

## Notes para Apple Review (Review Information → Notes)

```
Travel OS is a personal travel operations command center. It centralizes itinerary, flights, accommodations, documents, insurance, vaccinations (CDC-sourced), visas (verified per passport+destination), budget, expenses, alerts, risk register, and emergency contacts.

To test without an account:
1. Tap "Enter demo mode" on the login screen.
2. A complete sample trip (Papua New Guinea + Seoul, Aug 2026) loads automatically.
3. All features are operational in demo mode.

Native iOS functionality included:
- Native splash screen and status bar control
- Native share sheet (Summary → Compartir)
- File system save for ICS calendar export (Summary → ICS)
- Local notifications for deadline reminders
- Offline-capable shell via Capacitor

The app does NOT collect personal data. The optional online mode requires the user to bring their own Supabase backend. Privacy policy: https://travel-os.app/privacy

Contact: review@travel-os.app
```

## Privacy nutrition labels (App Store Connect → Privacy)

Para cargar en App Store Connect:

### Data NOT Collected
- Contact Info (Name, Email Address, Phone Number, Physical Address, Other)
- Health & Fitness
- Financial Info (User Financial Info, Payment Info, Credit Score, Other)
- Location (Precise, Coarse)
- Sensitive Info
- Contacts
- User Content (Emails, Messages, Photos, Videos, Audio, Customer Support, Other)
- Browsing History
- Search History
- Identifiers (User ID, Device ID, Advertising Data)
- Purchases
- Usage Data (Product Interaction, Advertising Data, Other)
- Diagnostics (Crash Data, Performance Data, Other)

### Data Collected (solo si el usuario activa online mode)
- **Contact Info → Email Address** — para Supabase Auth, solo si elige modo online. Used for: App Functionality. Not linked to identity for tracking.
- **User Content → Photos / Documents** — vault uploads, solo si el usuario sube. Used for: App Functionality. Linked to user account (su Supabase). NOT used for tracking.

### Data Used for Tracking
- **Nada.** Sin trackers, sin SDKs publicitarios.

## Rejection-risk anticipation

| Posible motivo | Mitigación |
|---|---|
| **4.2 Minimum Functionality** ("just a website wrapper") | Plugins nativos integrados: Share, Filesystem, LocalNotifications, StatusBar, SplashScreen. App-shell loadea en <1s. Demo mode 100% offline. Risk: medio-bajo. |
| **4.2.3 (4.7 HTML5)** ("repackaged website") | El producto es un Command Center, no un sitio repackaged. Tiene UX dedicada de mobile. Risk: bajo. |
| **5.1.1 Privacy** ("data collection without permission") | Demo mode no recolecta nada. Online mode pide consentimiento explícito al login. Privacy policy clara. Risk: bajo. |
| **5.1.5 Location Services** | No usamos ubicación. Risk: cero. |
| **2.1 App Completeness** ("crashes / broken features") | 123 tests verdes, build OK, smoke 26/26 rutas 200. Risk: bajo si TestFlight pasa QA. |
| **2.3.7 Misleading metadata** | App name + description honesta. Risk: bajo. |
| **3.1.1 In-App Purchase** ("usás pagos externos") | No tiene compras. Risk: cero. |
| **4.0 Design** ("UI looks like a web page") | Bottom nav, FAB, safe-area, native splash. Risk: bajo. |

## Plan B: si Apple rechaza por 4.2

Si Apple dice "your app appears to be a webview wrapper":
1. Agregar más plugins nativos: `@capacitor/camera` (escanear pasaporte directo a Vault), `@capacitor/geolocation` (current city auto-detect)
2. Mostrar un splash custom con animación nativa (no white-flash)
3. Implementar haptic feedback (`@capacitor/haptics`) en interacciones críticas (toggle de packing, scroll del Next 7 Days)
4. Resubir resaltando esas integraciones en las review notes

## Plan C: si rechazo persistente

Migración a Capacitor + algunos componentes en SwiftUI (módulo nativo) para áreas críticas:
- `/map` → MKMapView nativo
- `/today` → SwiftUI view con widgets nativos
- Mantener el resto como web
