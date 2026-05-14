"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState, useCallback, useEffect, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, SectionHeader, EmptyState } from "@/components/shared";
import { Sheet } from "@/components/ios";
import { DestinationInput, type DestinationPick } from "@/components/ios/destination-input";
import { useAllTrips, useMutations, useActiveTrip } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { daysUntil, daysBetween } from "@/lib/utils/helpers";
import { CURRENCIES } from "@/lib/config/constants";
import { Globe, Calendar, Plus, Trash2, ChevronLeft, ChevronRight, Sparkles, Mail, Activity as ActivityIcon, Pencil } from "lucide-react";
import { TripInboxAddressModal } from "@/components/trips/trip-inbox-address-modal";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ios/toast";
import { haptic } from "@/lib/native/platform";
import { reportError } from "@/lib/utils/errors";
import { DestinationPhoto } from "@/components/brand/destination-photo";
import { PresenceBar } from "@/components/collab/presence-bar";
import { ActivityFeed } from "@/components/collab/activity-feed";
import type { Trip } from "@/lib/types/database";

type Step = 1 | 2 | 3;

/**
 * Sub-component aislado para leer ?activity=1 de la URL. Lo envolvemos en
 * Suspense en el caller — Next 16 lo requiere para CSR-bailout en build time.
 */
function ActivityQueryReader({ onTrigger }: { onTrigger: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams?.get("activity") === "1") onTrigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

export default function TripsPage() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const { data: trips, loading, refetch } = useAllTrips();
  const { data: activeTrip } = useActiveTrip();
  const { addTrip, activateTrip, deleteTrip } = useMutations();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  // Activity sheet (drawer con últimas 20 acciones del trip activo).
  // Si la URL trae ?activity=1, abre por default (deep link desde /more).
  const [activityOpen, setActivityOpen] = useState(false);

  // Email-in modal: muestra la address forwardeable del trip + instrucciones detalladas
  const [emailInTrip, setEmailInTrip] = useState<Trip | null>(null);

  // Wizard form
  const [destination, setDestination] = useState("");
  const [pickedPlace, setPickedPlace] = useState<DestinationPick | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("");

  const list = useMemo(() => trips ?? [], [trips]);
  const duration = useMemo(() => start && end ? daysBetween(start, end) : 0, [start, end]);

  const reset = useCallback(() => {
    setStep(1); setDestination(""); setPickedPlace(null);
    setName(""); setStart(""); setEnd(""); setBudget("");
    setDescription("");
  }, []);

  const openWizard = useCallback(() => { reset(); setOpen(true); }, [reset]);
  const closeWizard = useCallback(() => { setOpen(false); reset(); }, [reset]);

  const handleCreate = useCallback(async () => {
    if (!name || !destination || !start || !end) return;
    setBusy(true);
    try {
      const totalBudget = parseFloat(budget) || 0;
      await addTrip({
        name,
        description: description || null,
        destination,
        status: "planning",
        start_date: start,
        end_date: end,
        base_currency: currency,
        total_budget: totalBudget,
        contingency_percent: 10,
        contingency_amount: Math.round(totalBudget * 0.1),
        alert_days_warning: 7,
        alert_days_critical: 3,
        budget_warning_threshold: 80,
        budget_danger_threshold: 95,
      });
      haptic("medium");
      toast(`Viaje creado: ${name}`, "success");
      closeWizard();
      refetch();
      // Navigate to /today so the user sees the new trip immediately
      router.push("/today");
    } catch (e) {
      // reportError desempaca Supabase errors (plain objects) + native Error + strings.
      // Antes este catch tenía la lógica inline; ahora usamos el helper compartido
      // para no repetir el patrón en cada lugar.
      reportError(e, "No se pudo crear el viaje");
    } finally {
      setBusy(false);
    }
  }, [name, destination, start, end, budget, currency, description, addTrip, refetch, router, closeWizard]);

  const handleActivate = useCallback(async (id: string) => {
    await activateTrip(id);
    haptic("light");
    toast("Viaje activado", "success");
    refetch();
  }, [activateTrip, refetch]);

  const handleDelete = useCallback(async (id: string, n: string) => {
    if (!confirm(`¿Eliminar viaje "${n}" y todos sus datos asociados?`)) return;
    await deleteTrip(id);
    toast("Viaje eliminado", "info");
    refetch();
  }, [deleteTrip, refetch]);

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-lg" /></div>;

  const canStep1 = destination.trim().length > 1;
  const canStep2 = !!start && !!end && new Date(end) >= new Date(start);
  const canStep3 = !!name.trim();

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <Suspense fallback={null}>
        <ActivityQueryReader onTrigger={() => setActivityOpen(true)} />
      </Suspense>
      <SectionHeader
        title={t.trips.title}
        subtitle={`${list.length} ${list.length !== 1 ? t.trips.trips_plural : t.trips.trip}`}
        action={
          <div className="flex items-center gap-2">
            {/* Presencia del viaje activo (avatares apilados, color por user). */}
            {activeTrip && <PresenceBar tripId={activeTrip.id} />}
            {activeTrip && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setActivityOpen(true); haptic("light"); }}
                className="gap-1"
                aria-label="Ver actividad reciente del viaje"
              >
                <ActivityIcon className="w-3.5 h-3.5" />Actividad
              </Button>
            )}
            <Button size="sm" onClick={openWizard} className="gap-1">
              <Plus className="w-4 h-4" />Nuevo viaje
            </Button>
          </div>
        }
      />

      {/* Activity drawer del trip activo */}
      <Sheet
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        title={activeTrip ? `Actividad · ${activeTrip.name}` : "Actividad"}
      >
        <div className="pb-4">
          <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
            Cambios recientes hechos por vos o tus compañeros de viaje.
            Sincronizado con CRDT (offline-first).
          </p>
          <ActivityFeed tripId={activeTrip?.id || null} limit={20} />
        </div>
      </Sheet>

      {list.length === 0 ? (
        <EmptyState
          title={t.trips.noTrips}
          description={t.trips.createFirst}
          icon={<Globe className="w-8 h-8" />}
          action={
            <Button onClick={openWizard} className="gap-1">
              <Sparkles className="w-4 h-4" /> Crear mi primer viaje
            </Button>
          }
        />
      ) : (
        <div className="space-y-3 stagger-grid">
          {list.map(trip => {
            const dl = daysUntil(trip.start_date);
            const dur = daysBetween(trip.start_date, trip.end_date);
            return (
              <div
                key={trip.id}
                className={`relative overflow-hidden rounded-2xl text-white min-h-[180px] ${trip.is_active ? "ring-2 ring-primary" : ""}`}
              >
                {/* Foto real del destino del viaje */}
                <DestinationPhoto destination={trip.destination} fullBleed />
                <div className="absolute inset-0 -z-[5]" style={{
                  background: "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.75) 100%)"
                }} aria-hidden />
                <div className="relative p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold tracking-[0.20em] uppercase text-white text-shadow-strong mb-1.5">
                        {trip.destination}
                      </p>
                      <h3 className="font-serif text-[26px] leading-tight text-white text-shadow-strong">{trip.name}</h3>
                      <div className="flex items-center gap-3 mt-3 text-[12px] text-white flex-wrap text-shadow-soft" style={{ opacity: 0.94 }}>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(trip.start_date)} – {formatDate(trip.end_date)}</span>
                        <span>·</span>
                        <span>{dur} {t.common.days}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {trip.is_active && (
                          <span className="text-[10px] bg-white/20 backdrop-blur-md text-white px-2 py-0.5 rounded-full font-bold border border-white/30">
                            {t.trips.active}
                          </span>
                        )}
                        <StatusBadge status={trip.status} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right space-y-2">
                      {dl > 0 && (
                        <div className="text-white text-shadow-strong">
                          <div className="text-3xl font-serif font-bold tabular-nums leading-none">{dl}</div>
                          <div className="text-[10px] tracking-wider uppercase opacity-85">días</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-4">
                    {!trip.is_active && (
                      <Button size="sm" onClick={() => handleActivate(trip.id)} className="text-xs bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md">
                        Activar
                      </Button>
                    )}
                    {trip.is_active && (
                      <Link href="/today">
                        <Button size="sm" className="text-xs bg-white text-foreground hover:bg-white/90">Abrir →</Button>
                      </Link>
                    )}
                    <button
                      onClick={() => setEmailInTrip(trip)}
                      className="text-white/80 hover:text-white hover:bg-white/15 transition-colors flex items-center gap-1 p-2 rounded-lg"
                      aria-label="Email para forwardear"
                      title="Email para forwardear reservas"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/trips/${trip.id}/edit`}
                      className="text-white/80 hover:text-white hover:bg-white/15 transition-colors flex items-center gap-1 p-2 rounded-lg"
                      aria-label="Editar viaje"
                      title="Editar nombre, fechas, presupuesto"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(trip.id, trip.name)}
                      className="text-white/70 hover:text-white hover:bg-destructive/30 transition-colors flex items-center gap-1 p-2 rounded-lg"
                      aria-label="Eliminar viaje"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Wizard Sheet (3 steps) ─── */}
      <Sheet open={open} onClose={closeWizard} title={`Paso ${step} de 3 — ${step === 1 ? "Destino" : step === 2 ? "Fechas" : "Detalles"}`}>
        <div className="pb-4 space-y-4">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-2">
            {[1, 2, 3].map(n => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${n === step ? "w-8 bg-primary" : n < step ? "w-4 bg-primary/60" : "w-4 bg-muted"}`}
              />
            ))}
          </div>

          {/* STEP 1 — Destination autocomplete */}
          {step === 1 && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <p className="text-[15px] font-semibold mb-1">¿A dónde vas?</p>
                <p className="text-[12.5px] text-muted-foreground">Buscamos en OpenStreetMap mientras escribís. Tu próximo destino:</p>
              </div>
              <DestinationInput
                value={destination}
                onChange={setDestination}
                onPick={(p) => {
                  setPickedPlace(p);
                  // Suggest a default trip name on first pick
                  if (!name) setName(`${p.short} ${new Date().getFullYear() + (new Date().getMonth() > 9 ? 1 : 0)}`);
                }}
                autoFocus
              />
              {pickedPlace && (
                <div className="ios-card p-3 flex items-center gap-2 text-[13px]">
                  <Sparkles className="w-4 h-4 text-success shrink-0" />
                  <span><strong>{pickedPlace.short}</strong>{pickedPlace.country && `, ${pickedPlace.country}`} · cargado</span>
                </div>
              )}
              <Button onClick={() => setStep(2)} disabled={!canStep1} size="lg" className="w-full">
                Continuar <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* STEP 2 — Dates */}
          {step === 2 && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <p className="text-[15px] font-semibold mb-1">¿Cuándo?</p>
                <p className="text-[12.5px] text-muted-foreground">Fechas del viaje a <strong>{pickedPlace?.short || destination}</strong></p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Llegada">
                  <Input type="date" value={start} onChange={e => { setStart(e.target.value); if (!end) setEnd(e.target.value); }} autoFocus />
                </Field>
                <Field label="Regreso">
                  <Input type="date" value={end} onChange={e => setEnd(e.target.value)} min={start || undefined} />
                </Field>
              </div>
              {duration > 0 && (
                <p className="text-[13px] text-center text-muted-foreground">
                  <strong>{duration}</strong> días de viaje
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
                  <ChevronLeft className="w-4 h-4" />Atrás
                </Button>
                <Button onClick={() => setStep(3)} disabled={!canStep2} size="lg" className="flex-1">
                  Continuar <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 — Name + budget + notes */}
          {step === 3 && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <p className="text-[15px] font-semibold mb-1">Últimos detalles</p>
                <p className="text-[12.5px] text-muted-foreground">Ponele nombre y un presupuesto si lo tenés.</p>
              </div>
              <Field label="Nombre del viaje *">
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={`Ej. ${pickedPlace?.short || destination} ${new Date().getFullYear()}`} autoFocus />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Presupuesto" className="col-span-2">
                  <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Moneda">
                  <SelectNative value={currency} onChange={e => setCurrency(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </SelectNative>
                </Field>
              </div>
              <Field label="Notas (opcional)">
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Propósito, contexto, qué buscás en este viaje…" rows={3} />
              </Field>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="gap-1">
                  <ChevronLeft className="w-4 h-4" />Atrás
                </Button>
                <Button onClick={handleCreate} disabled={!canStep3 || busy} size="lg" className="flex-1">
                  {busy ? "Creando…" : "Crear viaje"}
                </Button>
              </div>
              <p className="text-[10.5px] text-muted-foreground text-center leading-relaxed">
                Al crear, se activa automáticamente y precargamos la guía de <strong>{pickedPlace?.short || destination}</strong> en background.
              </p>
            </div>
          )}
        </div>
      </Sheet>

      {/* ─── Email-in modal (rich) ─── */}
      {emailInTrip && (
        <TripInboxAddressModal
          open={!!emailInTrip}
          onClose={() => setEmailInTrip(null)}
          trip={emailInTrip}
        />
      )}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
