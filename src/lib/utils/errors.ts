// ─── Error reporting helpers ───
//
// Supabase errors NO son instancias de Error — son plain objects con shape
// { message, code, details, hint }. e instanceof Error → false, String(e) →
// "[object Object]". Esto rompía toasts genéricos en toda la app.
//
// Usar describeError(e) para obtener un message string consistente con código
// opcional, o reportError(e, prefix) para el patrón completo (console.error +
// toast + haptic) en una llamada.

import { toast } from "@/components/ios/toast";
import { haptic } from "@/lib/native/platform";

export interface ErrorInfo {
  message: string;
  code?: string;
}

/**
 * Extrae un mensaje human-readable de cualquier error.
 *
 * Orden de prioridad:
 *   1. Supabase shape: e.message + e.code (PostgrestError, AuthError)
 *   2. Supabase shape: e.details (a veces el message está vacío y details tiene la causa)
 *   3. Error native: e.message
 *   4. String literal: typeof e === "string"
 *   5. JSON stringify como último recurso (mejor que "[object Object]")
 *   6. "Error desconocido"
 */
export function describeError(e: unknown): ErrorInfo {
  if (e == null) return { message: "Error desconocido" };

  // Supabase / Postgrest / AuthError shape
  if (typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const message = typeof obj.message === "string" && obj.message
      ? obj.message
      : typeof obj.details === "string" && obj.details
        ? obj.details
        : null;
    const code = typeof obj.code === "string" ? obj.code : undefined;
    if (message) return { message, code };
  }

  if (e instanceof Error) {
    return { message: e.message || "Error sin mensaje" };
  }

  if (typeof e === "string") {
    return { message: e };
  }

  // Último recurso — JSON.stringify es mejor que "[object Object]"
  try {
    return { message: JSON.stringify(e) || "Error desconocido" };
  } catch {
    return { message: "Error desconocido" };
  }
}

/**
 * Patrón completo: console.error para debug + toast user-facing + haptic feedback.
 * Uso típico en catch blocks.
 *
 * @param e - El error capturado (cualquier tipo)
 * @param prefix - Prefijo del mensaje user-facing (ej "No se pudo crear el viaje")
 */
export function reportError(e: unknown, prefix = "Error"): void {
  const { message, code } = describeError(e);
  const codePart = code ? ` [${code}]` : "";
  console.error(`[${prefix}]`, e);
  toast(`${prefix}${codePart}: ${message}`, "error");
  void haptic("heavy");
}
