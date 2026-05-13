// ─── Server-side AI provider abstraction ───
// Routes call callLLM(prompt, opts, req) and we pick Anthropic OR Gemini
// based on the headers sent by the client. Both honor the user-provided key.

import type { NextRequest } from "next/server";

export type Provider = "anthropic" | "gemini" | null;

export interface LLMCallOpts {
  system?: string;
  userMessage: string;
  maxTokens?: number;
  /** Image attachments (base64) for vision — only used by classify-document route */
  image?: { dataB64: string; mime: string };
  pdf?: { dataB64: string };
  timeoutMs?: number;
}

export function selectProvider(req: NextRequest): { provider: Provider; key: string | null } {
  const anth = req.headers.get("x-anthropic-key");
  if (anth && anth.startsWith("sk-ant-")) return { provider: "anthropic", key: anth };
  const gem = req.headers.get("x-gemini-key");
  if (gem && gem.startsWith("AIza")) return { provider: "gemini", key: gem };
  // Env fallback (server-side)
  const envAnth = process.env.ANTHROPIC_API_KEY;
  if (envAnth) return { provider: "anthropic", key: envAnth };
  const envGem = process.env.GEMINI_API_KEY;
  if (envGem) return { provider: "gemini", key: envGem };
  return { provider: null, key: null };
}

/** Call the selected provider and return the raw text response. Null on failure. */
export async function callLLM(provider: Provider, key: string, opts: LLMCallOpts): Promise<string | null> {
  if (!provider || !key) return null;
  if (provider === "anthropic") return callAnthropic(key, opts);
  if (provider === "gemini") return callGemini(key, opts);
  return null;
}

async function callAnthropic(key: string, opts: LLMCallOpts): Promise<string | null> {
  try {
    const content: Array<Record<string, unknown>> = [];
    if (opts.image) {
      content.push({ type: "image", source: { type: "base64", media_type: opts.image.mime, data: opts.image.dataB64 } });
    }
    if (opts.pdf) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.pdf.dataB64 } });
    }
    content.push({ type: "text", text: opts.userMessage });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
    const txt = json.content?.find(c => c.type === "text")?.text;
    return txt || null;
  } catch { return null; }
}

async function callGemini(key: string, opts: LLMCallOpts): Promise<string | null> {
  try {
    const parts: Array<Record<string, unknown>> = [];
    if (opts.system) parts.push({ text: `[SYSTEM] ${opts.system}\n\n` });
    if (opts.image) {
      parts.push({ inline_data: { mime_type: opts.image.mime, data: opts.image.dataB64 } });
    }
    if (opts.pdf) {
      parts.push({ inline_data: { mime_type: "application/pdf", data: opts.pdf.dataB64 } });
    }
    parts.push({ text: opts.userMessage });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 1024,
          temperature: 0.5,
        },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    };
    const txt = json.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
    return txt || null;
  } catch { return null; }
}
