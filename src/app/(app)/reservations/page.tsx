"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { StatusBadge, EmptyState, SectionHeader } from "@/components/shared";
import { useActiveTrip, useReservations, useMutations } from "@/lib/hooks/use-trip-data";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useI18n } from "@/i18n/provider";
import { RESERVATION_TYPES, RESERVATION_STATUSES } from "@/lib/config/constants";
import { attachmentsForReservation } from "@/lib/domain/attachment-linker";
import { AttachDocButton } from "@/components/ios/attach-doc-button";
import { CommentButton } from "@/components/comments/comment-button";
import { TripPollsSection } from "@/components/polls/trip-polls-section";
import { Bookmark, Plane, Home, Train, Bus, MapPin, Shield, Wifi, MoreHorizontal, AlertTriangle, Edit, Check, X, Paperclip } from "lucide-react";
import type { Reservation, ReservationStatus, Attachment } from "@/lib/types/database";

const TI: Record<string, React.ReactNode> = {
  flight: <Plane className="w-4 h-4" />,
  accommodation: <Home className="w-4 h-4" />,
  train: <Train className="w-4 h-4" />,
  bus: <Bus className="w-4 h-4" />,
  tour: <MapPin className="w-4 h-4" />,
  insurance: <Shield className="w-4 h-4" />,
  connectivity: <Wifi className="w-4 h-4" />,
  other: <MoreHorizontal className="w-4 h-4" />,
};

export default function ReservationsPage() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { client, mode } = useSupabase();
  const { data: trip } = useActiveTrip();
  const { data: reservations, loading, refetch } = useReservations(trip?.id);
  const { updateReservation } = useMutations();
  const [ft, setFt] = useState("all");
  const [exp, setExp] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Reservation>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Load attachments to display under each reservation
  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    if (mode === "online" && client) {
      client.from("attachments").select("*").eq("trip_id", trip.id)
        .then(({ data }) => { if (!cancelled) setAttachments(data ?? []); });
    } else {
      try {
        const raw = localStorage.getItem(`travel-os-vault-${trip.id}`);
        const parsed = raw ? JSON.parse(raw) as Attachment[] : [];
        queueMicrotask(() => { if (!cancelled) setAttachments(parsed); });
      } catch { /* empty */ }
    }
    return () => { cancelled = true; };
  }, [trip, mode, client]);

  const list = useMemo(() => reservations ?? [], [reservations]);
  const filtered = useMemo(() => {
    let r = list;
    if (ft !== "all") r = r.filter(x => x.type === ft);
    const so: Record<string, number> = { pending: 0, booked: 1, confirmed: 2, paid: 3, cancelled: 4, expired: 5 };
    return [...r].sort((a, b) => (so[a.status] || 0) - (so[b.status] || 0));
  }, [list, ft]);
  const stats = useMemo(() => ({
    total: list.length,
    confirmed: list.filter(r => ["confirmed", "paid"].includes(r.status)).length,
    totalSpent: list.filter(r => r.status !== "pending" && r.status !== "cancelled").reduce((s, r) => s + r.base_amount, 0),
  }), [list]);

  const startEdit = useCallback((r: Reservation) => {
    setEdit(r.id);
    setDraft({ status: r.status, locator: r.locator, payment_deadline: r.payment_deadline, confirmation_received: r.confirmation_received });
  }, []);

  const saveEdit = useCallback(async (id: string) => {
    await updateReservation(id, draft);
    setEdit(null);
    setDraft({});
    refetch();
  }, [updateReservation, draft, refetch]);

  if (loading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader title={t.reservations.title} subtitle={`${stats.confirmed}/${stats.total} ${t.dashboard.confirmed} · ${formatCurrency(stats.totalSpent)} ${t.dashboard.committed.toLowerCase()}`} />

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFt("all")} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${ft === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{t.common.all}</button>
        {RESERVATION_TYPES.map(tp => (
          <button key={tp.value} onClick={() => setFt(tp.value)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${ft === tp.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {tp.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t.reservations.noReservations} icon={<Bookmark className="w-8 h-8" />} />
      ) : (
        <ReservationsPollsContext reservations={filtered} tripId={trip?.id} />
      )}

      {filtered.length === 0 ? null : (
        <div className="space-y-2">
          {filtered.map(r => {
            const x = exp === r.id;
            const isEditing = edit === r.id;
            const p = r.status === "pending";
            const linked = attachmentsForReservation(r.id, attachments);
            return (
              <div key={r.id} className={`border rounded-lg bg-card overflow-hidden ${p ? "border-primary/30" : ""}`}>
                <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => !isEditing && setExp(x ? null : r.id)}>
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    {TI[r.type] || TI.other}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{r.provider}</span>
                      {r.city_name && <span className="text-[10px] text-muted-foreground">· {r.city_name}</span>}
                      {linked.length > 0 && (
                        <span className="text-[10px] text-success flex items-center gap-0.5">
                          <Paperclip className="w-3 h-3" /> {linked.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={r.status} />
                    {r.base_amount > 0 && <p className="text-xs font-medium mt-1">{formatCurrency(r.base_amount)}</p>}
                  </div>
                </div>

                {x && !isEditing && (
                  <div className="px-3 pb-3 border-t bg-muted/20 space-y-2 text-xs">
                    {r.use_date && <div><span className="text-muted-foreground">{t.reservations.useDate}:</span> {formatDate(r.use_date, "long")}</div>}
                    {r.locator && <div><span className="text-muted-foreground">{t.reservations.locator}:</span> <span className="font-mono">{r.locator}</span></div>}
                    {r.payment_deadline && <div><span className="text-muted-foreground">Pago vence:</span> {r.payment_deadline}</div>}
                    {r.cancellation_policy && <div><span className="text-muted-foreground">{t.reservations.cancellation}:</span> {r.cancellation_policy}</div>}
                    {r.notes && <div><span className="text-muted-foreground">{t.tasks.notes}:</span> {r.notes}</div>}
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t.tasks.criticality}:</span>
                      <span className="capitalize">{t.criticality[r.criticality as keyof typeof t.criticality] || r.criticality}</span>
                      {r.criticality === "blocker" && p && <span className="text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{t.reservations.actionRequired}</span>}
                    </div>

                    <div className="pt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); startEdit(r); }} className="gap-1">
                        <Edit className="w-3 h-3" />Editar estado
                      </Button>
                    </div>

                    {/* Inline attachment uploader — files live offline in Documentos */}
                    <div className="pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                      <p className="text-[10px] uppercase text-muted-foreground mb-2 flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> Documentos
                      </p>
                      <AttachDocButton
                        entityType="reservation"
                        entityId={r.id}
                        category={
                          r.type === "flight" ? "boarding_pass" :
                          r.type === "accommodation" ? "reservation" :
                          r.type === "insurance" ? "insurance" :
                          r.type === "train" || r.type === "bus" ? "transport" :
                          "reservation"
                        }
                        hint={
                          r.type === "flight" ? "Adjuntar boarding pass" :
                          r.type === "accommodation" ? "Adjuntar confirmación de hotel" :
                          r.type === "insurance" ? "Adjuntar póliza" :
                          "Adjuntar PDF / imagen"
                        }
                      />
                    </div>

                    {/* Threaded comments — botón compacto en el footer.
                        Spec: NO modificar IOSRow. CommentButton se renderiza
                        AFUERA del row, en este footer expandido. */}
                    {trip && (
                      <div className="pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                        <CommentButton
                          tripId={trip.id}
                          itemType="reservation"
                          itemId={r.id}
                        />
                      </div>
                    )}
                  </div>
                )}

                {isEditing && (
                  <div className="px-3 pb-3 border-t bg-primary/5 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Estado</label>
                        <SelectNative value={draft.status as ReservationStatus} onChange={e => setDraft({ ...draft, status: e.target.value as ReservationStatus })} className="mt-1">
                          {RESERVATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </SelectNative>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Localizador</label>
                        <Input value={draft.locator || ""} onChange={e => setDraft({ ...draft, locator: e.target.value })} className="mt-1" placeholder="ABCD12" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Pago vence</label>
                        <Input type="date" value={draft.payment_deadline || ""} onChange={e => setDraft({ ...draft, payment_deadline: e.target.value || null })} className="mt-1" />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={!!draft.confirmation_received} onChange={e => setDraft({ ...draft, confirmation_received: e.target.checked })} />
                          Confirmación recibida
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => saveEdit(r.id)} className="gap-1"><Check className="w-3 h-3" />Guardar</Button>
                      <Button size="sm" variant="outline" onClick={() => { setEdit(null); setDraft({}); }} className="gap-1"><X className="w-3 h-3" />Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Polls contextuales del trip. Si hay 2+ pending del mismo tipo,
          el componente sugiere "votá entre A y B". */}
      {trip && <TripPollsSection tripId={trip.id} maxShown={3}
        emptyHint="Sin polls. ¿Hotel A o B? ¿Tour mañana o tarde? Decidí con el grupo." />}
    </div>
  );
}

/**
 * Contexto inline: si hay 2+ reservas pending del mismo tipo (típicamente
 * 2 hoteles candidatos sin confirmar), mostramos un CTA "creá un poll".
 * No es destructivo — solo aparece como ios-card con un mensaje y abre
 * la sheet de CreatePoll prefilled.
 */
function ReservationsPollsContext({
  reservations, tripId,
}: { reservations: Reservation[]; tripId: string | undefined }) {
  if (!tripId) return null;
  // Buscar pares pending del mismo tipo (hotel, vuelo, tour).
  const byType: Record<string, Reservation[]> = {};
  for (const r of reservations) {
    if (r.status !== "pending") continue;
    (byType[r.type] = byType[r.type] || []).push(r);
  }
  const candidatePair = Object.values(byType).find(arr => arr.length >= 2);
  if (!candidatePair) return null;
  const [a, b] = candidatePair;
  const defaultOptions = candidatePair.slice(0, 4).map(r => ({
    label: r.description.slice(0, 60),
    description: r.provider,
  }));
  return (
    <div className="ios-card p-3 flex items-center gap-3 my-3">
      <span className="w-8 h-8 rounded-xl tampu-icon tampu-icon-mostaza flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-tight">
          {candidatePair.length} {a.type}s pendientes. ¿Votamos?
        </p>
        <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">
          Ej: {a.description.slice(0, 30)} vs {b.description.slice(0, 30)}
        </p>
      </div>
      <a
        href={`/polls`}
        className="pressable inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[11.5px] font-semibold shrink-0"
        aria-label="Crear poll desde estas opciones"
        // Hint: en el futuro podemos pasar defaultOptions via querystring.
        title={defaultOptions.map(o => o.label).join(" vs ")}
      >
        Crear poll
      </a>
    </div>
  );
}
