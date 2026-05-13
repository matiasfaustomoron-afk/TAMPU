"use client";

/**
 * Apple Intelligence bridge (Foundation Models framework).
 *
 * Llamado desde:
 *   - Daily brief (resumen del viaje) → on-device si está disponible
 *   - Asistente → si user no configuró cloud LLM key, AI nativo es gratis
 *   - Suggested replies a comentarios del journal
 *
 * Privacy: las requests on-device NUNCA salen del dispositivo. Esto es
 * literalmente el diferenciador #1 vs cloud LLMs y Tampu lo puede usar
 * como narrative privacy ("tu asistente no manda tus datos a ningún lado").
 *
 * Disponibilidad:
 *   - iOS 18.2+ con Apple Intelligence activado en Settings
 *   - Hardware A17 Pro+ (iPhone 15 Pro o superior, iPad M1+)
 *   - Settings → Apple Intelligence & Siri → ON
 *
 * Fallback: si no está disponible, devolvemos { available: false } y los
 * callers caen al cloud LLM ya configurado (Anthropic Claude o Gemini).
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

interface AppleIntelligencePlugin {
  isAvailable(): Promise<{ available: boolean; reason: string }>;
  generate(opts: { prompt: string; system?: string }): Promise<{ text: string; usedFallback: boolean }>;
  summarizeTrip(opts: { context: string }): Promise<{ summary: string; usedFallback: boolean }>;
}

const webStub: AppleIntelligencePlugin = {
  async isAvailable() {
    return { available: false, reason: "web-not-supported" };
  },
  async generate() {
    return { text: "", usedFallback: true };
  },
  async summarizeTrip() {
    return { summary: "", usedFallback: true };
  },
};

export const AppleIntelligence = Capacitor.isNativePlatform()
  ? registerPlugin<AppleIntelligencePlugin>("AppleIntelligence", { web: webStub })
  : webStub;

let _availabilityCache: { available: boolean; reason: string } | null = null;

export async function checkAppleIntelligenceAvailable(): Promise<{ available: boolean; reason: string }> {
  if (_availabilityCache) return _availabilityCache;
  try {
    const r = await AppleIntelligence.isAvailable();
    _availabilityCache = r;
    return r;
  } catch (err) {
    const r = { available: false, reason: String(err) };
    _availabilityCache = r;
    return r;
  }
}

/**
 * Resumen del viaje activo. Prefiere Apple Intelligence on-device; si no está
 * disponible devuelve null para que el caller decida (típicamente: caer al
 * cloud LLM o no mostrar el resumen).
 */
export async function summarizeTripOnDevice(context: string): Promise<string | null> {
  const av = await checkAppleIntelligenceAvailable();
  if (!av.available) return null;
  try {
    const r = await AppleIntelligence.summarizeTrip({ context });
    if (r.usedFallback) return null;
    return r.summary.trim();
  } catch {
    return null;
  }
}

/**
 * Generación libre on-device. Acá las prompts pueden ser cualquier cosa —
 * típicamente daily brief, suggested reply, hint del asistente.
 */
export async function generateOnDevice(prompt: string, system?: string): Promise<string | null> {
  const av = await checkAppleIntelligenceAvailable();
  if (!av.available) return null;
  try {
    const r = await AppleIntelligence.generate({ prompt, system });
    if (r.usedFallback) return null;
    return r.text.trim();
  } catch {
    return null;
  }
}
