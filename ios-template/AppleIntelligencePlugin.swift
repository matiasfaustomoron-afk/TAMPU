//
//  AppleIntelligencePlugin.swift — Capacitor plugin que expone el Foundation
//  Models framework de Apple Intelligence (iOS 18.2+, M1+/A17 Pro+).
//
//  Usado por Tampu para:
//    - Resumir el viaje activo on-device (sin enviar nada a servidor)
//    - Generar texto de descripción para el daily brief
//    - Suggested replies a comentarios del journal en pareja
//
//  Graceful degrade:
//    - iOS < 18.2 → devuelve { available: false } y la app cae al fallback
//      cloud LLM (Anthropic / Gemini) ya configurado.
//    - Hardware no soportado → idem.
//    - Apple Intelligence apagado en Settings → idem.
//
//  Instalación:
//    1. Copiar a `ios/App/App/Plugins/AppleIntelligencePlugin.swift`.
//    2. Target requiere iOS 18.2+ deployment para que el import resuelva.
//       Si querés soportar iOS 16-17, mantener el import dentro del
//       `#if canImport(FoundationModels)` que ya está acá.
//

import Foundation
import Capacitor

#if canImport(FoundationModels)
import FoundationModels
#endif

@objc(AppleIntelligencePlugin)
public class AppleIntelligencePlugin: CAPPlugin {

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 18.2, *) {
            let model = SystemLanguageModel.default
            switch model.availability {
            case .available:
                call.resolve(["available": true, "reason": "ok"])
            case .unavailable(let reason):
                call.resolve([
                    "available": false,
                    "reason": String(describing: reason),
                ])
            }
        } else {
            call.resolve(["available": false, "reason": "ios-version-too-old"])
        }
        #else
        call.resolve(["available": false, "reason": "framework-not-built"])
        #endif
    }

    @objc func generate(_ call: CAPPluginCall) {
        let prompt = call.getString("prompt") ?? ""
        let systemInstructions = call.getString("system") ?? "You are a helpful, concise travel assistant. Respond in Spanish (Argentina) unless the prompt is in English or Portuguese."

        if prompt.isEmpty {
            call.reject("prompt is required")
            return
        }

        #if canImport(FoundationModels)
        if #available(iOS 18.2, *) {
            Task {
                do {
                    let session = LanguageModelSession(instructions: systemInstructions)
                    let response = try await session.respond(to: prompt)
                    call.resolve([
                        "text": response.content,
                        "usedFallback": false,
                    ])
                } catch {
                    call.reject("foundation-models-error: \(error.localizedDescription)")
                }
            }
        } else {
            call.resolve(["text": "", "usedFallback": true, "reason": "ios-version-too-old"])
        }
        #else
        call.resolve(["text": "", "usedFallback": true, "reason": "framework-not-built"])
        #endif
    }

    /// Resume estructurado del viaje. JS pasa el contexto del CommandCenter
    /// (trip + reservations + tasks + alerts) y devuelve un summary en español.
    @objc func summarizeTrip(_ call: CAPPluginCall) {
        guard let context = call.getString("context") else {
            call.reject("context is required")
            return
        }

        #if canImport(FoundationModels)
        if #available(iOS 18.2, *) {
            Task {
                do {
                    let session = LanguageModelSession(instructions: "Sos un asistente de viaje conciso. Respondé siempre en español rioplatense, sin emojis, en máximo 3 oraciones.")
                    let prompt = """
                    Resumí este viaje en 3 oraciones máximo, destacando lo crítico para hoy y mañana:

                    \(context)
                    """
                    let response = try await session.respond(to: prompt)
                    call.resolve([
                        "summary": response.content,
                        "usedFallback": false,
                    ])
                } catch {
                    call.reject("summarize-failed: \(error.localizedDescription)")
                }
            }
        } else {
            call.resolve(["summary": "", "usedFallback": true])
        }
        #else
        call.resolve(["summary": "", "usedFallback": true])
        #endif
    }
}
