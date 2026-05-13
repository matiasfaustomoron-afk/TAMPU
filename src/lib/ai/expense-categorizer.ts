"use client";

// ─── Expense LLM categorizer (client wrapper) ───
//
// Llama a `/api/categorize-expense` con la API key del user en headers.
// Si no hay key configurada o el LLM falla, devuelve null (la UI cae al
// select manual). El endpoint server-side valida la categoría contra
// BUDGET_CATEGORIES, así que el caller puede confiar en el return.

import { getUserApiKey, detectProvider } from "@/lib/ai/user-key";

export interface ExpenseInput {
  description: string;
  amount?: number;
  currency?: string;
  date?: string;
  destination?: string;
}

export interface CategorizationResult {
  category: string;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
}

/**
 * Clasifica una descripción de gasto en una BUDGET_CATEGORY. Devuelve null
 * si no hay key configurada o si la red/IA falla — el caller debe tener
 * fallback a manual select.
 */
export async function categorizeExpense(
  input: ExpenseInput,
  signal?: AbortSignal
): Promise<CategorizationResult | null> {
  const key = getUserApiKey();
  if (!key) return null;
  const provider = detectProvider(key);
  if (provider !== "anthropic" && provider !== "gemini") return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "anthropic") headers["x-anthropic-key"] = key;
  else headers["x-gemini-key"] = key;

  try {
    const res = await fetch("/api/categorize-expense", {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = await res.json() as CategorizationResult | { error: string };
    if ("error" in data) return null;
    return data;
  } catch {
    return null;
  }
}
