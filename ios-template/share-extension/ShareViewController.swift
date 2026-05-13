//
//  ShareViewController.swift
//  Tampu Share Extension — recibe "Compartir con Tampu" desde Mail, Safari,
//  WhatsApp, Gmail, Booking app, etc. y forwardea el texto al parser.
//
//  Instalación (Xcode):
//    1. File → New → Target → Share Extension. Nombre: "TampuShare".
//       Bundle ID sugerido: com.tampu.app.share
//    2. Reemplazar el ShareViewController.swift generado por este archivo.
//    3. Reemplazar Info.plist por el `Info.plist` que viene en este folder.
//    4. En Signing & Capabilities del target TampuShare:
//       - Habilitar "App Groups" → seleccionar `group.com.tampu.app`
//         (mismo App Group que el target principal y el Widget).
//    5. En el target App principal:
//       - Verificar que el "Activation Rule" del Share Extension
//         (en Info.plist) está bien para que aparezca solo cuando hay texto
//         o URL en el share sheet.
//    6. Re-build el proyecto. La opción "Tampu" aparece en cualquier app
//       que invoque UIActivityViewController.
//
//  Flow:
//    User abre Mail con confirmación de Booking en español.
//    → Tap share → "Tampu"
//    → ShareViewController extrae el texto y/o URL del item provider
//    → Persiste el blob en App Group `group.com.tampu.app` con key `pending_share`
//    → Lanza el deep link `tampu://import-shared` que abre la app principal
//    → El handler en JS (Capacitor App plugin → appUrlOpen listener) lee el
//      blob, lo pasa al parser, y muestra los bookings detectados en /import
//
//  Privacy: el texto compartido NUNCA se sube a servidor. Vive en el App Group
//  hasta que el user lo commitea o lo descarta desde la app principal.
//

import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {

    private let appGroup = "group.com.tampu.app"
    private let pendingKey = "tampu_pending_share"

    override func isContentValid() -> Bool {
        // Aceptamos cualquier texto >= 20 chars (igual que el parser web).
        return (contentText?.count ?? 0) >= 20 || hasAttachedItems
    }

    private var hasAttachedItems: Bool {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return false }
        for item in items {
            if let attachments = item.attachments {
                for provider in attachments {
                    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) ||
                       provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) ||
                       provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                        return true
                    }
                }
            }
        }
        return false
    }

    override func didSelectPost() {
        Task {
            await processSharedContent()

            // Lanzar la app principal vía deep link. Esto requiere que la app
            // tenga el URL scheme `tampu` registrado en su Info.plist y un
            // handler de `appUrlOpen` en JS via Capacitor.
            await MainActor.run {
                if let url = URL(string: "tampu://import-shared") {
                    self.openURL(url)
                }
                self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            }
        }
    }

    override func configurationItems() -> [Any]! {
        return []
    }

    // ──────────────────────────────────────────────────────────────────────
    // MARK: - Procesamiento del contenido compartido
    // ──────────────────────────────────────────────────────────────────────

    private func processSharedContent() async {
        var collectedText = self.contentText ?? ""
        var collectedUrls: [String] = []

        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            return persist(text: collectedText, urls: collectedUrls)
        }

        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                // Plain text
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                        collectedText += "\n\n" + text
                    }
                }
                // URLs
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                        collectedUrls.append(url.absoluteString)
                    }
                }
                // Rich text fallback
                if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                    if let text = try? await provider.loadItem(forTypeIdentifier: UTType.text.identifier) as? String {
                        collectedText += "\n\n" + text
                    }
                }
            }
        }

        persist(text: collectedText, urls: collectedUrls)
    }

    private func persist(text: String, urls: [String]) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        let payload: [String: Any] = [
            "text": text.trimmingCharacters(in: .whitespacesAndNewlines),
            "urls": urls,
            "received_at": ISO8601DateFormatter().string(from: Date()),
            "source": "ios-share-extension",
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            defaults.set(data, forKey: pendingKey)
            defaults.synchronize()
        }
    }

    // Truco estándar para abrir una URL desde un share extension. Apple
    // técnicamente no lo bendice, pero todos los share extensions populares
    // (Things, Bear, Reeder) lo usan. Funciona en iOS 16+.
    @objc private func openURL(_ url: URL) {
        var responder: UIResponder? = self
        while responder != nil {
            if let app = responder as? UIApplication {
                _ = app.perform(#selector(openURL(_:)), with: url)
                return
            }
            responder = responder?.next
        }
    }
}
