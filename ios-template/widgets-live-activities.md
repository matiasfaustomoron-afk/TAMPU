# Tampu — iOS Widgets + Live Activities playbook

Capacitor sirve para el shell de la app, pero **Widgets de Home Screen y Live Activities en la Lock Screen son features SwiftUI nativas** que requieren un **Widget Extension target** dentro del proyecto Xcode.

Esto NO se puede hacer 100% desde JS. Lo que sigue es el playbook completo para implementarlos después de `npx cap add ios`.

---

## Parte 1 · Widget de "Próximo evento" (Home Screen, Lock Screen)

### Qué muestra

- Si está en viaje: ciudad + temperatura + próxima reserva
- Si falta para el viaje: countdown grande + destino

### Estructura del extension

```
ios/App/
├── App/                      ← Capacitor app principal
└── TampuWidgets/             ← NEW · Widget Extension target
    ├── TampuWidgets.swift    ← @main entry
    ├── NextEventWidget.swift ← Widget de próximo evento
    ├── CountdownWidget.swift ← Widget de countdown
    └── Info.plist
```

### Pasos en Xcode (post `cap add ios`)

1. File → New → Target → **Widget Extension**
2. Bundle ID: `com.tampu.app.widgets`
3. Marcar **Include Live Activity** ☑
4. Marcar **Configuration Intent** ☐ (Tampu no necesita configuración por widget)
5. Esto crea el target + un `Info.plist` con `NSExtensionPointIdentifier = com.apple.widgetkit-extension`

### Data sharing entre app + widget

Capacitor app + Widget extension viven en **procesos separados**. Para compartir data:

**Opción A — App Group + UserDefaults** (recomendado para data simple):
```swift
// En la app y en el widget, ambos comparten:
let defaults = UserDefaults(suiteName: "group.com.tampu.app")
```

1. Apple Developer → Identifiers → editar App ID de Tampu → Capabilities → App Groups → crear `group.com.tampu.app`
2. Xcode: App target → Signing & Capabilities → "+ Capability" → App Groups → marcar `group.com.tampu.app`
3. Idem en Widget target
4. En Capacitor: usar plugin `@capacitor-community/preferences-grouped` (o write directo via Swift bridge) para escribir en App Group desde JS.

**Opción B — SQLite/Core Data shared** (data grande): usar `URL.appendingPathComponent` con `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`.

### Código del widget (boilerplate)

```swift
// NextEventWidget.swift
import WidgetKit
import SwiftUI

struct NextEventEntry: TimelineEntry {
    let date: Date
    let title: String       // "Vuelo LATAM LA8064"
    let subtitle: String    // "Buenos Aires → Santiago"
    let fireAt: Date?       // hora de la reserva
}

struct NextEventProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextEventEntry {
        NextEventEntry(date: Date(), title: "Tu próximo evento", subtitle: "Cargando…", fireAt: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (NextEventEntry) -> ()) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextEventEntry>) -> ()) {
        // 1. Leer App Group UserDefaults
        let defaults = UserDefaults(suiteName: "group.com.tampu.app")
        let title = defaults?.string(forKey: "next.title") ?? "Sin eventos próximos"
        let subtitle = defaults?.string(forKey: "next.subtitle") ?? ""
        let fireAtStr = defaults?.string(forKey: "next.fireAt")
        let fireAt = fireAtStr.flatMap { ISO8601DateFormatter().date(from: $0) }

        let entry = NextEventEntry(date: Date(), title: title, subtitle: subtitle, fireAt: fireAt)
        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60)))
        completion(timeline)
    }
}

struct NextEventWidgetView: View {
    var entry: NextEventEntry

    var body: some View {
        ZStack {
            // Fondo terracota Tampu
            LinearGradient(
                colors: [Color(red: 0.78, green: 0.36, blue: 0.18), Color(red: 0.55, green: 0.24, blue: 0.10)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            VStack(alignment: .leading, spacing: 6) {
                Text("PRÓXIMO").font(.system(size: 9, weight: .heavy)).tracking(2).foregroundColor(.white.opacity(0.7))
                Text(entry.title).font(.system(size: 14, weight: .semibold)).foregroundColor(.white).lineLimit(2)
                Text(entry.subtitle).font(.system(size: 12)).foregroundColor(.white.opacity(0.85))
                if let fireAt = entry.fireAt {
                    Spacer()
                    Text(fireAt, style: .relative).font(.system(size: 11, weight: .medium)).foregroundColor(.white.opacity(0.7))
                }
            }
            .padding(12)
        }
    }
}

@main
struct TampuWidgets: Widget {
    let kind: String = "NextEventWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextEventProvider()) { entry in
            NextEventWidgetView(entry: entry)
        }
        .configurationDisplayName("Próximo evento")
        .description("El próximo vuelo, traslado o check-in de tu viaje activo.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
```

### Escribir al App Group desde Tampu (JS / Capacitor)

Crear un Capacitor plugin custom o usar `@capacitor-community/preferences-grouped`:

```ts
// src/lib/native/widget-bridge.ts
import { Preferences } from '@capacitor/preferences';

export async function updateNextEventWidget(input: {
  title: string;
  subtitle: string;
  fireAt: Date | null;
}) {
  // El plugin built-in Preferences NO escribe en App Group por default.
  // Hay dos opciones:
  //  1. Usar `@capacitor-community/preferences-grouped` con group="group.com.tampu.app"
  //  2. Custom Capacitor plugin que usa UserDefaults(suiteName:) directo en Swift
  //
  // Opción 2 (recomendada, sin dependencia extra):
  //   ver `ios/App/App/Plugins/WidgetBridge.swift`
}
```

Llamar desde `today/page.tsx` cuando se calcula el NBA:

```ts
useEffect(() => {
  if (!cc || !nba) return;
  updateNextEventWidget({
    title: nba.title,
    subtitle: nba.subtitle,
    fireAt: ... // si NBA tiene una fecha asociada
  });
}, [cc, nba]);
```

---

## Parte 2 · Live Activity de "Vuelo en curso"

### Qué muestra

- Hora actual + hora de salida del próximo vuelo
- Countdown vivo (sin que la app esté abierta)
- En iPhone 14 Pro+ → Dynamic Island con la silueta del avión

### Implementación

Live Activities usan **ActivityKit** (iOS 16.1+). Conceptualmente son un widget que la APP arranca con `Activity.request(...)` y termina con `.end()`.

```swift
// ios/App/TampuWidgets/FlightLiveActivity.swift
import ActivityKit
import WidgetKit
import SwiftUI

struct FlightActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var status: String          // "Embarcando" | "En vuelo" | "Aterrizado"
        var gate: String?
        var minutesToTakeoff: Int   // negativo si ya salió
    }

    var carrier: String
    var flightNumber: String
    var origin: String
    var destination: String
}

struct FlightLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            // Lock Screen
            VStack(alignment: .leading) {
                HStack {
                    Text("\(context.attributes.carrier) \(context.attributes.flightNumber)").bold()
                    Spacer()
                    Text(context.state.status)
                }
                HStack {
                    Text(context.attributes.origin).font(.title)
                    Image(systemName: "airplane")
                    Text(context.attributes.destination).font(.title)
                }
                if let gate = context.state.gate {
                    Text("Gate \(gate)")
                }
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Text(context.attributes.origin) }
                DynamicIslandExpandedRegion(.trailing) { Text(context.attributes.destination) }
                DynamicIslandExpandedRegion(.center) { Image(systemName: "airplane") }
                DynamicIslandExpandedRegion(.bottom) { Text(context.state.status) }
            } compactLeading: {
                Image(systemName: "airplane")
            } compactTrailing: {
                Text(context.state.status)
            } minimal: {
                Image(systemName: "airplane")
            }
        }
    }
}
```

### Triggering desde JS

Custom Capacitor plugin que expone:

```swift
@objc func startFlightActivity(_ call: CAPPluginCall) {
    let attributes = FlightActivityAttributes(
        carrier: call.getString("carrier") ?? "",
        flightNumber: call.getString("flightNumber") ?? "",
        origin: call.getString("origin") ?? "",
        destination: call.getString("destination") ?? ""
    )
    let state = FlightActivityAttributes.ContentState(
        status: call.getString("status") ?? "Próximamente",
        gate: call.getString("gate"),
        minutesToTakeoff: call.getInt("minutesToTakeoff") ?? 0
    )

    do {
        let _ = try Activity.request(attributes: attributes, contentState: state)
        call.resolve(["ok": true])
    } catch {
        call.reject("Live Activity failed: \(error.localizedDescription)")
    }
}
```

Llamada JS desde Tampu:

```ts
// Al detectar que un vuelo está a < 6h, lanzar la Live Activity
import { registerPlugin } from '@capacitor/core';
const FlightActivity = registerPlugin<FlightActivityPlugin>('FlightActivity');

await FlightActivity.startFlightActivity({
  carrier: 'LATAM',
  flightNumber: 'LA8064',
  origin: 'BUE',
  destination: 'SCL',
  status: 'Embarcando',
  gate: 'B14',
  minutesToTakeoff: 45,
});
```

### Actualización remota (push to Live Activity)

iOS 16.2+ permite actualizar la Live Activity vía **APNs push silencioso** con el `push-token` que devuelve `Activity.pushToken`. Útil para "el gate cambió de B14 a B22" sin que el usuario abra la app.

Setup: el endpoint `/api/notify-flight-update` recibe el evento (de FlightAware API por ejemplo) y manda APNs push con payload:
```json
{
  "aps": {
    "timestamp": 1716000000,
    "event": "update",
    "content-state": { "gate": "B22", "status": "Demorado 15 min" }
  }
}
```

---

## Parte 3 · checklist de implementación

- [ ] `npx cap add ios` (requiere macOS + Xcode 15+)
- [ ] Crear Widget Extension target en Xcode
- [ ] Configurar App Group `group.com.tampu.app` en ambos targets
- [ ] Implementar `NextEventWidget.swift` (copy del boilerplate de arriba)
- [ ] Implementar custom Capacitor plugin `WidgetBridge` para escribir UserDefaults grouped
- [ ] Conectar desde `today/page.tsx` → llamar `updateNextEventWidget()` cuando NBA cambia
- [ ] Implementar `FlightLiveActivity.swift` + plugin `FlightActivity`
- [ ] En `reservations/page.tsx`: trigger Live Activity cuando reserva tiene fecha < 6h
- [ ] Para updates remotas: configurar APNs con `application/json` `push-type=liveactivity`

ETA total: ~10-15 horas de Swift + Capacitor bridge para alguien que ya hizo widgets antes.

Lo que **NO podemos hacer desde Windows / web**:
- Compilar Widget Extension
- Probar Live Activity (requiere iPhone real o simulator)
- Submit con widgets (requiere submission entera vía Xcode → App Store Connect)

Cuando estés en una Mac, esta guía es ejecutable paso a paso.
