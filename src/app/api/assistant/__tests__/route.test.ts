import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../route";

const baseCtx = {
  trip_name: "PNG + Seoul",
  destination: "Papua New Guinea",
  start_date: "2026-08-10",
  end_date: "2026-09-02",
  mode: "pre_departure",
  days_until_start: 5,
  readiness_score: 60,
  open_critical_tasks: [{ title: "Insurance research", due_date: "2026-07-15", next_action: "Compare 3 quotes" }],
  pending_critical_reservations: [{ description: "Travel insurance", provider: "IATI", payment_deadline: "2026-07-15" }],
  uncovered_nights: 3,
  budget_used_pct: 78,
  forecast_status: "yellow",
  upcoming_payments: [{ title: "Insurance", days_until: 5, amount: 250, currency: "USD" }],
  open_alerts: [{ title: "PNG visa unknown", severity: "critical" }],
};

function makeReq(body: unknown): Request {
  return new Request("http://test.local/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assistant", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("returns 400 when missing question or context", async () => {
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(400);
  });

  it("falls back to heuristic when no API key", async () => {
    const res = await POST(makeReq({ question: "¿Qué hago?", context: baseCtx }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("heuristic");
    expect(Array.isArray(json.suggestions)).toBe(true);
    expect(json.suggestions.length).toBeGreaterThan(0);
  });

  it("heuristic prioritises critical reservations over generic suggestions", async () => {
    const res = await POST(makeReq({ question: "¿Qué hago?", context: baseCtx }) as never);
    const json = await res.json();
    const firstCritical = json.suggestions.find((s: { priority: string }) => s.priority === "critical");
    expect(firstCritical).toBeDefined();
  });

  it("heuristic surfaces uncovered nights when present", async () => {
    const res = await POST(makeReq({ question: "?", context: baseCtx }) as never);
    const json = await res.json();
    const hit = json.suggestions.some((s: { title: string }) => /noches sin alojamiento/i.test(s.title));
    expect(hit).toBe(true);
  });

  it("uses Claude when API key is set and call succeeds", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-123";
    const mockResponse = {
      content: [{
        type: "text",
        text: JSON.stringify({
          answer: "Comprá el seguro hoy.",
          suggestions: [{ title: "Comprar seguro", detail: "IATI", priority: "critical", deep_link: "/reservations" }],
        }),
      }],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const res = await POST(makeReq({ question: "¿Qué hago?", context: baseCtx }) as never);
    const json = await res.json();
    expect(json.source).toBe("claude");
    expect(json.answer).toBe("Comprá el seguro hoy.");
    expect(json.suggestions[0].title).toBe("Comprar seguro");
  });

  it("falls back to heuristic if Claude returns invalid JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-123";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      content: [{ type: "text", text: "this is not json" }],
    }), { status: 200 }));

    const res = await POST(makeReq({ question: "?", context: baseCtx }) as never);
    const json = await res.json();
    expect(json.source).toBe("heuristic");
  });

  it("falls back to heuristic on Claude HTTP error", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-123";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("server error", { status: 500 }));

    const res = await POST(makeReq({ question: "?", context: baseCtx }) as never);
    const json = await res.json();
    expect(json.source).toBe("heuristic");
  });
});
