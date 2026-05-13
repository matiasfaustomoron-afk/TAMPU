"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { Sheet, Pill } from "@/components/ios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectNative } from "@/components/ui/select-native";
import { Typewriter } from "@/components/ios/typewriter";
import { Sparkles, Loader2, Check, AlertCircle, X, ChevronRight, RefreshCw, Settings, KeyRound } from "lucide-react";
import { generateItinerary, type Interest, type Pace, type DraftItinerary } from "@/lib/ai/itinerary-generator";
import { hasUserApiKey, getUserProvider } from "@/lib/ai/user-key";
import { toast } from "@/components/ios/toast";
import { haptic } from "@/lib/native/platform";
import type { Trip } from "@/lib/types/database";

const INTERESTS: Array<{ value: Interest; label: string; emoji: string }> = [
  { value: "foodie",    label: "Foodie",     emoji: "🍜" },
  { value: "adventure", label: "Aventura",   emoji: "🏔️" },
  { value: "culture",   label: "Cultura",    emoji: "🏛️" },
  { value: "relax",     label: "Relax",      emoji: "🧘" },
  { value: "nightlife", label: "Fiesta",     emoji: "🌃" },
  { value: "nature",    label: "Naturaleza", emoji: "🌿" },
  { value: "shopping",  label: "Shopping",   emoji: "🛍️" },
  { value: "history",   label: "Historia",   emoji: "📜" },
  { value: "art",       label: "Arte",       emoji: "🎨" },
];

const PACES: Array<{ value: Pace; label: string; sub: string }> = [
  { value: "slow",   label: "Tranquilo", sub: "3-4 actividades/día" },
  { value: "medium", label: "Balanceado", sub: "4-5 actividades/día" },
  { value: "fast",   label: "Intenso",   sub: "6+ actividades/día" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  trip: Trip;
  /** Si se pasan `selectedDates`, el caller solo recibe los días filtrados. */
  onCommit: (it: DraftItinerary, selectedDates?: Set<string>) => Promise<void>;
  /** Cuántos días del trip ya tienen plan. Si >50%, se muestra warning al commit. */
  plannedRatio?: number;
}

/**
 * <AIGeneratorSheet /> — sheet con form + preview de itinerario generado.
 *
 * Flow:
 *   1. Step "form": user ajusta inputs (prefill con trip activo).
 *   2. Loading: spinner + typewriter mensaje cinematográfico.
 *   3. Step "preview": muestra los días generados con costos.
 *   4. Submit: el callback onCommit recibe el DraftItinerary y lo persiste.
 */
export function AIGeneratorSheet({ open, onClose, trip, onCommit, plannedRatio = 0 }: Props) {
  const [step, setStep] = useState<"form" | "loading" | "preview" | "error">("form");

  // Form state
  const [budget, setBudget] = useState<string>(trip.total_budget > 0 ? String(trip.total_budget) : "");
  const [currency, setCurrency] = useState<string>(trip.base_currency || "USD");
  const [interests, setInterests] = useState<Set<Interest>>(new Set(["culture", "foodie"]));
  const [pace, setPace] = useState<Pace>("medium");
  const [notes, setNotes] = useState("");

  // Preview state
  const [draft, setDraft] = useState<DraftItinerary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  /** Días seleccionados para insertar. Default = todos. */
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  // Detect API key (re-check on each open). Si no hay, mostramos CTA a /settings.
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [providerLabel, setProviderLabel] = useState<string>("");
  useEffect(() => {
    if (!open) return;
    const k = hasUserApiKey();
    setHasKey(k);
    const p = getUserProvider();
    setProviderLabel(p === "anthropic" ? "Claude" : p === "gemini" ? "Gemini" : "");
  }, [open]);

  const toggleInterest = useCallback((i: Interest) => {
    setInterests(s => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!trip.destination) return;
    setStep("loading");
    setError(null);
    haptic("medium");
    const result = await generateItinerary({
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      budgetTotal: parseFloat(budget) || 0,
      budgetCurrency: currency,
      interests: Array.from(interests),
      pace,
      notes: notes.trim() || undefined,
      language: "es",
    });
    if (!result.ok || !result.itinerary) {
      setError(result.error || "No pudimos generar el plan");
      setStep("error");
      return;
    }
    setDraft(result.itinerary);
    // Selección default: TODOS los días
    setSelectedDates(new Set(result.itinerary.days.map(d => d.date)));
    setStep("preview");
    haptic("light");
  }, [trip, budget, currency, interests, pace, notes]);

  const handleCommit = useCallback(async () => {
    if (!draft) return;
    // Confirmación si >50% del trip ya está planeado (spec)
    if (plannedRatio > 0.5) {
      const ok = typeof window === "undefined"
        ? true
        : window.confirm("Esto va a sobrescribir tus días planeados. ¿Continuar?");
      if (!ok) return;
    }
    setCommitting(true);
    try {
      // Si el user deseleccionó algunos días, mandamos solo los seleccionados.
      const allSelected = selectedDates.size === draft.days.length;
      await onCommit(draft, allSelected ? undefined : selectedDates);
      toast(
        allSelected
          ? "Itinerario completo insertado en tu viaje"
          : `${selectedDates.size} día${selectedDates.size === 1 ? "" : "s"} insertado${selectedDates.size === 1 ? "" : "s"}`,
        "success"
      );
      haptic("medium");
      onClose();
      // Reset state for next time
      setStep("form");
      setDraft(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al insertar", "warn");
    } finally {
      setCommitting(false);
    }
  }, [draft, onCommit, onClose, selectedDates, plannedRatio]);

  const handleReset = useCallback(() => {
    setStep("form");
    setDraft(null);
    setError(null);
    setSelectedDates(new Set());
  }, []);

  const handleRegenerate = useCallback(async () => {
    // Volvemos al form para que el user ajuste y dispare de nuevo. Mantenemos
    // las preferencias actuales (intereses, pace, notes) intactas para iteración rápida.
    setStep("form");
    setDraft(null);
    setError(null);
    setSelectedDates(new Set());
    haptic("light");
  }, []);

  const toggleDay = useCallback((date: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const toggleAllDays = useCallback(() => {
    if (!draft) return;
    setSelectedDates(prev => {
      if (prev.size === draft.days.length) return new Set();
      return new Set(draft.days.map(d => d.date));
    });
  }, [draft]);

  const totalDays = useMemo(() => {
    const s = new Date(`${trip.start_date}T00:00:00`);
    const e = new Date(`${trip.end_date}T00:00:00`);
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
  }, [trip.start_date, trip.end_date]);

  return (
    <Sheet open={open} onClose={onClose} title="Generar plan con IA">
      {step === "form" && (
        <div className="space-y-4 pb-2 animate-fade-in">
          <div className="ios-card p-3 bg-primary/5">
            <p className="text-[12.5px] leading-relaxed">
              <Sparkles className="w-3.5 h-3.5 inline mr-1 text-primary" />
              <strong>{trip.destination}</strong> · {totalDays} días · {trip.start_date} → {trip.end_date}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {hasKey
                ? <>Usaremos tu key de <strong>{providerLabel}</strong> conectada en /settings.</>
                : <>Sin key conectada: plan genérico local (calidad limitada).</>}
            </p>
          </div>

          {/* CTA conectar key — solo si no hay */}
          {!hasKey && (
            <div className="ios-card p-3 border border-warning/30 bg-warning/8 flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold leading-tight">
                  Conectá tu IA gratis para resultados 10x mejores
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Google Gemini tiene un free tier que alcanza para varios planes/mes.
                </p>
                <Link href="/settings" className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold text-primary">
                  <Settings className="w-3 h-3" /> Ir a Ajustes
                </Link>
              </div>
            </div>
          )}
          {plannedRatio > 0.5 && (
            <div className="ios-card p-3 border border-warning/30 bg-warning/8 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                Ya tenés más del 50% de los días planeados. Al insertar el plan IA te vamos
                a pedir confirmación antes de pisar nada en modo replace.
              </p>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Intereses (tocá los que aplican)</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {INTERESTS.map(i => {
                const active = interests.has(i.value);
                return (
                  <button
                    key={i.value}
                    onClick={() => toggleInterest(i.value)}
                    className={
                      "pressable inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground/80")
                    }
                  >
                    <span>{i.emoji}</span> {i.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Ritmo</label>
            <div className="flex gap-2 mt-1.5">
              {PACES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPace(p.value)}
                  className={
                    "pressable flex-1 rounded-2xl border p-2.5 text-left transition-colors " +
                    (pace === p.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30")
                  }
                >
                  <p className="text-[13px] font-semibold">{p.label}</p>
                  <p className="text-[10.5px] text-muted-foreground">{p.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Presupuesto (opcional)</label>
              <Input
                type="number"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                placeholder="0 = sin límite"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Moneda</label>
              <SelectNative value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="ARS">ARS</option>
                <option value="BRL">BRL</option>
                <option value="MXN">MXN</option>
                <option value="CLP">CLP</option>
                <option value="KRW">KRW</option>
                <option value="JPY">JPY</option>
                <option value="GBP">GBP</option>
              </SelectNative>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
              Notas extra (opcional)
            </label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej. viajo con dos chicos chicos / vegetarianos / me gustan los museos"
              rows={2}
            />
          </div>

          <Button
            onClick={handleGenerate}
            size="lg"
            className="w-full gap-2"
            disabled={interests.size === 0 || !trip.destination}
          >
            <Sparkles className="w-4 h-4" /> Generar
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {step === "loading" && (
        <div className="py-12 text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <p className="text-[15px] font-semibold">Pensando tu viaje a {trip.destination}…</p>
          <Typewriter
            className="text-[12.5px] text-muted-foreground leading-relaxed block max-w-xs mx-auto"
            text={`Considerando intereses, ritmo y presupuesto. Esto puede tomar 20-40 segundos con Claude/Gemini.`}
            speedCps={50}
          />
        </div>
      )}

      {step === "error" && (
        <div className="py-8 text-center space-y-3 animate-fade-in">
          <AlertCircle className="w-10 h-10 mx-auto text-warning" />
          <p className="text-[15px] font-semibold">No pudimos generar el plan</p>
          <p className="text-[12px] text-muted-foreground">{error}</p>
          <Button onClick={handleReset} variant="outline">Volver al form</Button>
        </div>
      )}

      {step === "preview" && draft && (
        <div className="space-y-3 pb-2 animate-fade-in">
          <div className="ios-card p-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold">
                Plan generado · {draft.total_days} días
              </p>
              <p className="text-[11px] text-muted-foreground">
                ~{Math.round(draft.total_estimated_cost).toLocaleString()} {draft.currency}{" "}
                · {draft.generated_by === "heuristic" ? "local (sin LLM)" : draft.generated_by}
              </p>
            </div>
            {draft.generated_by === "heuristic" && (
              <Pill tone="warn">draft</Pill>
            )}
          </div>

          {/* Per-day selection summary */}
          <div className="flex items-center justify-between px-1">
            <p className="text-[11.5px] text-muted-foreground">
              Insertando <strong className="text-foreground">{selectedDates.size}</strong> de {draft.days.length} días
            </p>
            <button
              onClick={toggleAllDays}
              className="pressable text-[11.5px] font-semibold text-primary"
            >
              {selectedDates.size === draft.days.length ? "Deseleccionar todos" : "Seleccionar todos"}
            </button>
          </div>

          <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
            {draft.days.map(d => {
              const isSel = selectedDates.has(d.date);
              return (
                <div
                  key={d.day_number}
                  className={
                    "ios-card transition-opacity " +
                    (isSel ? "" : "opacity-50")
                  }
                >
                  <div className="flex items-start gap-2 p-3 pb-0">
                    <label className="flex items-center pt-0.5 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleDay(d.date)}
                        className="w-4 h-4"
                        aria-label={`Incluir Día ${d.day_number}`}
                      />
                    </label>
                    <details className="flex-1 min-w-0" open={d.day_number <= 2}>
                      <summary className="cursor-pointer list-none flex items-center gap-2 flex-wrap">
                        <span className="font-serif text-lg leading-none">Día {d.day_number}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{d.date}</span>
                        {d.zone && <Pill tone="neutral" className="!text-[10px]">{d.zone}</Pill>}
                        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                          {Math.round(d.total_estimated_cost).toLocaleString()} {draft.currency}
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-1.5 pb-3">
                        {d.activities.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12.5px]">
                            <span className="text-muted-foreground tabular-nums w-10 shrink-0">{a.time}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium leading-tight">{a.title}</p>
                              <p className="text-[11px] text-muted-foreground">{a.description}</p>
                            </div>
                            {a.estimated_cost > 0 && (
                              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                                {Math.round(a.estimated_cost).toLocaleString()}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {d.accommodation_suggestion && (
                        <p className="text-[11px] text-muted-foreground italic mt-1 pb-2">
                          Dormís: {d.accommodation_suggestion}
                        </p>
                      )}
                    </details>
                  </div>
                </div>
              );
            })}
          </div>

          {draft.tips.length > 0 && (
            <div className="ios-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tips</p>
              <ul className="space-y-1 text-[12px]">
                {draft.tips.map((t, i) => <li key={i}>· {t}</li>)}
              </ul>
            </div>
          )}

          {/* Action bar */}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleReset} variant="outline" size="sm" className="gap-1" aria-label="Descartar plan">
              <X className="w-4 h-4" />
            </Button>
            <Button onClick={handleRegenerate} variant="outline" size="sm" className="gap-1">
              <RefreshCw className="w-4 h-4" /> Regenerar
            </Button>
            <Button
              onClick={handleCommit}
              disabled={committing || selectedDates.size === 0}
              size="lg"
              className="flex-1 gap-1"
            >
              <Check className="w-4 h-4" />
              {committing
                ? "Insertando…"
                : selectedDates.size === draft.days.length
                ? "Insertar todo"
                : `Insertar ${selectedDates.size} día${selectedDates.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
