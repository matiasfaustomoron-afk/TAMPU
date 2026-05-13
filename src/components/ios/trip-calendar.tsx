"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ios";
import { Bed, Bus, Activity, ArrowDownLeft, ArrowUpRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { DestinationPhoto } from "@/components/brand/destination-photo";
import type { TripDay, Reservation, Task } from "@/lib/types/database";

/**
 * Trip calendar — vista mensual compacta (~30 días) que reemplaza el scroll vertical
 * día-a-día largo. Cada celda muestra:
 *   - número del día
 *   - dot de color = ciudad (consistencia visual entre los días de la misma stretch)
 *   - badge mini para check-in / check-out
 *   - indicador de eventos (vuelo del día, tarea pendiente)
 *
 * Tap en un día → drawer con el detalle (alojamiento, actividad, gastos estimados).
 *
 * Grid: 7 cols (lun-dom, ISO week). Filas dinámicas según los días del viaje.
 * Si el viaje es < 30 días, una sola "página" de mes. Si es más largo, paginable.
 */

interface TripCalendarProps {
  days: TripDay[];
  reservations: Reservation[];
  tasks: Task[];
  formatDate: (d: string, style?: "short" | "long" | "iso") => string;
}

// Hue contenido en familia tierra Tampu (15..95) — mismo algoritmo que destHue en today.
function cityHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 15 + (h % 80);
}

const WEEK_LABELS = ["L", "M", "M", "J", "V", "S", "D"]; // ISO: lunes primero

/**
 * Devuelve el día de semana ISO (lun=0, dom=6) para una fecha YYYY-MM-DD.
 */
function isoWeekday(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const js = d.getDay(); // dom=0, lun=1, ...
  return (js + 6) % 7;   // lun=0, ..., dom=6
}

export function TripCalendar({ days, reservations, tasks, formatDate }: TripCalendarProps) {
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  // Construir un grid 7-col que empieza en el primer lunes ≤ primer día del trip.
  const grid = useMemo(() => {
    if (days.length === 0) return [];
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].date;
    const last = sorted[sorted.length - 1].date;
    const firstWd = isoWeekday(first);

    // Construir mapa por fecha
    const dayByDate = new Map<string, TripDay>();
    for (const d of sorted) dayByDate.set(d.date, d);

    // Empezar `firstWd` días antes para alinear con el lunes
    const start = new Date(first + "T00:00:00");
    start.setDate(start.getDate() - firstWd);

    const end = new Date(last + "T00:00:00");
    // Llenar hasta completar la última semana
    const endWd = isoWeekday(last);
    end.setDate(end.getDate() + (6 - endWd));

    const cells: { date: string; day: TripDay | null; inTrip: boolean }[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      const day = dayByDate.get(iso) || null;
      cells.push({ date: iso, day, inTrip: !!day });
      cursor.setDate(cursor.getDate() + 1);
    }
    return cells;
  }, [days]);

  // Conteos por día (vuelos y tareas)
  const reservationsByDate = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of reservations) {
      if (!r.use_date) continue;
      const arr = m.get(r.use_date) || [];
      arr.push(r);
      m.set(r.use_date, arr);
    }
    return m;
  }, [reservations]);

  const tasksByDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const arr = m.get(t.due_date) || [];
      arr.push(t);
      m.set(t.due_date, arr);
    }
    return m;
  }, [tasks]);

  const openDay = openDayId ? days.find((d) => d.id === openDayId) || null : null;
  const openDayReservations = openDay ? reservationsByDate.get(openDay.date) || [] : [];
  const openDayTasks = openDay ? tasksByDate.get(openDay.date) || [] : [];

  if (grid.length === 0) {
    return (
      <div className="ios-card p-6 text-center">
        <p className="text-[13px] text-muted-foreground">El viaje no tiene días cargados todavía.</p>
      </div>
    );
  }

  return (
    <>
      <div className="ios-card p-3">
        {/* Header de días de la semana */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEK_LABELS.map((w, i) => (
            <span key={i} className="text-[10px] font-bold text-muted-foreground text-center uppercase tracking-wider">
              {w}
            </span>
          ))}
        </div>

        {/* Grid de días */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell) => {
            const dayObj = cell.day;
            const isOutside = !cell.inTrip;
            const isToday = cell.date === today;
            const dayNum = new Date(cell.date + "T00:00:00").getDate();

            if (isOutside) {
              // Días fuera del trip: visualmente apagados al 20% para que las celdas
              // del trip dominen claramente la atención del ojo. Sin tap.
              return (
                <div
                  key={cell.date}
                  className="aspect-square rounded-lg flex items-center justify-center text-[10px] text-muted-foreground/25 select-none"
                  aria-hidden
                >
                  {dayNum}
                </div>
              );
            }

            const hue = dayObj?.city_name ? cityHue(dayObj.city_name) : 38;
            const cityDot = `oklch(0.62 0.17 ${hue})`;
            const hasReservations = (reservationsByDate.get(cell.date) || []).length > 0;
            const hasTasks = (tasksByDate.get(cell.date) || []).length > 0;
            const gap =
              !dayObj?.accommodation ||
              dayObj.accommodation.toLowerCase().startsWith("pending");

            return (
              <button
                key={cell.date}
                onClick={() => dayObj && setOpenDayId(dayObj.id)}
                className={cn(
                  "aspect-square rounded-lg pressable relative flex flex-col items-center justify-start py-1 px-0.5 transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isToday ? "bg-primary/10 ring-2 ring-primary today-cell-pulse" : "bg-card hover:bg-accent/50"
                )}
                aria-label={`Día ${dayNum}, ${dayObj?.city_name || "sin ciudad"}, ${formatDate(cell.date, "long")}`}
              >
                <span
                  className={cn(
                    "text-[12px] font-bold tabular-nums",
                    isToday && "text-primary"
                  )}
                >
                  {dayNum}
                </span>

                {/* Dot de ciudad */}
                {dayObj?.city_name && (
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-0.5"
                    style={{ background: cityDot }}
                    aria-hidden
                  />
                )}

                {/* Mini badges check-in/out */}
                <div className="absolute top-0.5 right-0.5 flex flex-col gap-0.5">
                  {dayObj?.check_in && (
                    <span className="w-1.5 h-1.5 rounded-full bg-success" title="Check-in" aria-label="Check-in" />
                  )}
                  {dayObj?.check_out && (
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" title="Check-out" aria-label="Check-out" />
                  )}
                  {gap && !dayObj?.check_in && !dayObj?.check_out && (
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive" title="Sin alojamiento" aria-label="Sin alojamiento" />
                  )}
                </div>

                {/* Indicador de eventos abajo */}
                {(hasReservations || hasTasks) && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {hasReservations && <span className="w-1 h-1 rounded-full bg-info" />}
                    {hasTasks && <span className="w-1 h-1 rounded-full bg-warning" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend mini */}
        <div className="mt-3 pt-2 border-t border-border/40 grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> Check-in
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Check-out
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-info" /> Reserva
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> Sin cama
          </span>
        </div>
      </div>

      {/* ─── Day detail sheet ─── */}
      <Sheet
        open={!!openDay}
        onClose={() => setOpenDayId(null)}
        title={openDay ? `${formatDate(openDay.date, "long")} · Día ${openDay.day_number}` : ""}
      >
        {openDay && (
          <div className="space-y-3 pb-2">
            {/* Foto del POI del día — Wikipedia resolver trae la postal real del lugar */}
            {openDay.city_name && (
              <figure className="-mx-5 -mt-2 mb-3 relative overflow-hidden">
                <div className="aspect-[16/9]">
                  <DestinationPhoto destination={openDay.city_name} aspect="16/9" priority />
                </div>
                <div className="tampu-stratigraphy-bar h-1" aria-hidden />
              </figure>
            )}
            {openDay.city_name && (
              <p className="text-[14px] font-semibold flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: `oklch(0.62 0.17 ${cityHue(openDay.city_name)})` }}
                  aria-hidden
                />
                {openDay.city_name}
                {openDay.zone && <span className="text-muted-foreground font-normal">· {openDay.zone}</span>}
              </p>
            )}

            {/* Estado del día */}
            <div className="space-y-2">
              <Row
                icon={<Bed className="w-4 h-4" />}
                label="Dormís en"
                value={openDay.accommodation || "Sin alojamiento"}
                tone={
                  !openDay.accommodation ||
                  openDay.accommodation.toLowerCase().startsWith("pending")
                    ? "alert"
                    : "ok"
                }
                badge={
                  openDay.check_in ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-success/15 text-success">
                      <ArrowDownLeft className="w-2.5 h-2.5" />
                      Check-in
                    </span>
                  ) : openDay.check_out ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">
                      <ArrowUpRight className="w-2.5 h-2.5" />
                      Check-out
                    </span>
                  ) : null
                }
              />
              {openDay.main_transport && (
                <Row icon={<Bus className="w-4 h-4" />} label="Traslado" value={openDay.main_transport} tone="neutral" />
              )}
              {openDay.main_activity && (
                <Row icon={<Activity className="w-4 h-4" />} label="Plan" value={openDay.main_activity} tone="neutral" />
              )}
            </div>

            {/* Reservas del día */}
            {openDayReservations.length > 0 && (
              <div className="border-t border-border/40 pt-3">
                <p className="ios-eyebrow !p-0 mb-2">Reservas hoy</p>
                <div className="space-y-1.5">
                  {openDayReservations.map((r) => (
                    <div key={r.id} className="ios-card p-2.5 flex items-start gap-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold leading-tight truncate">{r.description}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {r.provider}
                          {r.locator && <> · {r.locator}</>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tareas del día */}
            {openDayTasks.length > 0 && (
              <div className="border-t border-border/40 pt-3">
                <p className="ios-eyebrow !p-0 mb-2">Pendientes hoy</p>
                <div className="space-y-1.5">
                  {openDayTasks.map((t) => (
                    <div key={t.id} className="ios-card p-2.5 flex items-start gap-2">
                      {t.priority === "critical" && (
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold leading-tight">{t.title}</p>
                        {t.notes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "neutral" | "alert";
  badge?: React.ReactNode;
}) {
  const tint =
    tone === "alert"
      ? "text-destructive"
      : tone === "ok"
      ? "text-foreground"
      : "text-foreground";
  return (
    <div className="ios-card p-3 flex items-start gap-2.5">
      <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("text-[14px] font-semibold leading-tight mt-0.5", tint)}>{value}</p>
      </div>
      {badge}
    </div>
  );
}
