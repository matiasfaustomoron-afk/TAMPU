//
//  WidgetBridgePlugin.swift
//  Tampu — Capacitor plugin para comunicar el JS con el Widget Extension
//  y las Live Activities (ActivityKit).
//
//  Instalación:
//    1. Copiar este archivo a `ios/App/App/Plugins/WidgetBridgePlugin.swift`.
//    2. En Xcode, agregar el archivo al target `App` (no al widget extension).
//    3. App → Signing & Capabilities → + App Groups → `group.com.tampu.app`.
//    4. (Live Activities) Agregar `NSSupportsLiveActivities = YES` en Info.plist.
//    5. Crear Widget Extension target en Xcode (File → New → Target → Widget Extension).
//       En el WidgetExtension target activar el mismo App Group.
//    6. Para Live Activities crear un `ActivityAttributes` struct compartido
//       entre App y Widget — ver `FlightActivityAttributes.swift` que viene
//       en este folder.
//
//  El JS importa el plugin con:
//    import { WidgetBridge } from "@/lib/native/widget-bridge";
//    await WidgetBridge.pushWidgetSnapshot({ next_event_title: ..., ... });
//

import Foundation
import Capacitor
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin {
    private let appGroup = "group.com.tampu.app"
    private let snapshotKey = "tampu_widget_snapshot"

    // Diccionario en memoria: activityToken (UUID string) → activity ref
    // No persistimos: si el user mata la app, las activities siguen vivas en el SO
    // hasta su staleDate; el JS las olvida y el SO las limpia.
    #if canImport(ActivityKit)
    private var activities: [String: Activity<FlightActivityAttributes>] = [:]
    #endif

    @objc func pushWidgetSnapshot(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            call.reject("App Group not configured. See WidgetBridgePlugin.swift docs.")
            return
        }

        // Acceptamos la opción completa como dictionary y la persistimos como JSON.
        let opts = call.options ?? [:]
        do {
            let data = try JSONSerialization.data(withJSONObject: opts, options: [])
            defaults.set(data, forKey: snapshotKey)
            defaults.synchronize()

            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            call.resolve(["ok": true])
        } catch {
            call.reject("Failed to serialize snapshot: \(error.localizedDescription)")
        }
    }

    @objc func startFlightLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": false, "activityToken": NSNull()])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["ok": false, "activityToken": NSNull()])
            return
        }

        let flightNumber = call.getString("flight_number") ?? ""
        let origin = call.getString("origin") ?? ""
        let destination = call.getString("destination") ?? ""
        let gate = call.getString("gate")
        let seat = call.getString("seat")
        let departureAt = call.getString("departure_at") ?? ""
        let status = call.getString("status") ?? "scheduled"
        let delayMinutes = call.getInt("delay_minutes") ?? 0

        let attributes = FlightActivityAttributes(
            flightNumber: flightNumber,
            origin: origin,
            destination: destination,
            seat: seat
        )

        let state = FlightActivityAttributes.ContentState(
            status: status,
            gate: gate,
            delayMinutes: delayMinutes,
            departureAtISO: departureAt
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                contentState: state,
                pushType: .token
            )
            let token = UUID().uuidString
            activities[token] = activity
            call.resolve(["ok": true, "activityToken": token])
        } catch {
            call.reject("startFlightLiveActivity failed: \(error.localizedDescription)")
        }
        #else
        call.resolve(["ok": false, "activityToken": NSNull()])
        #endif
    }

    @objc func updateFlightLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *),
              let token = call.getString("activityToken"),
              let activity = activities[token] else {
            call.resolve(["ok": false])
            return
        }
        let update = call.getObject("update") ?? [:]
        let currentState = activity.contentState

        Task {
            await activity.update(using: FlightActivityAttributes.ContentState(
                status: update["status"] as? String ?? currentState.status,
                gate: update["gate"] as? String ?? currentState.gate,
                delayMinutes: update["delay_minutes"] as? Int ?? currentState.delayMinutes,
                departureAtISO: update["departure_at"] as? String ?? currentState.departureAtISO
            ))
            call.resolve(["ok": true])
        }
        #else
        call.resolve(["ok": false])
        #endif
    }

    @objc func endFlightLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *),
              let token = call.getString("activityToken"),
              let activity = activities[token] else {
            call.resolve(["ok": false])
            return
        }

        Task {
            await activity.end(dismissalPolicy: .immediate)
            activities.removeValue(forKey: token)
            call.resolve(["ok": true])
        }
        #else
        call.resolve(["ok": false])
        #endif
    }
}

// ──────────────────────────────────────────────────────────────────────────
// FlightActivityAttributes — compartido entre App y Widget Extension.
// Copiá este struct (sin `import Capacitor`) al target del widget para que
// ambos puedan deserializar el mismo shape.
// ──────────────────────────────────────────────────────────────────────────

#if canImport(ActivityKit)
import ActivityKit

public struct FlightActivityAttributes: ActivityAttributes {
    public typealias ContentState = ContentStateImpl

    public struct ContentStateImpl: Codable, Hashable {
        public var status: String
        public var gate: String?
        public var delayMinutes: Int
        public var departureAtISO: String
    }

    public let flightNumber: String
    public let origin: String
    public let destination: String
    public let seat: String?
}
#endif
