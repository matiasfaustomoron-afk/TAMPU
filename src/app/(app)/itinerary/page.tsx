"use client";

import { useMemo, useState, useCallback } from "react";
import { LargeTitle, Pill, IOSFeatureCard, ProgressRing, Sheet } from "@/components/ios";
import { AttachDocButton } from "@/components/ios/attach-doc-button";
import { TripPresence } from "@/components/ios/trip-presence";
import { useTripRealtime } from "@/lib/hooks/use-trip-realtime";
import { DestinationPhoto } from "@/components/brand/destination-photo";
import { EmptyState, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectNative } from "@/components/ui/select-native";
import { useActiveTrip, useTripDays, useReservations, useMutations, useTasks } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { RESERVATION_STATUSES, CURRENCIES } from "@/lib/config/constants";
import { toast } from "@/components/ios/toast";
import { haptic, scheduleReminder, isNative } from "@/lib/native/platform";
import { buildICS, downloadICS } from "@/lib/export-ical";
import { extractFlightNumber, trackerLinks } from "@/lib/flight-tracking";
import { Calendar, MapPin, Bed, Bus, Activity, ArrowDownLeft, ArrowUpRight, Plane, Home as HomeIcon, Plus, Edit3, Paperclip, Download, Share2, Printer, CheckSquare, AlertTriangle, Sparkles } from "lucide-react";
import { AIGeneratorSheet } from "@/components/itinerary/ai-generator-sheet";
import type { DraftItinerary } from "@/lib/ai/itinerary-generator";
import { mergeDraftIntoTrip, isMostlyPlanned } from "@/lib/ai/itinerary-merger";
import { CollabIndicator } from "@/components/trips/collab-indicator";
import { TripPollsSection } from "@/components/polls/trip-polls-section";
import { CommentThread } from "@/components/comments/comment-thread";
import { BookingLinks } from "@/components/ios/booking-links";
import { TripCalendar } from "@/components/ios/trip-calendar";
import { DaySwiper } from "@/components/ios/day-swiper";
import { InlineAccordion } from "@/components/ios/inline-accordion";
import { cn } from "@/lib/utils/helpers";
import type { TripDay, Reservation, ReservationStatus, ReservationType } from "@/lib/types/database";

// destination-aware hue contained within Tampu warm family (15..95: terracota → mostaza).
// Antes: `hash % 360` daba azules/violetas para muchos destinos. Ahora siempre tierra.
function destHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 15 + (h % 80);
}

export default function ItineraryPage() {
  const { t, formatDate, formatCurrency } = useI18n();
  const { data: trip } = useActiveTrip();
  const { data: days, loading, refetch: refetchDays } = useTripDays(trip?.id);
  const { data: reservations, refetch: refetchReservations } = useReservations(trip?.id);
  const { data: tasks } = useTasks(trip?.id);
  const { upsertDay, addReservation } = useMutations();

  // AI itinerary generator sheet
  const [aiOpen, setAiOpen] = useState(false);

  // Commit a generated DraftItinerary usando el merger.
  // Modo merge por default — preserva trip_days que ya tienen cama / status confirmed.
  // Si el user explícitamente confirmó "sobrescribir" en el AIGeneratorSheet
  // (cuando plannedRatio > 0.5), pasamos mode="replace".
  const commitDraft = useCallback(async (draft: DraftItinerary, selectedDates?: Set<string>) => {
    if (!trip) return;
    const existingDays = days ?? [];
    const mode: "replace" | "merge" = isMostlyPlanned(existingDays) ? "replace" : "merge";
    await mergeDraftIntoTrip(
      draft,
      { trip, existingDays, upsertDay, addReservation },
      { mode, selectedDates, createActivityReservations: true }
    );
    refetchDays();
    refetchReservations();
  }, [trip, days, upsertDay, addReservation, refetchDays, refetchReservations]);

  // Ratio de días planeados — pasado al AIGeneratorSheet para confirmaciones.
  const plannedRatio = useMemo(() => {
    if (!days || days.length === 0) return 0;
    const planned = days.filter(d => d.status !== "empty" || !!d.accommodation).length;
    return planned / days.length;
  }, [days]);

  // Realtime: cualquier cambio de cualquier miembro del trip refetchea las listas.
  // Reservations dispara reservations refetch. Cities afecta el rendering de
  // los días (city_name), así que también refetcheamos days en ese caso.
  useTripRealtime(trip?.id, {
    reservations: () => { refetchReservations(); },
    cities: () => { refetchDays(); },
  });
  const list = useMemo(() => days ?? [], [days]);
  const flights = useMemo(
    () => (reservations ?? []).filter(r => r.type === "flight").sort((a, b) => (a.use_date || "").localeCompare(b.use_date || "")),
    [reservations]
  );
  const hotels = useMemo(
    () => (reservations ?? []).filter(r => r.type === "accommodation").sort((a, b) => (a.use_date || "").localeCompare(b.use_date || "")),
    [reservations]
  );

  if (loading) return <ItinerarySkeleton />;
  if (!trip) return <EmptyState title="Sin viaje activo" icon={<Calendar className="w-8 h-8" />} />;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const planned = list.filter(d => d.status !== "empty").length;
  const confirmed = list.filter(d => d.status === "confirmed").length;
  const gaps = list.filter(d => !d.accommodation || d.accommodation.toLowerCase().startsWith("pending")).length;
  const elapsed = list.filter(d => new Date(d.date + "T00:00:00") <= today).length;
  const progress = list.length > 0 ? Math.round((elapsed / list.length) * 100) : 0;
  const uniqueCities = new Set(list.map(d => d.city_name).filter(Boolean)).size;

  // Group days by city stretch — visually breaks the timeline into "chapters"
  const stretches: { city: string; days: TripDay[] }[] = [];
  for (const d of list) {
    const city = d.city_name || "Sin asignar";
    const last = stretches[stretches.length - 1];
    if (last && last.city === city) last.days.push(d);
    else stretches.push({ city, days: [d] });
  }

  const hue = destHue(trip.destination || trip.name);
  // Hero gradient siempre en familia tierra Tampu (no SaaS azul/violeta).
  const gradient = `linear-gradient(135deg, oklch(0.62 0.17 ${hue}), oklch(0.45 0.16 ${Math.max(15, hue - 20)}))`;

  return (
    <div className="animate-fade-in" role="region" aria-label="Itinerario del viaje">
      <LargeTitle
        eyebrow={`${list.length} días · ${uniqueCities} ciudades`}
        title="Tu viaje"
        serif
        action={
          <div className="flex items-center gap-1.5">
            <TripPresence tripId={trip.id} />
            <CollabIndicator tripId={trip.id} />
            <button
              onClick={() => setAiOpen(true)}
              className="pressable inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold"
              title="Generar itinerario con IA"
            >
              <Sparkles className="w-3.5 h-3.5" /> IA
            </button>
            <button
              onClick={() => {
                if (!trip) return;
                const ics = buildICS({ trip, reservations: reservations || [], tripDays: list, tasks: tasks || [] });
                downloadICS(trip.name.replace(/\s+/g, "_"), ics);
                haptic("light");
                toast("Calendario .ics descargado · Importalo a Apple / Google Calendar", "success");
              }}
              className="pressable inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-[12px] font-semibold focus-ring-inline"
              title="Exportar como iCal (.ics)"
              aria-label="Exportar itinerario como iCal"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" /> iCal
            </button>
            <button
              onClick={() => {
                if (typeof window !== "undefined") window.print();
                haptic("light");
              }}
              className="pressable inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-[12px] font-semibold focus-ring-inline"
              title="Imprimir / Guardar como PDF"
              aria-label="Imprimir o guardar como PDF"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" /> PDF
            </button>
            <button
              onClick={async () => {
                if (!trip) return;
                // Build a compact JSON, base64 encode, share via Web Share / clipboard
                const payload = {
                  v: 1, name: trip.name, destination: trip.destination,
                  start: trip.start_date, end: trip.end_date,
                  duration: list.length,
                  cities: Array.from(new Set(list.map(d => d.city_name).filter(Boolean))),
                  flights: (reservations || []).filter(r => r.type === "flight").map(r => ({
                    desc: r.description, provider: r.provider, locator: r.locator, date: r.use_date,
                  })),
                  hotels: (reservations || []).filter(r => r.type === "accommodation").map(r => ({
                    desc: r.description, provider: r.provider, in: r.use_date, out: r.use_end_date,
                  })),
                  // TTL de 30 días — más allá, /share rechaza el link. Si el
                  // owner quiere extender, regenera el link. Unix seconds.
                  exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
                };
                const b64 = typeof window !== "undefined" ? btoa(unescape(encodeURIComponent(JSON.stringify(payload)))) : "";
                const url = `${window.location.origin}/share?d=${encodeURIComponent(b64)}`;
                try {
                  if (typeof navigator !== "undefined" && navigator.share) {
                    await navigator.share({ title: `Itinerario · ${trip.name}`, url });
                  } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(url);
                    toast("Link copiado al portapapeles", "success");
                  }
                } catch { /* user cancelled */ }
                haptic("light");
              }}
              className="pressable inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-[12px] font-semibold focus-ring-inline"
              title="Compartir itinerario como link"
              aria-label="Compartir itinerario"
            >
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Compartir
            </button>
          </div>
        }
      />

      {/* Hero progress con foto del destino REAL del viaje */}
      <div className="px-4">
        <IOSFeatureCard className="text-white relative overflow-hidden min-h-[200px]" padding="lg">
          <DestinationPhoto destination={trip.destination} fullBleed priority />
          <div className="absolute inset-0 -z-[5]" style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.70) 100%)"
          }} aria-hidden />
          <div className="relative flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.20em] uppercase text-white mb-2 text-shadow-strong">Progreso</p>
              <p className="font-serif text-5xl leading-tight text-white text-shadow-strong">{elapsed}<span className="text-white/70 text-3xl"> / {list.length}</span></p>
              <p className="text-[13px] text-white mt-1 text-shadow-soft" style={{ opacity: 0.92 }}>días transcurridos</p>
            </div>
            <ProgressRing value={progress} size={84} accent="rgba(255,255,255,0.95)" />
          </div>
          <div className="mt-4 flex gap-2 text-[11px]">
            <Pill tone="ok" className="!bg-black/30 !text-white !border !border-white/20">{confirmed} confirmados</Pill>
            <Pill tone="warn" className="!bg-black/30 !text-white !border !border-white/20">{planned - confirmed} parciales</Pill>
            {gaps > 0 && <Pill tone="alert" className="!bg-black/30 !text-white !border !border-white/20">{gaps} sin cama</Pill>}
          </div>
        </IOSFeatureCard>
      </div>

      {/* ─── Comprar lo que falta — PROMOVIDA arriba (modelo de monetización core) ─── */}
      {trip.destination && (
        <section className="px-4 mt-4">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <p className="ios-eyebrow !p-0">Comprar para tu viaje</p>
            <p className="text-[10px] text-muted-foreground">Affiliate honesto</p>
          </div>
          <p className="text-[12px] text-muted-foreground px-1 mb-3 leading-relaxed">
            Vuelos, hoteles, excursiones, seguros, eSIM, trenes. Si Tampu gana comisión, te lo decimos arriba del link.
          </p>
          <BookingLinks destination={trip.destination} />
        </section>
      )}

      {/* ─── Vuelos — accordion expandible ─── */}
      <section className="px-4 mt-4">
        <InlineAccordion
          defaultExpanded={flights.length <= 3}
          header={
            <div className="flex items-center gap-3 p-4">
              <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 tampu-icon tampu-icon-indigo">
                <Plane className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground">Vuelos</p>
                <p className="text-[15px] font-semibold leading-tight">
                  {flights.length === 0 ? "Sin vuelos cargados" : `${flights.length} ${flights.length === 1 ? "vuelo" : "vuelos"}`}
                </p>
              </div>
            </div>
          }
        >
          <ReservationGroup
            eyebrow=""
            type="flight"
            emptyHint="Sin vuelos cargados todavía"
            icon={<Plane className="w-4 h-4" />}
            accent="tampu-icon tampu-icon-indigo"
            items={flights}
            formatDate={formatDate}
            formatCurrency={formatCurrency}
            attachCategory="boarding_pass"
            attachHint="Adjuntar pase de embarque"
            addLabel="+ Agregar vuelo"
            descPlaceholder="Ej. Emirates GRU→DXB"
            onChanged={refetchReservations}
          />
        </InlineAccordion>
      </section>

      {/* ─── Hoteles — accordion expandible ─── */}
      <section className="px-4 mt-3">
        <InlineAccordion
          defaultExpanded={hotels.length <= 3}
          header={
            <div className="flex items-center gap-3 p-4">
              <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 tampu-icon tampu-icon-cardon">
                <HomeIcon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground">Hoteles</p>
                <p className="text-[15px] font-semibold leading-tight">
                  {hotels.length === 0 ? "Sin alojamientos cargados" : `${hotels.length} ${hotels.length === 1 ? "alojamiento" : "alojamientos"}`}
                </p>
              </div>
            </div>
          }
        >
          <ReservationGroup
            eyebrow=""
            type="accommodation"
            emptyHint="Sin alojamientos cargados todavía"
            icon={<HomeIcon className="w-4 h-4" />}
            accent="tampu-icon tampu-icon-cardon"
            items={hotels}
            formatDate={formatDate}
            formatCurrency={formatCurrency}
            attachCategory="reservation"
            attachHint="Adjuntar confirmación"
            addLabel="+ Agregar hotel"
            descPlaceholder="Ej. Airbnb Jongno, Seúl"
            onChanged={refetchReservations}
          />
        </InlineAccordion>
      </section>

      {/* ─── Calendario mensual (reemplaza el día-a-día largo) ─── */}
      {list.length === 0 ? (
        <div className="mt-12"><EmptyState title="Itinerario vacío" icon={<Calendar className="w-8 h-8" />} /></div>
      ) : (
        <>
          {/* ─── Día a día: horizontal swiper (cinematic) ─── */}
          <section className="mt-6">
            <div className="px-4 flex items-baseline justify-between mb-3">
              <p className="ios-eyebrow !p-0">Día por día</p>
              <p className="text-[11px] text-muted-foreground">Swipe para navegar</p>
            </div>
            <DaySwiper days={list} formatDate={formatDate} />
          </section>

          {/* ─── Calendar grid: vista compacta complementaria ─── */}
          <section className="px-4 mt-6">
            <div className="flex items-baseline justify-between mb-2 px-1">
              <p className="ios-eyebrow !p-0">Vista mes</p>
              <p className="text-[11px] text-muted-foreground">{t.itinerary.tapHint}</p>
            </div>
            <TripCalendar
              days={list}
              reservations={reservations || []}
              tasks={tasks || []}
              formatDate={formatDate}
            />
          </section>
        </>
      )}

      {/* ─── Pendientes del viaje (tareas) ─── */}
      {(() => {
        const pending = (tasks || []).filter(t => t.status !== "done").sort((a, b) => {
          // Críticas primero, después por due_date ascending
          if (a.priority === "critical" && b.priority !== "critical") return -1;
          if (b.priority === "critical" && a.priority !== "critical") return 1;
          return (a.due_date || "").localeCompare(b.due_date || "");
        }).slice(0, 6);
        if (pending.length === 0) return null;
        return (
          <section className="px-4 mt-8">
            <div className="flex items-baseline justify-between mb-2 px-1">
              <p className="ios-eyebrow !p-0">Pendientes</p>
              <a href="/tasks" className="text-[11px] text-primary font-semibold">Ver todos →</a>
            </div>
            <div className="ios-card divide-y divide-border/40">
              {pending.map(t => (
                <a
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-start gap-3 p-3 pressable hover:bg-accent/40 transition-colors"
                >
                  <span className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    t.priority === "critical" ? "tampu-icon tampu-icon-carmin" :
                    t.priority === "high"     ? "tampu-icon tampu-icon-mostaza" :
                                                "tampu-icon tampu-icon-piedra"
                  )}>
                    {t.priority === "critical" ? <AlertTriangle className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold leading-tight">{t.title}</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">
                      {t.priority === "critical" ? "Crítica" : t.priority === "high" ? "Alta" : "Pendiente"}
                      {t.due_date && ` · ${formatDate(t.due_date)}`}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        );
      })()}

      {/* ─── Trip polls ─── */}
      <TripPollsSection
        tripId={trip.id}
        maxShown={3}
        emptyHint={t.polls.emptyAllInactive}
      />

      {/* ─── AI itinerary generator sheet ─── */}
      <AIGeneratorSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        trip={trip}
        onCommit={commitDraft}
        plannedRatio={plannedRatio}
      />

    </div>
  );
}

// ─── Reservation group component (vuelos / hoteles) ───
// Each item shows: description (large, editable), meta line, status, attach button
// Bottom CTA: "+ Agregar vuelo/hotel" opens a Sheet with creation form
function ReservationGroup({
  eyebrow, type, emptyHint, icon, accent, items, formatDate, formatCurrency,
  attachCategory, attachHint, addLabel, descPlaceholder, onChanged,
}: {
  eyebrow: string;
  type: ReservationType;
  emptyHint: string;
  icon: React.ReactNode;
  accent: string;
  items: Reservation[];
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
  formatCurrency: (n: number) => string;
  attachCategory: "boarding_pass" | "reservation" | "insurance" | "transport";
  attachHint: string;
  addLabel: string;
  descPlaceholder: string;
  onChanged: () => void;
}) {
  const { data: trip } = useActiveTrip();
  const { addReservation, updateReservation, deleteReservation } = useMutations();
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // ─── Edit form state ───
  const [fDesc, setFDesc] = useState("");
  const [fProvider, setFProvider] = useState("");
  const [fLocator, setFLocator] = useState("");
  const [fUseDate, setFUseDate] = useState("");
  const [fUseEnd, setFUseEnd] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fStatus, setFStatus] = useState<ReservationStatus>("pending");
  const [fNotes, setFNotes] = useState("");
  const [fReminder, setFReminder] = useState(true);  // default ON for new flights
  const [fReminderHours, setFReminderHours] = useState(24);

  const openEdit = useCallback((r: Reservation) => {
    setEditTarget(r);
    setFDesc(r.description);
    setFProvider(r.provider);
    setFLocator(r.locator || "");
    setFUseDate(r.use_date || "");
    setFUseEnd(r.use_end_date || "");
    setFAmount(String(r.original_amount || ""));
    setFCurrency(r.original_currency || "USD");
    setFStatus(r.status);
    setFNotes(r.notes || "");
    setFReminder(false); // user must opt-in again on edit
  }, []);

  const openNew = useCallback(() => {
    setEditTarget(null);
    setFDesc("");
    setFProvider("");
    setFLocator("");
    setFUseDate("");
    setFUseEnd("");
    setFAmount("");
    setFCurrency(trip?.base_currency || "USD");
    setFStatus("pending");
    setFNotes("");
    setFReminder(true);            // default ON for new flights
    setFReminderHours(24);
    setNewOpen(true);
  }, [trip]);

  const saveForm = useCallback(async () => {
    if (!trip || !fDesc.trim()) return;
    const amt = parseFloat(fAmount) || 0;
    if (editTarget) {
      await updateReservation(editTarget.id, {
        description: fDesc.trim(),
        provider: fProvider.trim() || "Sin proveedor",
        locator: fLocator.trim() || null,
        use_date: fUseDate || null,
        use_end_date: fUseEnd || null,
        original_amount: amt,
        base_amount: amt,
        original_currency: fCurrency,
        status: fStatus,
        notes: fNotes.trim() || null,
      });
    } else {
      await addReservation({
        trip_id: trip.id,
        type,
        criticality: "important",
        provider: fProvider.trim() || "Sin proveedor",
        city_id: null,
        city_name: null,
        description: fDesc.trim(),
        purchase_date: null,
        use_date: fUseDate || null,
        use_end_date: fUseEnd || null,
        payment_deadline: null,
        original_amount: amt,
        original_currency: fCurrency,
        exchange_rate: 1,
        base_amount: amt,
        status: fStatus,
        confirmation_received: fStatus === "confirmed" || fStatus === "paid",
        locator: fLocator.trim() || null,
        link: null,
        contact: null,
        cancellation_policy: null,
        is_cancellable: false,
        notes: fNotes.trim() || null,
      });
    }
    setEditTarget(null);
    setNewOpen(false);
    haptic("medium");
    toast(editTarget ? "Cambios guardados" : "Creado", "success");

    // ─── Native reminder for flights ───
    // If the user opted-in, schedule a Local Notification N hours before the flight.
    // On native iOS the OS will prompt for permission the first time.
    if (fReminder && type === "flight" && fUseDate) {
      // Build a date by adding parsed time (if found in description) to the use_date.
      const m = fDesc.match(/\b(\d{1,2}):(\d{2})\b/);
      const hours = m ? parseInt(m[1], 10) : 9;       // 09:00 default
      const minutes = m ? parseInt(m[2], 10) : 0;
      const flightAt = new Date(`${fUseDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
      const fireAt = new Date(flightAt.getTime() - fReminderHours * 60 * 60 * 1000);
      if (fireAt > new Date()) {
        const native = await isNative();
        if (native) {
          const scheduled = await scheduleReminder({
            id: Math.floor(Math.random() * 1e9),
            title: `Vuelo en ${fReminderHours}h: ${fDesc.trim().slice(0, 60)}`,
            body: [fProvider, fLocator].filter(Boolean).join(" · ") || "Recordatorio de vuelo",
            fireAt,
          });
          if (scheduled) toast(`Recordatorio activado para ${fireAt.toLocaleString()}`, "success");
          else toast("Permisos de notificación denegados", "warn");
        } else {
          toast(`Recordatorio guardado. En iPhone/Android se activa la alarma nativa ${fReminderHours}h antes`, "info");
        }
      }
    }

    onChanged();
  }, [trip, fDesc, fProvider, fLocator, fUseDate, fUseEnd, fAmount, fCurrency, fStatus, fNotes, editTarget, type, addReservation, updateReservation, onChanged, fReminder, fReminderHours]);

  const removeItem = useCallback(async () => {
    if (!editTarget) return;
    if (!confirm(`¿Eliminar "${editTarget.description}"?`)) return;
    await deleteReservation(editTarget.id);
    setEditTarget(null);
    toast("Eliminado", "info");
    onChanged();
  }, [editTarget, deleteReservation, onChanged]);

  const sheetOpen = !!editTarget || newOpen;
  const closeSheet = () => { setEditTarget(null); setNewOpen(false); };

  return (
    <section className="px-4 mt-8 mb-2">
      <p className="ios-eyebrow flex items-center gap-1.5">
        <span className={cn("w-5 h-5 rounded-md flex items-center justify-center", accent)}>{icon}</span>
        {eyebrow}
        <span className="ml-auto text-muted-foreground">{items.length}</span>
      </p>

      {items.length === 0 ? (
        <div className="ios-card p-5 text-center">
          <p className="text-[13px] text-muted-foreground">{emptyHint}</p>
          <button
            onClick={openNew}
            className="pressable mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold"
          >
            <Plus className="w-4 h-4" /> {addLabel.replace("+ ", "")}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map(r => (
              <article key={r.id} className="ios-card p-4">
                <div className="flex items-start gap-3">
                  <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", accent)}>{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-tight">{r.description}</p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      {r.provider}
                      {r.locator && <> · <span className="font-mono">{r.locator}</span></>}
                    </p>
                    {r.use_date && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {formatDate(r.use_date)}{r.use_end_date && r.use_end_date !== r.use_date ? ` → ${formatDate(r.use_end_date)}` : ""}
                      </p>
                    )}
                    {r.base_amount > 0 && (
                      <p className="text-[12px] text-muted-foreground mt-0.5 tabular-nums">
                        {formatCurrency(r.base_amount)}
                      </p>
                    )}
                    {r.notes && (
                      <p className="text-[12px] text-muted-foreground italic mt-1.5 leading-relaxed">{r.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <StatusBadge status={r.status} />
                    <button
                      onClick={() => openEdit(r)}
                      className="pressable text-muted-foreground hover:text-foreground p-1"
                      aria-label="Editar"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Flight tracker links — only for flights, when we can extract a flight number */}
                {type === "flight" && (() => {
                  const fn = extractFlightNumber(r.description) || extractFlightNumber(r.notes) || extractFlightNumber(r.locator);
                  if (!fn) return null;
                  const links = trackerLinks(fn);
                  return (
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                        <Plane className="w-3 h-3" /> Estado del vuelo · {fn}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {links.map(l => (
                          <a
                            key={l.label}
                            href={l.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="pressable inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-info/12 text-info text-[11.5px] font-semibold"
                          >
                            {l.label} →
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Attach docs — always visible, no expand needed */}
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Documentos
                  </p>
                  <AttachDocButton
                    entityType="reservation"
                    entityId={r.id}
                    category={attachCategory}
                    hint={attachHint}
                  />
                </div>

                {/* Threaded comments — colapsado por default */}
                {trip && (
                  <CommentThread
                    tripId={trip.id}
                    itemType="reservation"
                    itemId={r.id}
                  />
                )}
              </article>
            ))}
          </div>
          <button
            onClick={openNew}
            className="pressable mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors text-[13px] font-semibold"
          >
            <Plus className="w-4 h-4" />{addLabel}
          </button>
        </>
      )}

      {/* Edit / Add Sheet */}
      <Sheet open={sheetOpen} onClose={closeSheet} title={editTarget ? `Editar ${eyebrow.toLowerCase().slice(0, -1)}` : `Nuevo ${eyebrow.toLowerCase().slice(0, -1)}`}>
        <div className="space-y-3 pb-2">
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Descripción</label>
            <Input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder={descPlaceholder} autoFocus />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Proveedor</label>
            <Input value={fProvider} onChange={e => setFProvider(e.target.value)} placeholder={type === "flight" ? "Ej. Emirates" : "Ej. Airbnb / Marriott"} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Localizador</label>
              <Input value={fLocator} onChange={e => setFLocator(e.target.value)} placeholder="ABCD12" className="font-mono" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Estado</label>
              <SelectNative value={fStatus} onChange={e => setFStatus(e.target.value as ReservationStatus)}>
                {RESERVATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectNative>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Fecha desde</label>
              <Input type="date" value={fUseDate} onChange={e => setFUseDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Fecha hasta</label>
              <Input type="date" value={fUseEnd} onChange={e => setFUseEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Monto</label>
              <Input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Moneda</label>
              <SelectNative value={fCurrency} onChange={e => setFCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </SelectNative>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Notas</label>
            <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Detalles, observaciones, contacto…" rows={3} />
          </div>

          {/* Flight reminder — only show for flights, only meaningful on new entries */}
          {type === "flight" && (
            <div className="border-t border-border pt-3">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-[13px] font-medium flex items-center gap-2">
                  ⏰ Recordatorio en el teléfono
                </span>
                <input
                  type="checkbox"
                  checked={fReminder}
                  onChange={e => setFReminder(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>
              {fReminder && (
                <div className="mt-2 pl-2">
                  <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Avisarme</label>
                  <SelectNative value={String(fReminderHours)} onChange={e => setFReminderHours(parseInt(e.target.value, 10))}>
                    <option value="4">4 horas antes</option>
                    <option value="12">12 horas antes</option>
                    <option value="24">24 horas antes</option>
                    <option value="48">2 días antes</option>
                  </SelectNative>
                  <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                    En iPhone/Android se activa una notificación nativa. La primera vez te va a pedir permiso.
                  </p>
                </div>
              )}
            </div>
          )}

          <Button onClick={saveForm} size="lg" className="w-full mt-2" disabled={!fDesc.trim()}>
            {editTarget ? "Guardar cambios" : "Crear"}
          </Button>
          {editTarget && (
            <Button onClick={removeItem} variant="destructive" size="sm" className="w-full">
              Eliminar
            </Button>
          )}
        </div>
      </Sheet>
    </section>
  );
}

function Stretch({
  city, days, formatDate, today,
}: {
  city: string;
  days: TripDay[];
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
  today: Date;
}) {
  const first = days[0];
  const last = days[days.length - 1];
  const isPast = new Date(last.date + "T00:00:00") < today;
  const hue = destHue(city);
  const accent = `oklch(0.65 0.22 ${hue})`;

  return (
    <section className={cn("mb-7", isPast && "opacity-65")}>
      {/* Chapter header (city stretch) */}
      <div className="flex items-baseline justify-between mb-3 px-1">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            {days.length} {days.length === 1 ? "día" : "días"}
          </p>
          <h3 className="font-serif text-2xl leading-tight">{city}</h3>
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {formatDate(first.date)}{days.length > 1 ? ` – ${formatDate(last.date)}` : ""}
        </p>
      </div>

      {/* Day rail */}
      <div className="relative">
        {/* Vertical spine */}
        <span className="absolute left-[26px] top-2 bottom-2 w-px bg-border" aria-hidden />
        {days.map((d) => {
          const dDate = new Date(d.date + "T00:00:00");
          const isToday = dDate.getTime() === today.getTime();
          const isPastDay = dDate < today;
          const gap = !d.accommodation || d.accommodation.toLowerCase().startsWith("pending");
          return (
            <article key={d.id} className="relative pl-14 pb-3 last:pb-0">
              {/* Day pip */}
              <span
                className={cn(
                  "absolute left-[18px] top-3 w-4 h-4 rounded-full ring-4 ring-background",
                  isToday ? "scale-110" : ""
                )}
                style={{ background: isToday ? accent : isPastDay ? "var(--color-muted)" : "var(--color-card)", boxShadow: isToday ? `0 0 0 1px ${accent}, 0 0 14px ${accent}` : "0 0 0 1px var(--color-border)" }}
                aria-hidden
              />
              <div className={cn(
                "ios-card pressable p-4",
                isToday && "ring-2 ring-primary"
              )}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-serif text-lg leading-none">Día {d.day_number}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(d.date)}</span>
                  {isToday && <Pill tone="primary" className="!text-[10px]">Hoy</Pill>}
                  {d.check_in && <Pill tone="ok" className="!text-[10px]"><ArrowDownLeft className="w-2.5 h-2.5 inline mr-0.5" />Check-in</Pill>}
                  {d.check_out && <Pill tone="warn" className="!text-[10px]"><ArrowUpRight className="w-2.5 h-2.5 inline mr-0.5" />Check-out</Pill>}
                </div>
                {d.zone && (
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-2">
                    <MapPin className="w-3 h-3" />{d.zone}
                  </p>
                )}
                <div className="space-y-1.5">
                  <DetailRow
                    icon={<Bed className="w-3.5 h-3.5" />}
                    label="Dormís en"
                    value={d.accommodation || "Sin alojamiento"}
                    tone={gap ? "alert" : "ok"}
                  />
                  {d.main_transport && (
                    <DetailRow icon={<Bus className="w-3.5 h-3.5" />} label="Traslado" value={d.main_transport} tone="neutral" />
                  )}
                  {d.main_activity && (
                    <DetailRow icon={<Activity className="w-3.5 h-3.5" />} label="Plan" value={d.main_activity} tone="neutral" />
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DetailRow({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: "ok" | "neutral" | "alert" }) {
  const tint =
    tone === "alert" ? "text-warning" :
    tone === "ok"    ? "text-foreground" :
                       "text-muted-foreground";
  return (
    <div className="flex items-start gap-2 text-[13px]">
      <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground text-[11px] uppercase tracking-wider w-16 mt-0.5 shrink-0">{label}</span>
      <span className={cn("flex-1 min-w-0 truncate font-medium", tint)}>{value}</span>
    </div>
  );
}

function ItinerarySkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <div className="h-3 w-32 skeleton rounded mb-2" />
        <div className="h-10 w-48 skeleton rounded-xl" />
      </div>
      <div className="px-4"><div className="h-36 rounded-[var(--radius-xl)] skeleton" /></div>
      <div className="px-4 mt-8 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-[var(--radius)] skeleton" />)}
      </div>
    </div>
  );
}
