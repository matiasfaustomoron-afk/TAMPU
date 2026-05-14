"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  ExternalLink,
  Plane,
  Hotel,
  Ticket,
  Bus,
  StickyNote,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { SectionHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { reportError, describeError } from "@/lib/utils/errors";

interface WhatsAppMessageRow {
  id: string;
  twilio_message_sid: string;
  direction: "inbound" | "outbound";
  phone_e164: string;
  body: string | null;
  status: "received" | "parsed" | "failed" | "ignored" | "verification" | "outbound";
  trip_id: string | null;
  parsed_json: { type?: string; confidence?: string; data?: Record<string, unknown> } | null;
  parser_provider: string | null;
  cost_usd: number | null;
  error_message: string | null;
  received_at: string;
  parsed_at: string | null;
  media_count: number;
  auto_inserted_item_id: string | null;
  auto_insert_skipped_reason: string | null;
}

interface TripOption {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
}

const SKIP_REASON_LABEL: Record<string, string> = {
  low_confidence: "No estaba 100% seguro — confirmalo vos.",
  no_active_trip: "Necesitás crear un viaje primero.",
  multiple_trips_ambiguous: "Tenés varios viajes activos, elegí cuál.",
  unknown_location: "No reconocí el lugar — completalo en la app.",
  unsupported_type: "No es del tipo que auto-agrego (vuelo/hotel/etc).",
  missing_required_field: "Faltaba info clave — confirmalo manualmente.",
  idempotent_skip: "Ya estaba agregado.",
  insert_failed: "Algo falló al guardarlo — reintentá manualmente.",
};

interface StatusResponse {
  linked: boolean;
  pending?: boolean;
  phone_e164?: string;
  verified_at?: string;
}

type StatusFilter = "all" | "parsed" | "received" | "failed" | "ignored";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "parsed", label: "Parseados" },
  { id: "received", label: "Pendientes" },
  { id: "failed", label: "Errores" },
  { id: "ignored", label: "Ignorados" },
];

function typeIcon(type?: string) {
  switch (type) {
    case "flight": return Plane;
    case "hotel": return Hotel;
    case "reservation": return Ticket;
    case "transport": return Bus;
    case "note": return StickyNote;
    default: return HelpCircle;
  }
}

function statusBadge(status: WhatsAppMessageRow["status"]) {
  const map = {
    parsed: { color: "bg-success/15 text-success", icon: CheckCircle2, label: "Parseado" },
    received: { color: "bg-warning/15 text-warning", icon: Clock, label: "Pendiente" },
    failed: { color: "bg-destructive/15 text-destructive", icon: AlertCircle, label: "Error" },
    ignored: { color: "bg-muted text-muted-foreground", icon: XCircle, label: "Ignorado" },
    verification: { color: "bg-primary/15 text-primary", icon: CheckCircle2, label: "Verificación" },
    outbound: { color: "bg-muted text-muted-foreground", icon: MessageCircle, label: "Enviado" },
  } as const;
  return map[status];
}

function formatPhoneForDisplay(e164: string): string {
  // Formato mínimo legible — el detalle lo deja la UI.
  return e164;
}

function summarizeParsed(parsedJson: WhatsAppMessageRow["parsed_json"]): string {
  if (!parsedJson || !parsedJson.data) return "—";
  const d = parsedJson.data as Record<string, string | number | undefined>;
  switch (parsedJson.type) {
    case "flight":
      return `${d.airline ?? ""} ${d.flight_number ?? ""} ${d.from_iata ?? d.from_city ?? "?"}→${d.to_iata ?? d.to_city ?? "?"}`.trim();
    case "hotel":
      return `${d.property_name ?? d.provider ?? "Alojamiento"} · ${d.check_in ?? "?"}→${d.check_out ?? "?"}`;
    case "reservation":
      return `${d.description ?? d.provider ?? "Reserva"}`;
    case "transport":
      return `${d.operator ?? "Transporte"} ${d.from_city ?? "?"}→${d.to_city ?? "?"}`;
    case "note":
      return `${d.title ?? "Nota"}`;
    default:
      return "Sin info de viaje identificable";
  }
}

export default function WhatsAppInboxPage() {
  const [link, setLink] = useState<StatusResponse | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Manual-confirm modal state
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [activeTrips, setActiveTrips] = useState<TripOption[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, messagesRes] = await Promise.all([
        fetch("/api/whatsapp/status").catch(() => null),
        fetch(`/api/whatsapp/messages?status=${filter}&limit=100`).catch(() => null),
      ]);
      if (statusRes?.ok) {
        const json = (await statusRes.json()) as StatusResponse;
        setLink(json);
      } else {
        setLink({ linked: false });
      }
      if (messagesRes?.ok) {
        const json = (await messagesRes.json()) as { ok: boolean; messages: WhatsAppMessageRow[] };
        setMessages(json.messages ?? []);
      } else {
        setMessages([]);
      }
    } catch (e) {
      // Sin catch antes, errores de JSON parse o network quedaban como unhandled
      // rejection y el spinner desaparecía sin feedback al user.
      reportError(e, "No se pudo cargar WhatsApp");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ─── Modal: abrir → cargar los trips activos del user (planning|active) ─
  const openConfirmModal = useCallback(async (msgId: string) => {
    setConfirmingId(msgId);
    setConfirmError(null);
    setSelectedTripId("");
    const sb = createClient();
    if (!sb) {
      setConfirmError("Supabase no configurado.");
      return;
    }
    const { data, error } = await sb
      .from("trips")
      .select("id, name, destination, start_date, end_date")
      .in("status", ["planning", "active"])
      .order("start_date", { ascending: false });
    if (error) {
      setConfirmError(error.message);
      return;
    }
    const trips = (data ?? []) as TripOption[];
    setActiveTrips(trips);
    if (trips.length === 1) setSelectedTripId(trips[0].id);
  }, []);

  const submitConfirm = useCallback(async () => {
    if (!confirmingId || !selectedTripId) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/whatsapp/messages/${confirmingId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: selectedTripId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; skipped_reason?: string };
      if (!res.ok || !json.ok) {
        setConfirmError(json.error ?? "no_se_pudo_confirmar");
        return;
      }
      setConfirmingId(null);
      await fetchAll();
    } catch (e) {
      // Supabase errors son plain objects (no Error instance). String(e) = "[object Object]".
      const { message } = describeError(e);
      setConfirmError(message);
    } finally {
      setConfirming(false);
    }
  }, [confirmingId, selectedTripId, fetchAll]);

  const counts = useMemo(() => {
    const c = { all: 0, parsed: 0, received: 0, failed: 0, ignored: 0 } as Record<StatusFilter, number>;
    c.all = messages.length;
    for (const m of messages) {
      if (m.status === "parsed") c.parsed++;
      else if (m.status === "received") c.received++;
      else if (m.status === "failed") c.failed++;
      else if (m.status === "ignored") c.ignored++;
    }
    return c;
  }, [messages]);

  if (loading && !link) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <SectionHeader title="WhatsApp" subtitle="Cargando…" />
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Empty state: no link
  if (!link?.linked) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0 animate-fade-in">
        <SectionHeader title="WhatsApp" subtitle="Reenviá confirmaciones a Tampu" />
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-6 space-y-3 text-center">
            <MessageCircle className="w-10 h-10 mx-auto text-primary" />
            <p className="text-sm font-medium">Vinculá tu WhatsApp con Tampu</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
              Reenviá confirmaciones de vuelos, hoteles, tours y mensajes del host de Airbnb por
              WhatsApp a Tampu y las agrego automáticamente a tu viaje. Funciona también en
              portugués brasileño.
            </p>
            <Link
              href="/settings#whatsapp"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-4 h-4" />
              Vincular WhatsApp
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader title="WhatsApp" subtitle={`Vinculado: ${formatPhoneForDisplay(link.phone_e164 ?? "")}`} />

      {/* Instrucciones de uso */}
      <Card className="border-l-4 border-l-success">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Reenviá cualquier confirmación de viaje al <strong>número Tampu</strong> que te dio Twilio
            (ver Ajustes → WhatsApp para el número exacto). Cada mensaje aparece acá con su
            estado de parseo.
          </p>
          <Link
            href="/settings#whatsapp"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Gestionar vinculación <ExternalLink className="w-3 h-3" />
          </Link>
        </CardContent>
      </Card>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
            {counts[f.id] > 0 && (
              <span className="ml-1 opacity-70">({counts[f.id]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Messages list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Todavía no recibí mensajes. Mandá una confirmación de viaje al número Tampu para
            empezar.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {messages.map(m => {
            const Icon = typeIcon(m.parsed_json?.type);
            const badge = statusBadge(m.status);
            const BadgeIcon = badge.icon;
            const isOpen = expandedId === m.id;
            return (
              <li key={m.id}>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <button
                      onClick={() => setExpandedId(isOpen ? null : m.id)}
                      className="w-full text-left flex items-start gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.color}`}>
                            <BadgeIcon className="w-3 h-3" />
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {new Date(m.received_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate">
                          {m.status === "parsed" ? summarizeParsed(m.parsed_json) : (m.body ?? "(sin texto)")}
                        </p>
                        {m.status !== "parsed" && m.body && m.body.length > 80 && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{m.body}</p>
                        )}
                      </div>
                    </button>
                    {/* Auto-insert status badges (siempre visibles, no
                        dentro del expand) */}
                    {m.status === "parsed" && m.auto_inserted_item_id && (
                      <div className="flex items-center gap-2 pl-12">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success">
                          <Sparkles className="w-3 h-3" />
                          Agregado al viaje
                        </span>
                        {m.trip_id && (
                          <Link
                            href={`/reservations`}
                            className="text-[10px] text-primary hover:underline"
                          >
                            Ver en reservas →
                          </Link>
                        )}
                      </div>
                    )}
                    {m.status === "parsed" && !m.auto_inserted_item_id && m.auto_insert_skipped_reason && (
                      <div className="flex flex-wrap items-center gap-2 pl-12">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/15 text-warning">
                          <AlertCircle className="w-3 h-3" />
                          {SKIP_REASON_LABEL[m.auto_insert_skipped_reason] ?? "Pendiente de confirmación"}
                        </span>
                        {m.auto_insert_skipped_reason !== "unsupported_type"
                          && m.auto_insert_skipped_reason !== "idempotent_skip" && (
                          <button
                            onClick={() => void openConfirmModal(m.id)}
                            className="text-[10px] font-medium text-primary hover:underline"
                          >
                            Asociar manualmente
                          </button>
                        )}
                      </div>
                    )}
                    {isOpen && (
                      <div className="border-t border-border pt-2 mt-2 space-y-2 text-xs">
                        {m.body && (
                          <details className="text-muted-foreground" open>
                            <summary className="cursor-pointer font-medium">Mensaje original</summary>
                            <pre className="mt-1 whitespace-pre-wrap text-[11px] bg-muted/30 p-2 rounded">{m.body}</pre>
                          </details>
                        )}
                        {m.parsed_json && (
                          <details className="text-muted-foreground">
                            <summary className="cursor-pointer font-medium">Datos parseados</summary>
                            <pre className="mt-1 whitespace-pre-wrap text-[11px] bg-muted/30 p-2 rounded font-mono">
                              {JSON.stringify(m.parsed_json, null, 2)}
                            </pre>
                          </details>
                        )}
                        {m.error_message && (
                          <p className="text-destructive text-[11px]">Error: {m.error_message}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {m.parser_provider && <>Parser: {m.parser_provider} · </>}
                          {m.cost_usd != null && <>Costo: USD {m.cost_usd.toFixed(4)} · </>}
                          ID: <code className="font-mono">{m.twilio_message_sid.slice(0, 12)}…</code>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Button onClick={() => void fetchAll()} variant="outline" size="sm" className="gap-1 mt-4">
        <Loader2 className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        Refrescar
      </Button>

      {/* Manual-confirm modal: el user elige el trip al que quiere asociar
          el mensaje parseado. Solo aparece cuando hizo click en "Asociar
          manualmente". */}
      {confirmingId && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setConfirmingId(null)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold">Asociar al viaje</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Elegí a cuál de tus viajes activos querés agregar este item.
                </p>
              </div>

              {activeTrips.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tenés viajes activos. Creá uno primero desde la pestaña Viajes.
                </p>
              ) : (
                <select
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="">— Elegir viaje —</option>
                  {activeTrips.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.destination}, {t.start_date} → {t.end_date})
                    </option>
                  ))}
                </select>
              )}

              {confirmError && (
                <p className="text-xs text-destructive">{confirmError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmingId(null)} disabled={confirming}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => void submitConfirm()}
                  disabled={confirming || !selectedTripId}
                >
                  {confirming ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Agregando…</>
                  ) : "Agregar al viaje"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
