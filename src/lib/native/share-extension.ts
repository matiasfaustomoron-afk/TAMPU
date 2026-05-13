"use client";

/**
 * Share Extension bridge — JS side.
 *
 * Cuando el user invoca "Compartir con Tampu" desde Mail/Booking/WhatsApp:
 *  1. ShareViewController persiste el texto en App Group `group.com.tampu.app`
 *     bajo la key `tampu_pending_share`.
 *  2. ShareViewController abre `tampu://import-shared`.
 *  3. La app principal recibe el deep link via Capacitor `App` plugin listener.
 *  4. Llama a `consumePendingShare()` (este módulo) que lee desde el App Group
 *     via `WidgetBridge` plugin (reusamos el mismo bridge).
 *
 * El handler global vive en `<AppShellLayout>` y redirige a `/import?from=share`.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

interface SharePayload {
  text: string;
  urls: string[];
  received_at: string;
  source: "ios-share-extension";
}

interface ShareExtensionPlugin {
  /** Lee y consume (borra) el blob compartido del App Group. */
  consumePendingShare(): Promise<{ payload: SharePayload | null }>;
}

const webStub: ShareExtensionPlugin = {
  async consumePendingShare() {
    return { payload: null };
  },
};

export const ShareExtension = Capacitor.isNativePlatform()
  ? registerPlugin<ShareExtensionPlugin>("ShareExtension", { web: webStub })
  : webStub;

/**
 * Consume pending share desde el App Group. Devuelve el payload o null si no había.
 * Idempotente — la segunda llamada devuelve null.
 */
export async function consumePendingShare(): Promise<SharePayload | null> {
  try {
    const { payload } = await ShareExtension.consumePendingShare();
    return payload;
  } catch (err) {
    console.warn("[share-extension] consume failed:", err);
    return null;
  }
}
