//
//  ShareExtensionPlugin.swift — Capacitor plugin para que el JS lea el blob
//  que el Share Extension dejó en el App Group.
//
//  Instalación:
//    1. Copiar a `ios/App/App/Plugins/ShareExtensionPlugin.swift`.
//    2. En Xcode agregar al target `App` (NO al target del share extension).
//    3. Verificar que App Group `group.com.tampu.app` está habilitado en el
//       target App (Signing & Capabilities).
//

import Foundation
import Capacitor

@objc(ShareExtensionPlugin)
public class ShareExtensionPlugin: CAPPlugin {
    private let appGroup = "group.com.tampu.app"
    private let pendingKey = "tampu_pending_share"

    @objc func consumePendingShare(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            call.resolve(["payload": NSNull()])
            return
        }
        guard let data = defaults.data(forKey: pendingKey) else {
            call.resolve(["payload": NSNull()])
            return
        }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            // Limpiar entrada corrupta
            defaults.removeObject(forKey: pendingKey)
            call.resolve(["payload": NSNull()])
            return
        }

        // Consumir: borrar después de leer para que sea idempotente.
        defaults.removeObject(forKey: pendingKey)
        defaults.synchronize()

        call.resolve(["payload": json])
    }
}
