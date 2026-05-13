"use client";

// ─── User-provided AI API key (Anthropic OR Google Gemini) ───
// Pasted in /settings. Stored only in localStorage. Never persisted server-side.
// The server reads the relevant header on each request.

const STORAGE_KEY = "travel-os-ai-key";              // unified key (auto-detect provider)
const LEGACY_KEY = "travel-os-anthropic-key";        // backward-compat

export type AIProvider = "anthropic" | "gemini" | "unknown";

export function detectProvider(key: string): AIProvider {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  // Google API keys start with "AIza"
  if (k.startsWith("AIza")) return "gemini";
  return "unknown";
}

export function getUserApiKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  // Migrate legacy key to unified storage
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy && !localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, legacy);
  }
  return localStorage.getItem(STORAGE_KEY);
}

export function getUserProvider(): AIProvider {
  const k = getUserApiKey();
  if (!k) return "unknown";
  return detectProvider(k);
}

export function setUserApiKey(key: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (!key || !key.trim()) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, key.trim());
  }
  window.dispatchEvent(new Event("travel-os-anthropic-key-change"));
}

export function hasUserApiKey(): boolean {
  const k = getUserApiKey();
  if (!k) return false;
  const p = detectProvider(k);
  return p === "anthropic" || p === "gemini";
}

/** Headers including the API key — sets `x-anthropic-key` or `x-gemini-key` based on prefix. */
export function withApiKeyHeaders(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (extra) Object.assign(h, extra);
  const key = getUserApiKey();
  if (!key) return h;
  const p = detectProvider(key);
  if (p === "anthropic") h["x-anthropic-key"] = key;
  else if (p === "gemini") h["x-gemini-key"] = key;
  return h;
}
