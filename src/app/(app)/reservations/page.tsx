"use client";
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Sheet } from "@/components/ios";
import { toast } from "@/components/ios/toast";
import { StatusBadge, EmptyState, SectionHeader } from "@/components/shared";
import { useActiveTrip, useReservations, useMutations, useAttachments } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { RESERVATION_TYPES, RESERVATION_STATUSES, CURRENCIES } from "@/lib/config/constants";
import { attachmentsForReservation } from "@/lib/domain/attachment-linker";
import { AttachDocButton } from "@/components/ios/attach-doc-button";
import { CommentButton } from "@/components/comments/comment-button";
import { TripPollsSection } from "@/components/polls/trip-polls-section";
import { AddToWalletButton } from "@/components/passes/AddToWalletButton";
import { Bookmark, Plane, Home, Train, Bus, MapPin, Shield, Wifi, MoreHorizontal, AlertTriangle, Edit, Check, X, Paperclip, Plus } from "lucide-react";
import type { Reservation, ReservationStatus, ReservationType } from "@/lib/types/database";

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
  const { data: trip } = useActiveTrip();
  const { data: reservations, loading, refetch } = useReservations(trip?.id);
  const { updateReservation, addReservation } = useMutations();
  // Iter 3: attachments via TanStack hook (antes había useState + useEffect
  // con `client.from("attachments")` directo). El hook unifica online + demo
  // y se invalida automáticamente via `mAddAttachment.onSuccess` cuando
  // AttachDocButton sube algo nuevo. `data` puede ser null mientras carga,
  // por eso colapsamos con `?? []` (no `= []` default destructuring porque
  // ese patrón solo cubre `undefined`, no `null`).
  const { data: attachmentsData } = useAttachments(trip?.id);
  const attachments = attachmentsData ?? [];
  const [ft, setFt] = useState("all");
  const [exp, setExp] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Reservation>>({});
  // Sheet de "+ Nueva reserva": 6 campos mínimos. El resto (criticality,
  // exchange_rate, etc.) se derivan o quedan en defaults — el user puede
  // editar luego desde la fila expandida.
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newRes, setNewRes] = useState<{
    type: ReservationType;
    provider: string;
    description: string;
    use_date: string;
    original_amount: string;
    original_currency: string;
  }>({
    type: "accommodation",
    provider: "",
    description: "",
    use_date: "",
    original_amount: "",
    original_currency: "USD",
  });

  const submitNew = useCallback(async () => {
    if (!trip) return;
    if (!newRes.provider.trim() || !newRes.description.trim()) return;
    const amount = parseFloat(newRes.original_amount) || 0;
    setAdding(true);
    try {
      await addReservation({
        trip_id: trip.id,
        type: newRes.type,
        criticality: "important",
        provider: newRes.provider.trim(),
        city_id: null,
        city_name: null,
        description: newRes.description.trim(),
        purchase_date: null,
        use_date: newRes.use_date || null,
        use_end_date: null,
        payment_deadline: null,
        original_amount: amount,
        original_currency: newRes.original_currency,
        exchange_rate: 1,
        base_amount: amount,
        status: "pending",
        confirmation_received: false,
        locator: null,
        link: null,
        contact: null,
        cancellation_policy: null,
        is_cancellable: true,
        notes: null,
      });
      toast("Reserva creada", "success");
      setAddOpen(false);
      setNewRes({
        type: "accommodation", provider: "", description: "",
        use_date: "", original_amount: "", original_currency: "USD",
      });
      refetch();
    } catch (e) {
      toast((e as Error).message || "Error", "error");
    } finally {
      setAdding(false);
    }
  }, [trip, newRes, addReservation, refetch]);

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

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 skeleton rounded-[var(--radius)]" />)}</div>;

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader
        title={t.reservations.title}
        subtitle={`${stats.confirmed}/${stats.total} ${t.dashboard.confirmed} · ${formatCurrency(stats.totalSpent)} ${t.dashboard.committed.toLowerCase()}`}
        action={
          trip ? (
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1">
              <Plus className="w-3.5 h-3.5" />
              {t.common.add}
            </Button>
          ) : undefined
        }
      />

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

                    <div className="pt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); startEdit(r); }} className="gap-1">
                        <Edit className="w-3 h-3" />Editar estado
                      </Button>
                      {/* Apple Wallet — solo en vuelos. Si falta el cert
                          Apple Developer, el endpoint devuelve 503 y la UI
                          muestra un toast informativo. */}
                      {r.type === "flight" && (
                        <span onClick={(e) => e.stopPropagation()}>
                          <AddToWalletButton reservation={r} />
                        </span>
                      )}
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
                          r.type === "flight" ? "Adjuntar pase de embarque" :
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
        emptyHint={t.polls.emptyAllInactive} />}

      {/* Sheet de creación rápida — 6 campos mínimos. Type/provider/description
          son obligatorios; fecha/monto/moneda opcionales pero usuales. El resto
          de los campos (locator, payment_deadline, criticality) se completan
          luego desde la fila expandida con "Editar estado". */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Nueva reserva">
        <div className="space-y-3 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Tipo</label>
              <SelectNative
                value={newRes.type}
                onChange={(e) => setNewRes({ ...newRes, type: e.target.value as ReservationType })}
                className="mt-1"
              >
                {RESERVATION_TYPES.map((tp) => (
                  <option key={tp.value} value={tp.value}>{tp.label}</option>
                ))}
              </SelectNative>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Proveedor</label>
              <Input
                value={newRes.provider}
                onChange={(e) => setNewRes({ ...newRes, provider: e.target.value })}
                placeholder="Booking, LATAM, Get Your Guide…"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] uppercase text-muted-foreground">Descripción</label>
              <Input
                value={newRes.description}
                onChange={(e) => setNewRes({ ...newRes, description: e.target.value })}
                placeholder="Hotel Casa Galería · 3 noches"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t.reservations.useDate}</label>
              <Input
                type="date"
                value={newRes.use_date}
                onChange={(e) => setNewRes({ ...newRes, use_date: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-1">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Monto</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={newRes.original_amount}
                  onChange={(e) => setNewRes({ ...newRes, original_amount: e.target.value })}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Moneda</label>
                <SelectNative
                  value={newRes.original_currency}
                  onChange={(e) => setNewRes({ ...newRes, original_currency: e.target.value })}
                  className="mt-1"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </SelectNative>
              </div>
            </div>
          </div>
          <Button
            onClick={submitNew}
            disabled={adding || !newRes.provider.trim() || !newRes.description.trim()}
            className="w-full"
          >
            {adding ? t.common.loading : t.common.save}
          </Button>
        </div>
      </Sheet>
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
