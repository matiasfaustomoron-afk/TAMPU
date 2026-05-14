"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Sparkles, Loader2, Check, AlertTriangle, Trash2, Plane, Bed, Bus, Shield, Wifi, MapPin, Train, Mail, MessageCircle, X } from "lucide-react";
import { LargeTitle, Sheet } from "@/components/ios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { useActiveTrip, useMutations } from "@/lib/hooks/use-trip-data";
import { withApiKeyHeaders } from "@/lib/ai/user-key";
import { toast } from "@/components/ios/toast";
import { haptic } from "@/lib/native/platform";
import { CURRENCIES, RESERVATION_TYPES, RESERVATION_STATUSES } from "@/lib/config/constants";
import type { Reservation } from "@/lib/types/database";
import type { ParsedBooking } from "@/lib/parsing/email-parser";
import { track, EVENTS } from "@/lib/analytics";
import { Confetti } from "@/components/ios/confetti";
import { HintCard } from "@/components/ios/hint-card";
import { useI18n } from "@/i18n/provider";

// ─── Inbox types ──────────────────────────────────────────────────────────
interface InboxEntry {
  id: string;
  source: "email-ses" | "email-mailgun" | "whatsapp-twilio" | "whatsapp-meta";
  sender: string | null;
  sender_name: string | null;
  subject: string | null;
  carrier_hint: string | null;
  languages: string[] | null;
  bookings_count: number;
  created_at: string;
  parsed_payload: {
    bookings: ParsedBooking[];
    source: string;
    languages_detected: string[];
    carrier_hint: string | null;
    warnings: string[];
  };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const m = Math.floor(ms / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

/**
 * Importar — el aha moment del producto.
 *
 * Flujo:
 *  1. Pegás un email (vuelo, hotel, traslado, paquete Despegar...).
 *  2. Tap "Detectar reservas".
 *  3. La IA o la heurística devuelven 1..N bookings.
 *  4. Ves cards visuales (no formulario frío) con confidence semáforo.
 *  5. Editás campo a campo si querés, deseleccionás los que no, y guardás todos
 *     en una sola pasada.
 *
 * vs TripIt: parsea pt-BR, carriers LatAm, multibooking, sin templates de vendor.
 */

interface ParseResult {
  bookings: ParsedBooking[];
  source: "claude" | "heuristic" | "mixed";
  languages_detected: string[];
  carrier_hint: string | null;
  warnings: string[];
}

const TYPE_ICON: Record<ParsedBooking["type"], React.ReactNode> = {
  flight: <Plane className="w-4 h-4" />,
  accommodation: <Bed className="w-4 h-4" />,
  train: <Train className="w-4 h-4" />,
  bus: <Bus className="w-4 h-4" />,
  tour: <MapPin className="w-4 h-4" />,
  insurance: <Shield className="w-4 h-4" />,
  connectivity: <Wifi className="w-4 h-4" />,
  transfer: <Bus className="w-4 h-4" />,
  other: <Inbox className="w-4 h-4" />,
};

const TYPE_ACCENT: Record<ParsedBooking["type"], string> = {
  flight:        "tampu-icon tampu-icon-indigo",
  accommodation: "tampu-icon tampu-icon-cardon",
  train:         "tampu-icon tampu-icon-cobre",
  bus:           "tampu-icon tampu-icon-cobre",
  tour:          "tampu-icon tampu-icon-mostaza",
  insurance:     "tampu-icon tampu-icon-cardon",
  connectivity:  "tampu-icon tampu-icon-indigo",
  transfer:      "tampu-icon tampu-icon-canela",
  other:         "tampu-icon tampu-icon-piedra",
};

const TYPE_LABEL: Record<ParsedBooking["type"], string> = {
  flight: "Vuelo",
  accommodation: "Alojamiento",
  train: "Tren",
  bus: "Bus",
  tour: "Tour / actividad",
  insurance: "Seguro",
  connectivity: "Conectividad",
  transfer: "Traslado",
  other: "Otra reserva",
};

const CONFIDENCE_LABEL: Record<ParsedBooking["confidence"], string> = {
  high: "Alta confianza",
  medium: "Confianza media",
  low: "Revisá los campos",
};

const CONFIDENCE_TONE: Record<ParsedBooking["confidence"], string> = {
  high: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  low: "bg-destructive/15 text-destructive",
};

export default function ImportPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: trip } = useActiveTrip();
  const { addReservation } = useMutations();

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [committing, setCommitting] = useState(false);
  const [committedCount, setCommittedCount] = useState(0);

  // ─── Inbox (reenvíos por email / whatsapp) ─────────────────────────────
  const [inbox, setInbox] = useState<InboxEntry[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [openEntry, setOpenEntry] = useState<InboxEntry | null>(null);
  const [openSelected, setOpenSelected] = useState<Set<number>>(new Set());

  const refetchInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const res = await fetch("/api/email-inbound");
      if (!res.ok) {
        setInbox([]);
        return;
      }
      const json = (await res.json()) as { ok: boolean; pending?: InboxEntry[] };
      setInbox(json.pending || []);
    } catch {
      setInbox([]);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchInbox();
  }, [refetchInbox]);

  // Auto-load del Share Extension: si llegamos acá vía tampu://import-shared,
  // sessionStorage tiene el texto que el user compartió desde Mail/WhatsApp.
  useEffect(() => {
    try {
      const shared = sessionStorage.getItem("tampu-pending-share-text");
      if (shared && shared.length >= 20) {
        setText(shared);
        sessionStorage.removeItem("tampu-pending-share-text");
        track(EVENTS.IMPORT_PASTED, { source: "share-extension", length: shared.length });
      }
    } catch { /* ignore */ }
  }, []);

  const canParse = text.trim().length >= 20;
  const totalBookings = result?.bookings.length ?? 0;
  const selectedCount = selected.size;

  // ─── Parse ─────────────────────────────────────────────────────────────
  const parse = useCallback(async () => {
    if (!canParse) return;
    track(EVENTS.IMPORT_PASTED, { length: text.length });
    setParsing(true);
    setResult(null);
    setCommittedCount(0);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      const res = await fetch(`${base}/api/parse-email-confirmation`, {
        method: "POST",
        headers: withApiKeyHeaders(),
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast(err.error || "No se pudo parsear", "error");
        return;
      }
      const json = (await res.json()) as ParseResult;
      setResult(json);
      track(EVENTS.IMPORT_PARSED, { count: json.bookings.length, source: json.source });
      // Auto-select all bookings with confidence high or medium
      const autoSel = new Set<number>();
      json.bookings.forEach((b, i) => {
        if (b.confidence !== "low") autoSel.add(i);
      });
      setSelected(autoSel);

      if (json.bookings.length === 0) {
        toast("No detectamos reservas en este texto", "info");
      } else {
        toast(
          `${json.bookings.length} ${json.bookings.length === 1 ? "reserva detectada" : "reservas detectadas"} · ${json.source === "claude" ? "IA" : "heurística"}`,
          "success"
        );
        haptic("medium");
      }
    } catch (err) {
      console.error(err);
      toast("Error al conectar con el parser", "error");
    } finally {
      setParsing(false);
    }
  }, [text, canParse]);

  // ─── Toggle select ─────────────────────────────────────────────────────
  const toggle = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  // ─── Edit one booking inline ───────────────────────────────────────────
  const updateBooking = useCallback((idx: number, patch: Partial<ParsedBooking>) => {
    setResult((prev) => {
      if (!prev) return prev;
      const bookings = [...prev.bookings];
      bookings[idx] = { ...bookings[idx], ...patch };
      return { ...prev, bookings };
    });
  }, []);

  // ─── Commit selected bookings as Reservations ──────────────────────────
  const commit = useCallback(async () => {
    if (!result || !trip || selectedCount === 0) return;
    setCommitting(true);
    track(EVENTS.IMPORT_SAVED, { count: selectedCount });
    let ok = 0;
    for (const idx of selected) {
      const b = result.bookings[idx];
      try {
        await addReservation({
          trip_id: trip.id,
          type: b.type as Reservation["type"],
          criticality: "important",
          provider: b.provider || "Sin proveedor",
          city_id: null,
          city_name: b.city_name,
          description: b.description || `${TYPE_LABEL[b.type]} ${b.provider}`,
          purchase_date: null,
          use_date: b.use_date,
          use_end_date: b.use_end_date,
          payment_deadline: b.payment_deadline,
          original_amount: b.original_amount || 0,
          original_currency: b.original_currency || trip.base_currency,
          exchange_rate: 1,
          base_amount: b.original_amount || 0,
          status: b.status as Reservation["status"],
          confirmation_received: b.status === "confirmed" || b.status === "paid",
          locator: b.locator,
          link: null,
          contact: b.contact,
          cancellation_policy: b.cancellation_policy,
          is_cancellable: b.is_cancellable ?? false,
          notes: b.notes || null,
        });
        ok++;
      } catch (err) {
        console.error(`commit booking ${idx} failed:`, err);
      }
    }
    setCommitting(false);
    setCommittedCount(ok);
    haptic("medium");
    if (ok > 0) {
      toast(
        `${ok} ${ok === 1 ? "reserva guardada" : "reservas guardadas"} en tu viaje`,
        "success"
      );
    }
  }, [result, trip, selected, selectedCount, addReservation]);

  // ─── Inbox commit / dismiss ────────────────────────────────────────────
  const commitInboxEntry = useCallback(async () => {
    if (!openEntry || !trip || openSelected.size === 0) return;
    let ok = 0;
    for (const idx of openSelected) {
      const b = openEntry.parsed_payload.bookings[idx];
      try {
        await addReservation({
          trip_id: trip.id,
          type: b.type as Reservation["type"],
          criticality: "important",
          provider: b.provider || "Sin proveedor",
          city_id: null,
          city_name: b.city_name,
          description: b.description || `${TYPE_LABEL[b.type]} ${b.provider}`,
          purchase_date: null,
          use_date: b.use_date,
          use_end_date: b.use_end_date,
          payment_deadline: b.payment_deadline,
          original_amount: b.original_amount || 0,
          original_currency: b.original_currency || trip.base_currency,
          exchange_rate: 1,
          base_amount: b.original_amount || 0,
          status: b.status as Reservation["status"],
          confirmation_received: b.status === "confirmed" || b.status === "paid",
          locator: b.locator,
          link: null,
          contact: b.contact,
          cancellation_policy: b.cancellation_policy,
          is_cancellable: b.is_cancellable ?? false,
          notes: b.notes || null,
        });
        ok++;
      } catch (err) {
        console.error(`commit inbox booking ${idx} failed:`, err);
      }
    }
    if (ok > 0) {
      try {
        await fetch("/api/email-inbound", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: openEntry.id, action: "commit", trip_id: trip.id }),
        });
      } catch (err) {
        console.error("PATCH commit failed:", err);
      }
      track(EVENTS.IMPORT_SAVED, { count: ok, source: openEntry.source });
      toast(`${ok} ${ok === 1 ? "reserva guardada" : "reservas guardadas"} desde la bandeja`, "success");
      haptic("medium");
    }
    setOpenEntry(null);
    setOpenSelected(new Set());
    refetchInbox();
  }, [openEntry, trip, openSelected, addReservation, refetchInbox]);

  const dismissInboxEntry = useCallback(async (id: string) => {
    try {
      await fetch("/api/email-inbound", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "dismiss" }),
      });
    } catch (err) {
      console.error("dismiss failed:", err);
    }
    setOpenEntry(null);
    setOpenSelected(new Set());
    refetchInbox();
  }, [refetchInbox]);

  // Auto-select cuando se abre una entry: bookings con confianza >= medium
  useEffect(() => {
    if (!openEntry) return;
    const sel = new Set<number>();
    openEntry.parsed_payload.bookings.forEach((b, i) => {
      if (b.confidence !== "low") sel.add(i);
    });
    setOpenSelected(sel);
  }, [openEntry]);

  // ─── Render: success state ─────────────────────────────────────────────
  const showSuccess = committedCount > 0;

  // ─── Edit sheet content ────────────────────────────────────────────────
  const editing = editingIdx !== null && result ? result.bookings[editingIdx] : null;

  // Header subtitle
  const subtitle = useMemo(() => {
    if (showSuccess) return "Listo · revisalas en tu viaje";
    if (!result) return "Pegá un email y la IA detecta tus reservas";
    if (totalBookings === 0) return "Probá con otro texto";
    const lang = result.languages_detected[0];
    const carrier = result.carrier_hint;
    return [
      `${totalBookings} ${totalBookings === 1 ? "reserva" : "reservas"} detectada${totalBookings === 1 ? "" : "s"}`,
      carrier ? carrier : null,
      lang === "es" ? "español" : lang === "pt" ? "portugués" : lang === "en" ? "inglés" : lang === "fr" ? "francés" : lang === "it" ? "italiano" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [result, totalBookings, showSuccess]);

  return (
    <div className="animate-fade-in pb-24">
      <LargeTitle eyebrow="Documentos" title="Importar" serif />
      <p className="px-5 -mt-4 text-[13px] text-muted-foreground leading-relaxed">{subtitle}</p>

      {/* ─── Acceso rápido a la bandeja per-trip (/inbox) ─── */}
      {trip && (
        <section className="px-4 mt-6">
          <a
            href="/inbox"
            className="ios-card p-4 pressable flex items-start gap-3.5 hover:bg-accent/30 transition-colors"
          >
            <span className="w-11 h-11 rounded-2xl tampu-icon tampu-icon-indigo flex items-center justify-center shrink-0">
              <Inbox className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground">
                {t.import.bandejaPerTripTitle}
              </p>
              <p className="text-[15px] font-semibold leading-tight mt-0.5">
                Bandeja de emails de {trip.name}
              </p>
              <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">
                {t.import.bandejaPerTripBody}
              </p>
            </div>
            <span className="text-[12px] font-semibold text-primary shrink-0 mt-1">{t.import.openInbox}</span>
          </a>
        </section>
      )}

      {/* ─── Bandeja de reenvíos (plans@tampu.app / WhatsApp) ─── */}
      {(inbox.length > 0 || inboxLoading) && (
        <section className="px-4 mt-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="ios-eyebrow flex items-center gap-2">
              <Inbox className="w-3 h-3" />
              Bandeja{inbox.length > 0 ? ` · ${inbox.length}` : ""}
            </p>
            {inboxLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="space-y-2 stagger-grid">
            {inbox.map((entry) => {
              const isEmail = entry.source.startsWith("email-");
              return (
                <button
                  key={entry.id}
                  onClick={() => setOpenEntry(entry)}
                  className="ios-card p-4 pressable w-full text-left"
                  aria-label={`Bandeja: ${entry.bookings_count} reservas detectadas`}
                >
                  <div className="flex items-start gap-3.5">
                    <span
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                        isEmail ? "tampu-icon tampu-icon-indigo" : "tampu-icon tampu-icon-cardon"
                      }`}
                    >
                      {isEmail ? <Mail className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground">
                          {isEmail ? "Email reenviado" : "WhatsApp reenviado"}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                      <p className="text-[15px] font-semibold leading-tight mt-1 truncate">
                        {entry.subject || entry.sender_name || entry.sender || "Reenvío"}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                        {[
                          `${entry.bookings_count} ${entry.bookings_count === 1 ? "reserva" : "reservas"} detectada${entry.bookings_count === 1 ? "" : "s"}`,
                          entry.carrier_hint,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="text-[12px] font-semibold text-primary shrink-0">Revisar →</span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 px-1 leading-relaxed">
            Reenviá tus emails de confirmación a <strong className="text-foreground">plans@tampu.app</strong> y aparecen acá automáticamente.
          </p>
        </section>
      )}

      {/* ─── State A: success splash con confetti ─── */}
      <Confetti trigger={showSuccess} />
      {showSuccess && (
        <section className="px-4 mt-8 animate-fade-in">
          <div className="ios-card p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-3xl tampu-gradient-cardon flex items-center justify-center mb-4 shadow-[var(--shadow-floating)] heart-pop">
              <Check className="w-8 h-8 text-white" strokeWidth={2.4} />
            </div>
            <h2 className="font-serif text-3xl">{t.import.importedTitle}</h2>
            <p className="text-[14px] text-muted-foreground mt-2 max-w-sm mx-auto">
              {committedCount === 1
                ? t.import.importedBody
                : `${committedCount} reservas ya están en tu viaje.`}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setText("");
                  setResult(null);
                  setSelected(new Set());
                  setCommittedCount(0);
                }}
              >
                {t.import.importAnother}
              </Button>
              <Button onClick={() => router.push("/itinerary")} className="tampu-gradient-warm text-white">
                {t.import.viewMyTrip}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ─── State B: paste box ─── */}
      {!result && !showSuccess && (
        <section className="px-4 mt-6 space-y-3">
          {inbox.length === 0 && (
            <>
              <HintCard hintId="import-first-time" delay={50} />
              <HintCard hintId="whatsapp-forward" delay={200} />
            </>
          )}
          <div className="ios-card p-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Pegá acá un email de confirmación. Funciona con:\n· LATAM, Aerolineas, Gol, Avianca, Copa, JetSmart, Sky\n· Despegar / Decolar / Almundo (paquetes completos)\n· Airbnb, Booking, hoteles\n· Seguros, transfers, eSIM, tours\n· En español, portugués, inglés, francés, italiano`}
              className="min-h-[200px] text-[13px] leading-relaxed border-0 bg-transparent resize-none focus-visible:ring-0"
              aria-label="Texto del email a parsear"
            />
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <span className="text-[11px] text-muted-foreground">{text.length} caracteres</span>
              <Button
                onClick={parse}
                disabled={!canParse || parsing}
                className="tampu-gradient-warm text-white gap-2"
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Leyendo…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {t.import.detectReservas}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed px-1">
            Con tu key de IA conectada (en Ajustes), la lectura es 10x más precisa y
            maneja idiomas mezclados. Sin key, usamos heurística local que sirve para los
            casos típicos. <strong className="text-foreground">El texto del email nunca se guarda en servidor.</strong>
          </p>
        </section>
      )}

      {/* ─── State C: review bookings ─── */}
      {result && !showSuccess && result.bookings.length > 0 && (
        <>
          <section className="px-4 mt-6 space-y-2">
            <p className="ios-eyebrow">Detectadas</p>
            <div className="space-y-2 stagger-grid">
            {result.bookings.map((b, i) => {
              const isSel = selected.has(i);
              return (
                <div
                  key={i}
                  className={`ios-card p-4 pressable transition-all ${
                    isSel ? "ring-2 ring-primary" : "opacity-60"
                  }`}
                  onClick={() => toggle(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(i);
                    }
                  }}
                  aria-pressed={isSel}
                  aria-label={`${TYPE_LABEL[b.type]} de ${b.provider}, ${isSel ? "seleccionada" : "no seleccionada"}`}
                >
                  <div className="flex items-start gap-3.5">
                    <span
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                        TYPE_ACCENT[b.type]
                      }`}
                    >
                      {TYPE_ICON[b.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground">
                          {TYPE_LABEL[b.type]}
                        </p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            CONFIDENCE_TONE[b.confidence]
                          }`}
                        >
                          {CONFIDENCE_LABEL[b.confidence]}
                        </span>
                      </div>
                      <p className="text-[15px] font-semibold leading-tight mt-1 truncate">
                        {b.description || b.provider}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                        {[
                          b.provider !== b.description ? b.provider : null,
                          b.use_date,
                          b.locator ? `#${b.locator}` : null,
                          b.original_amount > 0
                            ? `${b.original_currency} ${b.original_amount.toLocaleString()}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingIdx(i);
                      }}
                      className="text-[12px] font-semibold text-primary shrink-0 px-2 py-1 rounded-md hover:bg-primary/10 pressable"
                      aria-label="Editar campos"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </section>

          {/* Warnings, if any */}
          {result.warnings.length > 0 && (
            <section className="px-4 mt-4">
              <div className="ios-card p-3 flex items-start gap-2 bg-warning/10 border border-warning/30">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="text-[11.5px] text-muted-foreground leading-snug">
                  {result.warnings.join(" · ")}
                </div>
              </div>
            </section>
          )}

          {/* Action bar */}
          <section className="px-4 mt-6 sticky bottom-[80px] z-10">
            <div className="ios-material rounded-2xl p-3 shadow-[var(--shadow-floating)] flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setText("");
                  setResult(null);
                  setSelected(new Set());
                }}
                aria-label="Empezar de nuevo"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                onClick={commit}
                disabled={selectedCount === 0 || committing || !trip}
                className="flex-1 tampu-gradient-warm text-white"
              >
                {committing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Guardando…
                  </>
                ) : selectedCount === 0 ? (
                  "Elegí al menos una"
                ) : (
                  `Guardar ${selectedCount} ${selectedCount === 1 ? "reserva" : "reservas"}`
                )}
              </Button>
            </div>
          </section>

          {!trip && (
            <p className="text-[11px] text-destructive text-center mt-4 px-4">
              Necesitás un viaje activo. Andá a Viaje → Cambiar de viaje.
            </p>
          )}
        </>
      )}

      {/* ─── State D: 0 bookings detected ─── */}
      {result && !showSuccess && result.bookings.length === 0 && (
        <section className="px-4 mt-8">
          <div className="ios-card p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl tampu-icon tampu-icon-piedra flex items-center justify-center mb-4">
              <Inbox className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-2xl">No detectamos reservas</h2>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-sm mx-auto">
              El texto que pegaste no parece un email de confirmación. Probá con el cuerpo
              completo del email (no solo el asunto), o con tu key de IA conectada para
              mejor precisión.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
              }}
              className="mt-5"
            >
              Volver a probar
            </Button>
          </div>
        </section>
      )}

      {/* ─── Bandeja: preview de la entry y commit selectivo ─── */}
      <Sheet
        open={openEntry !== null}
        onClose={() => {
          setOpenEntry(null);
          setOpenSelected(new Set());
        }}
        title={openEntry?.source.startsWith("email-") ? "Email reenviado" : "WhatsApp reenviado"}
      >
        {openEntry && (
          <div className="space-y-3 pb-4">
            <div className="text-[12.5px] text-muted-foreground leading-relaxed">
              {openEntry.subject && <p className="font-semibold text-foreground">{openEntry.subject}</p>}
              <p>{[openEntry.sender_name, openEntry.sender, openEntry.carrier_hint].filter(Boolean).join(" · ")}</p>
            </div>

            {openEntry.parsed_payload.bookings.length === 0 ? (
              <div className="ios-card p-4 text-center">
                <p className="text-[13px] text-muted-foreground">No detectamos reservas en este reenvío.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {openEntry.parsed_payload.bookings.map((b, i) => {
                  const isSel = openSelected.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setOpenSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                      className={`ios-card p-3 pressable w-full text-left transition-all ${
                        isSel ? "ring-2 ring-primary" : "opacity-60"
                      }`}
                      aria-pressed={isSel}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TYPE_ACCENT[b.type]}`}>
                          {TYPE_ICON[b.type]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                            {TYPE_LABEL[b.type]}
                          </p>
                          <p className="text-[14px] font-semibold leading-tight truncate">
                            {b.description || b.provider}
                          </p>
                          <p className="text-[11.5px] text-muted-foreground truncate">
                            {[b.use_date, b.locator ? `#${b.locator}` : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" onClick={() => dismissInboxEntry(openEntry.id)} className="gap-1">
                <X className="w-4 h-4" />
                Descartar
              </Button>
              <Button
                onClick={commitInboxEntry}
                disabled={openSelected.size === 0 || !trip}
                className="tampu-gradient-warm text-white"
              >
                {openSelected.size === 0
                  ? "Elegí al menos una"
                  : `Guardar ${openSelected.size}`}
              </Button>
            </div>
            {!trip && (
              <p className="text-[11px] text-destructive text-center">
                Activá un viaje en Viaje → Cambiar para poder importar.
              </p>
            )}
          </div>
        )}
      </Sheet>

      {/* ─── Inline editor (Sheet) ─── */}
      <Sheet
        open={editingIdx !== null && editing !== null}
        onClose={() => setEditingIdx(null)}
        title={editing ? `Editar · ${TYPE_LABEL[editing.type]}` : ""}
      >
        {editing && editingIdx !== null && (
          <div className="space-y-3 pb-4">
            <Field label="Tipo">
              <SelectNative
                value={editing.type}
                onChange={(e) =>
                  updateBooking(editingIdx, { type: e.target.value as ParsedBooking["type"] })
                }
              >
                {RESERVATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="transfer">Traslado</option>
                <option value="connectivity">Conectividad</option>
              </SelectNative>
            </Field>
            <Field label="Proveedor">
              <Input
                value={editing.provider}
                onChange={(e) => updateBooking(editingIdx, { provider: e.target.value })}
              />
            </Field>
            <Field label="Descripción">
              <Input
                value={editing.description}
                onChange={(e) => updateBooking(editingIdx, { description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha uso">
                <Input
                  type="date"
                  value={editing.use_date || ""}
                  onChange={(e) =>
                    updateBooking(editingIdx, { use_date: e.target.value || null })
                  }
                />
              </Field>
              <Field label="Fecha fin">
                <Input
                  type="date"
                  value={editing.use_end_date || ""}
                  onChange={(e) =>
                    updateBooking(editingIdx, { use_end_date: e.target.value || null })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Monto" className="col-span-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={editing.original_amount}
                  onChange={(e) =>
                    updateBooking(editingIdx, {
                      original_amount: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Moneda">
                <SelectNative
                  value={editing.original_currency}
                  onChange={(e) =>
                    updateBooking(editingIdx, { original_currency: e.target.value })
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </SelectNative>
              </Field>
            </div>
            <Field label="Localizador">
              <Input
                value={editing.locator || ""}
                onChange={(e) =>
                  updateBooking(editingIdx, { locator: e.target.value || null })
                }
                placeholder="PNR / código"
              />
            </Field>
            <Field label="Estado">
              <SelectNative
                value={editing.status}
                onChange={(e) =>
                  updateBooking(editingIdx, {
                    status: e.target.value as ParsedBooking["status"],
                  })
                }
              >
                {RESERVATION_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Button onClick={() => setEditingIdx(null)} className="w-full mt-2">
              Listo
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
