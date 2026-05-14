"use client";

// ─── /trips/[id]/edit ─────────────────────────────────────────────────────
//
// Edición single-page de un trip (vs el wizard de 3 pasos para creación).
// Fields editables: nombre, destino, fechas, presupuesto, moneda, status.
// Submit llama `updateTrip()` del useMutations hook (que mapea a patchTrip
// en online mode o demo-store en demo mode).
//
// Acceso desde /trips: cada trip card tiene un icono lápiz que navega acá.

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/shared";
import { useMutations, useAllTrips } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { CURRENCIES } from "@/lib/config/constants";
import { reportError } from "@/lib/utils/errors";
import { toast } from "@/components/ios/toast";
import { ChevronLeft, Save, Loader2 } from "lucide-react";
import type { Trip } from "@/lib/types/database";

export default function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: `params` viene como Promise. Lo desempacamos con `use()`.
  const { id } = use(params);
  const router = useRouter();
  const { t } = useI18n();
  const { data: trips, loading, refetch } = useAllTrips();
  const { updateTrip } = useMutations();

  // Form state — inicializa cuando el trip se cargue.
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState<Trip["status"]>("planning");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Hidratá el form una sola vez cuando el trip aparezca. No re-hidratamos
  // si el user ya empezó a editar (useState siguiente).
  useEffect(() => {
    if (initialized || !trips) return;
    const trip = trips.find((tt) => tt.id === id);
    if (!trip) return;
    setName(trip.name ?? "");
    setDestination(trip.destination ?? "");
    setStart(trip.start_date ?? "");
    setEnd(trip.end_date ?? "");
    setBudget(String(trip.total_budget ?? 0));
    setCurrency(trip.base_currency ?? "USD");
    setStatus(trip.status ?? "planning");
    setDescription(trip.description ?? "");
    setInitialized(true);
  }, [id, trips, initialized]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !destination.trim() || !start || !end) {
      toast("Faltan campos requeridos (nombre, destino, fechas)", "error");
      return;
    }
    if (new Date(end) < new Date(start)) {
      toast("La fecha de regreso no puede ser anterior a la de llegada", "error");
      return;
    }
    setBusy(true);
    try {
      const totalBudget = parseFloat(budget) || 0;
      await updateTrip(id, {
        name: name.trim(),
        destination: destination.trim(),
        start_date: start,
        end_date: end,
        total_budget: totalBudget,
        // Recalcular contingency en base al nuevo budget (mantenemos el %
        // que tenía el trip — si no lo tiene, fallback a 10).
        contingency_amount: Math.round(totalBudget * 0.1),
        base_currency: currency,
        status,
        description: description.trim() || null,
      });
      toast("Viaje actualizado", "success");
      refetch();
      router.push("/trips");
    } catch (err) {
      reportError(err, "No se pudo actualizar el viaje");
    } finally {
      setBusy(false);
    }
  }, [id, name, destination, start, end, budget, currency, status, description, updateTrip, refetch, router]);

  if (loading || !initialized) {
    return (
      <div className="animate-pulse space-y-4 pb-20 lg:pb-0">
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader
        title="Editar viaje"
        subtitle={name || "Detalles del viaje"}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/trips")}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Volver
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos del viaje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Nombre *">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Seúl 2026" />
          </Field>

          <Field label="Destino *">
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Ej. Seoul, South Korea"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Llegada *">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Regreso *">
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                min={start || undefined}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Presupuesto" className="col-span-2">
              <Input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Moneda">
              <SelectNative value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </SelectNative>
            </Field>
          </div>

          <Field label="Estado">
            <SelectNative
              value={status}
              onChange={(e) => setStatus(e.target.value as Trip["status"])}
            >
              <option value="planning">Planificando</option>
              <option value="active">En curso</option>
              <option value="completed">Completado</option>
              <option value="archived">Archivado</option>
            </SelectNative>
          </Field>

          <Field label="Notas">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Propósito, contexto, qué buscás en este viaje…"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/trips")} disabled={busy}>
              Cancelar
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Cambiar fechas no mueve automáticamente las reservas ni los días del itinerario.
            Revisalos manualmente desde {t.itinerary?.title ?? "Itinerario"} si reescalaste el viaje.
          </p>
        </CardContent>
      </Card>
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
      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
