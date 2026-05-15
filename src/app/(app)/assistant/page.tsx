"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared";
import { LargeTitle, IOSFeatureCard, Pill } from "@/components/ios";
import { cn } from "@/lib/utils/helpers";
import { useCommandCenter, useActiveTrip, useReservations, useCities } from "@/lib/hooks/use-trip-data";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useI18n } from "@/i18n/provider";
import { Sparkles, Send, ArrowRight, Loader2, MapPin } from "lucide-react";
import { captureLocation, isTrackingEnabled } from "@/lib/native/platform";
import { AIRPORTS, TRAVELER_QUESTIONS } from "@/lib/config/airports";
import { lookupAirport, nearestAirports, searchAirports } from "@/lib/config/airports-data";
import { getAirportInfo } from "@/lib/airport-info-client";
import { hasUserApiKey, withApiKeyHeaders } from "@/lib/ai/user-key";
import { generateOnDevice } from "@/lib/native/apple-intelligence";
import { Typewriter } from "@/components/ios/typewriter";
import type { Attachment } from "@/lib/types/database";

interface Suggestion {
  title: string;
  detail: string;
  priority: "critical" | "high" | "medium" | "low";
  deep_link?: string | null;
}

interface AssistantResponse {
  source: "claude" | "heuristic";
  answer: string;
  suggestions: Suggestion[];
}

const PRESET_QUESTIONS = TRAVELER_QUESTIONS;

export default function AssistantPage() {
  const { data: cc, loading } = useCommandCenter();
  const { data: trip } = useActiveTrip();
  const { data: reservations } = useReservations(trip?.id);
  const { data: cities } = useCities(trip?.id);
  const { mode } = useSupabase();
  useI18n();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [vault, setVault] = useState<Attachment[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [keyConfigured, setKeyConfigured] = useState(false);

  useEffect(() => {
    const check = () => queueMicrotask(() => setKeyConfigured(hasUserApiKey()));
    check();
    window.addEventListener("travel-os-anthropic-key-change", check);
    return () => window.removeEventListener("travel-os-anthropic-key-change", check);
  }, []);

  // Load vault metadata into the assistant context
  useEffect(() => {
    if (!trip) return;
    if (mode === "demo") {
      try {
        const raw = localStorage.getItem(`travel-os-vault-${trip.id}`);
        if (raw) setVault(JSON.parse(raw));
      } catch { /* empty */ }
    }
    // Online mode: vault is fetched directly when needed; for assistant we keep it light
  }, [trip, mode]);

  // Try to capture current location (only if user opted in via /settings)
  useEffect(() => {
    let cancelled = false;
    isTrackingEnabled().then(enabled => {
      if (!enabled || cancelled) return;
      captureLocation().then(pt => { if (pt && !cancelled) setLocation({ lat: pt.lat, lng: pt.lng }); });
    });
    return () => { cancelled = true; };
  }, []);

  const ask = useCallback(async (q: string) => {
    if (!cc || !q.trim()) return;
    setBusy(true);
    setResponse(null);
    try {
      // Collect IATA codes from trip cities + flight reservations
      const cityNames = (cities || []).map(c => c.name.toLowerCase());
      const iataSet = new Set<string>();
      // Curated airports matched by city
      for (const a of AIRPORTS) {
        if (cityNames.some(n => n.includes(a.city.toLowerCase()) || n.includes(a.iata.toLowerCase()))) {
          iataSet.add(a.iata);
        }
      }
      // IATA codes mentioned in flight reservations descriptions
      for (const r of reservations || []) {
        if (r.type !== "flight") continue;
        const matches = (r.description || "").match(/\b([A-Z]{3})\b/g) || [];
        for (const code of matches) {
          if (lookupAirport(code)) iataSet.add(code);
        }
      }

      // ─── Dynamic airport lookup from the QUESTION ───
      // Detect IATA codes (3 uppercase letters) and city names in the user's question.
      // Add them so the assistant has rich info for the place actually asked about.
      const qUpper = q.toUpperCase();
      const qLower = q.toLowerCase();
      const iataInQ = qUpper.match(/\b([A-Z]{3})\b/g) || [];
      for (const code of iataInQ) {
        if (lookupAirport(code)) iataSet.add(code);
      }
      // City-based search — pick top 2 by relevance
      const cityHits = searchAirports(qLower, 2);
      for (const a of cityHits) iataSet.add(a.iata);

      // Resolve each IATA — curated first, fallback to dynamic (Claude generated + cached)
      const resolved = await Promise.all(
        Array.from(iataSet).slice(0, 10).map(async iata => await getAirportInfo(iata))
      );
      const tripAirports = resolved.filter((a): a is NonNullable<typeof a> => a !== null);
      // Nearest airport from massive dataset (works ANYWHERE in the world)
      const nearestList = location ? nearestAirports(location.lat, location.lng, 1) : [];
      const nearest = nearestList[0] ? await getAirportInfo(nearestList[0].airport.iata) : null;
      const nearestDistance = nearestList[0]?.distance_km ?? null;
      const ctx = {
        trip_name: cc.trip.name,
        destination: cc.trip.destination,
        start_date: cc.trip.start_date,
        end_date: cc.trip.end_date,
        mode: cc.mode_info.mode,
        days_until_start: cc.mode_info.days_until_start,
        readiness_score: cc.dashboard.readiness.overall_score,
        open_critical_tasks: cc.dashboard.upcoming_tasks
          .filter(t => t.criticality === "blocker" || t.criticality === "essential")
          .slice(0, 8)
          .map(t => ({ title: t.title, due_date: t.due_date, next_action: t.next_action })),
        pending_critical_reservations: cc.decisions
          .filter(d => d.source === "reservation" && d.urgency !== "info")
          .slice(0, 5)
          .map(d => ({ description: d.title, provider: d.description?.split(" · ")[0] || "—", payment_deadline: d.deadline })),
        uncovered_nights: cc.dashboard.readiness.nights_uncovered,
        budget_used_pct: cc.dashboard.budget.percent_used,
        forecast_status: cc.dashboard.budget.forecast_status,
        upcoming_payments: cc.money_in_flight.items.slice(0, 5).map(p => ({ title: p.title, days_until: p.days_until, amount: p.amount, currency: p.currency })),
        open_alerts: cc.dashboard.alerts.slice(0, 8).map(a => ({ title: a.title, severity: a.severity })),
        // ─── New context ───
        vault: vault.map(v => ({ id: v.id, name: v.file_name, category: v.category, notes: v.notes, file_type: v.file_type })),
        reservations: (reservations || []).map(r => ({ id: r.id, type: r.type, provider: r.provider, description: r.description, locator: r.locator, use_date: r.use_date, status: r.status })),
        current_location: location ? {
          lat: location.lat, lng: location.lng,
          nearest_airport: nearest ? { iata: nearest.iata, name: nearest.name, distance_km: nearestDistance ?? 0 } : undefined,
        } : null,
        airports_in_trip: tripAirports.map(a => ({
          iata: a.iata, name: a.name, city: a.city,
          terminals: a.terminals,
          food: a.food.map(f => ({ name: f.name, note: f.note })),
          currency_exchange: a.currency_exchange.map(c => ({ name: c.name, note: c.note })),
          transport_to_city: a.transport_to_city,
          tips: a.tips,
        })),
      };
      // Apple Intelligence on-device (iOS 18.2+, A17 Pro+) — privacy-first path.
      // Si está disponible y la pregunta es razonablemente corta, respondemos sin
      // mandar nada a un servidor. El fallback es el cloud LLM ya configurado.
      const aiText = q.length < 600
        ? await generateOnDevice(
            `Contexto del viaje: ${JSON.stringify(ctx).slice(0, 4000)}\n\nPregunta del usuario: ${q}\n\nRespondé en máximo 4 oraciones, en español rioplatense, sin emojis.`,
          )
        : null;

      if (aiText) {
        setResponse({
          source: "claude",
          answer: aiText + "\n\n— Generado on-device con Apple Intelligence.",
          suggestions: [],
        });
        setQuestion("");
        return;
      }

      // Fallback: cloud LLM (Anthropic / Gemini con la key del user)
      // In mobile/Capacitor builds the static export has no /api routes;
      // configure NEXT_PUBLIC_API_BASE_URL to point at the deployed web (Vercel).
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      const res = await fetch(`${base}/api/assistant`, {
        method: "POST",
        headers: withApiKeyHeaders(),
        body: JSON.stringify({ question: q, context: ctx }),
      });
      const json = await res.json() as AssistantResponse;
      setResponse(json);
      setQuestion("");
    } catch {
      setResponse({ source: "heuristic", answer: "No pude consultar el asistente. Probá de nuevo.", suggestions: [] });
    } finally {
      setBusy(false);
    }
  }, [cc, vault, reservations, cities, location]);

  if (loading) return <AssistantSkeleton />;
  if (!cc) return <div className="px-4 mt-8"><EmptyState title="Sin viaje activo" icon={<Sparkles className="w-8 h-8" />} /></div>;

  return (
    <div className="animate-fade-in">
      <LargeTitle
        eyebrow={keyConfigured ? "IA en vivo" : "Modo limitado"}
        title="Asistente"
        serif
      />

      {/* ─── Hero — signature gradient with status ─── */}
      <div className="px-4">
        <IOSFeatureCard
          gradient="linear-gradient(135deg, oklch(0.55 0.20 245), oklch(0.40 0.22 285))"
          className="text-white"
          padding="lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70 mb-2">
                {keyConfigured ? "Asistente IA" : "Asistente · Modo limitado"}
              </p>
              <h2 className="font-serif text-3xl leading-tight">
                {keyConfigured ? "Preguntá lo que sea" : "Conectá Claude"}
              </h2>
              <p className="text-[13px] text-white/75 mt-2 leading-relaxed">
                {keyConfigured
                  ? `Sé de tu viaje: ${vault.length} archivos · ${(reservations || []).length} reservas indexadas${location ? " · GPS activo" : ""}`
                  : "Sin key conectada respondo con tus datos locales. Conectá Gemini gratis o Claude en Ajustes."}
              </p>
            </div>
            <Sparkles className="w-7 h-7 text-white/80 shrink-0" />
          </div>
          {!keyConfigured && (
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-[12px] font-semibold backdrop-blur-sm pressable"
            >
              Conectar key <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </IOSFeatureCard>
      </div>

      {/* ─── Location pill ─── */}
      {location && keyConfigured && (
        <div className="px-4 mt-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-success/12 text-success w-fit">
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">GPS activo · prioriza aeropuerto cercano</span>
          </div>
        </div>
      )}

      {/* ─── Conversation area (response bubble + suggestions) ─── */}
      {response && (
        <section className="px-4 mt-6 animate-pop-in">
          <p className="ios-eyebrow">
            {response.source === "claude" ? "Claude" : "Heurística local"}
          </p>
          <div className="ios-card p-5">
            <p className="text-[15px] leading-relaxed">
              <Typewriter text={response.answer} speedCps={75} />
            </p>
            {response.suggestions.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {response.suggestions.map((s, i) => {
                  const tone = s.priority === "critical" ? "alert" : s.priority === "high" ? "warn" : "neutral";
                  const inner = (
                    <div className="flex items-start gap-3 p-3 rounded-2xl hover:bg-accent/40 transition-colors pressable">
                      <Pill tone={tone === "neutral" ? "neutral" : tone} className="shrink-0 mt-0.5">
                        {s.priority}
                      </Pill>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold leading-tight">{s.title}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{s.detail}</p>
                      </div>
                      {s.deep_link && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                    </div>
                  );
                  return (
                    <li key={i}>
                      {s.deep_link ? <Link href={s.deep_link}>{inner}</Link> : inner}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ─── Preset questions (only when no response yet) ─── */}
      {!response && (() => {
        // ─── Contextual quick prompts based on trip state ───
        const ctx = cc;
        const contextual: string[] = [];
        if (ctx) {
          const days = ctx.mode_info.days_until_start;
          if (days > 0 && days < 14) contextual.push("¿Está todo listo para salir?");
          if (ctx.dashboard.tasks_summary.critical_pending > 0) contextual.push("¿Qué tareas críticas tengo abiertas?");
          if (ctx.dashboard.reservations_summary.critical_pending > 0) contextual.push("¿Qué reservas me faltan cerrar?");
          if (ctx.dashboard.budget.percent_used > 70) contextual.push("¿Cómo voy de gasto?");
          if (ctx.quick_access.next_flight) contextual.push(`Dame el boarding de ${ctx.quick_access.next_flight.provider || "mi próximo vuelo"}`);
          if (ctx.trip.destination) contextual.push(`¿Dónde puedo comer en ${ctx.trip.destination}?`);
          if (ctx.dashboard.alerts.length > 0) contextual.push("¿Qué alertas urgentes hay?");
        }
        // Mix contextual + generic, dedup
        const seen = new Set<string>();
        const all = [...contextual, ...PRESET_QUESTIONS].filter(q => {
          if (seen.has(q)) return false;
          seen.add(q);
          return true;
        }).slice(0, 8);
        return (
          <section className="px-4 mt-6">
            <p className="ios-eyebrow">{contextual.length > 0 ? "Basado en tu viaje" : "Empezá con..."}</p>
            <div className="flex flex-wrap gap-2">
              {all.map((q, i) => {
                const isContextual = i < contextual.length;
                return (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    disabled={busy}
                    className={cn(
                      "pressable px-3.5 py-2 rounded-full text-[13px] font-medium transition-all",
                      isContextual
                        ? "bg-primary/12 text-primary ring-1 ring-primary/30 hover:bg-primary/20"
                        : "bg-card ring-1 ring-border hover:ring-primary/40 hover:text-primary",
                      "disabled:opacity-50"
                    )}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ─── Sticky composer at bottom — iMessage style ─── */}
      <form
        onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="fixed left-0 right-0 z-30 px-3 pt-2 pb-2 ios-material-thin border-t border-border/40"
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-md sm:max-w-lg flex gap-2 items-center">
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder={keyConfigured ? "Preguntale lo que necesites..." : "Modo limitado · respuestas básicas"}
            disabled={busy}
            className="h-11 rounded-2xl bg-muted/60 border-transparent text-[15px]"
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || !question.trim()}
            className="h-11 w-11 rounded-2xl"
            variant="gradient"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>

      {/* Bottom safe space (the form is positioned 64px above tab bar) */}
      <div className="h-32" aria-hidden />
    </div>
  );
}

function AssistantSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <div className="h-3 w-20 skeleton rounded mb-2" />
        <div className="h-10 w-40 skeleton rounded-xl" />
      </div>
      <div className="px-4"><div className="h-40 rounded-[var(--radius-xl)] skeleton" /></div>
      <div className="px-4 mt-6 space-y-2 flex flex-wrap gap-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-8 w-32 skeleton rounded-full" />)}
      </div>
    </div>
  );
}
