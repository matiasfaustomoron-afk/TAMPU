//
//  TampuAppIntents.swift — Siri Shortcuts + App Intents para Tampu.
//
//  Permite invocar a Tampu via Siri, Shortcuts app, Spotlight search,
//  Action button del iPhone 15 Pro+, y el back tap (accesibilidad).
//
//  Comandos soportados (mayo 2026):
//    "Hey Siri, próximo vuelo en Tampu"     → NextFlightIntent
//    "Hey Siri, mi viaje en Tampu"          → ActiveTripIntent
//    "Hey Siri, agregar gasto a Tampu"      → AddExpenseIntent (toma parámetro monto)
//    "Hey Siri, importar reserva en Tampu"  → OpenImportIntent
//
//  Los Intents leen el snapshot del Widget (mismo App Group) — el JS empuja
//  `tampu_widget_snapshot` desde Today, así que Siri responde sin abrir la app.
//
//  Instalación (Xcode):
//    1. Copiar a `ios/App/App/Intents/TampuAppIntents.swift`.
//    2. Agregar al target App.
//    3. iOS 16+ obligatorio para AppIntents framework.
//    4. Verificar Info.plist tiene `NSUserActivityTypes` con los Intent IDs.
//    5. (Opcional) Crear un `AppShortcuts.swift` con `AppShortcutsProvider`
//       para que aparezcan en Spotlight sin que el user los configure.
//

import AppIntents
import Foundation

private let appGroup = "group.com.tampu.app"
private let snapshotKey = "tampu_widget_snapshot"

private struct WidgetSnapshot: Decodable {
    var next_event_title: String?
    var next_event_at: String?
    var countdown_days: Int?
    var trip_route: String?
}

private func readSnapshot() -> WidgetSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return nil }
    guard let data = defaults.data(forKey: snapshotKey) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
}

// ──────────────────────────────────────────────────────────────────────────
// MARK: - "Hey Siri, próximo vuelo en Tampu"
// ──────────────────────────────────────────────────────────────────────────

@available(iOS 16.0, *)
struct NextFlightIntent: AppIntent {
    static var title: LocalizedStringResource = "Próximo vuelo"
    static var description = IntentDescription("Te dice el siguiente evento del viaje activo.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let snap = readSnapshot(), let title = snap.next_event_title else {
            return .result(dialog: "Todavía no hay un viaje activo en Tampu.")
        }

        var phrase = "Tu próximo paso: \(title)"
        if let days = snap.countdown_days, days > 0 {
            phrase += ". Faltan \(days) \(days == 1 ? "día" : "días")."
        }
        if let route = snap.trip_route {
            phrase += " Ruta: \(route)."
        }
        return .result(dialog: IntentDialog(stringLiteral: phrase))
    }
}

// ──────────────────────────────────────────────────────────────────────────
// MARK: - "Hey Siri, mi viaje en Tampu"
// ──────────────────────────────────────────────────────────────────────────

@available(iOS 16.0, *)
struct ActiveTripIntent: AppIntent {
    static var title: LocalizedStringResource = "Viaje activo"
    static var description = IntentDescription("Abre el viaje activo en Tampu.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        return .result()
    }
}

// ──────────────────────────────────────────────────────────────────────────
// MARK: - "Hey Siri, importar reserva en Tampu"
// ──────────────────────────────────────────────────────────────────────────

@available(iOS 16.0, *)
struct OpenImportIntent: AppIntent {
    static var title: LocalizedStringResource = "Importar reserva"
    static var description = IntentDescription("Abre la pantalla de importar emails en Tampu.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        // El URL handler en native-bootstrap.tsx escucha `tampu://import` y
        // hace router.push('/import'). Acá solo lanzamos la URL.
        if let url = URL(string: "tampu://import") {
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}

// ──────────────────────────────────────────────────────────────────────────
// MARK: - "Agregar gasto a Tampu"
// ──────────────────────────────────────────────────────────────────────────

@available(iOS 16.0, *)
struct AddExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Agregar gasto"
    static var description = IntentDescription("Agrega un gasto rápido al viaje activo.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Monto")
    var amount: Double

    @Parameter(title: "Descripción")
    var note: String

    @MainActor
    func perform() async throws -> some IntentResult {
        // Persistir el "draft" en App Group para que la app lo lea al abrir.
        if let defaults = UserDefaults(suiteName: appGroup) {
            let draft: [String: Any] = [
                "amount": amount,
                "note": note,
                "ts": ISO8601DateFormatter().string(from: Date()),
            ]
            if let data = try? JSONSerialization.data(withJSONObject: draft) {
                defaults.set(data, forKey: "tampu_pending_expense_draft")
                defaults.synchronize()
            }
        }
        if let url = URL(string: "tampu://expenses?draft=1") {
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}

// ──────────────────────────────────────────────────────────────────────────
// MARK: - AppShortcutsProvider — exposes los intents en Spotlight + Shortcuts
// ──────────────────────────────────────────────────────────────────────────

@available(iOS 16.0, *)
struct TampuShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: NextFlightIntent(),
            phrases: [
                "Próximo vuelo en \(.applicationName)",
                "Qué sigue en \(.applicationName)",
                "Mi próximo evento en \(.applicationName)",
            ],
            shortTitle: "Próximo vuelo",
            systemImageName: "airplane.departure"
        )
        AppShortcut(
            intent: ActiveTripIntent(),
            phrases: [
                "Mi viaje en \(.applicationName)",
                "Abrir viaje en \(.applicationName)",
            ],
            shortTitle: "Viaje activo",
            systemImageName: "suitcase.fill"
        )
        AppShortcut(
            intent: OpenImportIntent(),
            phrases: [
                "Importar reserva en \(.applicationName)",
                "Agregar email en \(.applicationName)",
            ],
            shortTitle: "Importar",
            systemImageName: "tray.and.arrow.down"
        )
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Agregar gasto en \(.applicationName)",
                "Cargar un gasto en \(.applicationName)",
            ],
            shortTitle: "Agregar gasto",
            systemImageName: "dollarsign.circle"
        )
    }
}

#if canImport(UIKit)
import UIKit
#endif
