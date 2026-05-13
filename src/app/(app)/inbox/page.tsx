"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Inbox, Mail, Check, X, Copy, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { LargeTitle, IOSSection, IOSFeatureCard, Pill } from "@/components/ios";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { useActiveTrip, useMutations } from "@/lib/hooks/use-trip-data";
import { useSupabase } from "@/lib/context/supabase-provider";
import { emailInAddress, tripShortId } from "@/lib/email-in/address";
import { getLocalInbox, updateLocalInbox } from "@/lib/email-in/store";
import type { EmailInEntry } from "@/lib/email-in/types";
import { toast } from "@/components/ios/toast";
import { haptic } from "@/lib/native/platform";
import { useI18n } from "@/i18n/provider";
import type { ParsedBooking } from "@/lib/parsing/email-parser";
import type { ReservationType, ReservationStatus, Criticality } from "@/lib/types/database";

/**
 * /inbox — bandeja per-trip de emails forwardeados.
 *
 * Concept: cada trip tiene su propia address `tampu+SHORTID@in.tampu.app`.
 * El user le forwardea Despegar / Booking / Airbnb / Iberia / etc, y acá
 * aparece la lista con el resultado del parseo + botón para commitear al trip.
 *
 * En demo / sin Supabase, el flow real (recibir via webhook) no funciona, pero
 * la página muestra:
 *  - la address (con botón copy + instrucciones)
 *  - las entries guardadas en localStorage (que el user puede haber generado
 *    desde el lab de prueba en /import)
 */
export default function InboxPage() {
  const { data: trip } = useActiveTrip();
  const { mode, client } = useSupabase();
  const { formatDate } = useI18n();
  const { addReservation } = useMutations();

  const [entries, setEntries] = useState<EmailInEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!trip) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    if (mode === "online" && client) {
      try {
        const res = await fetch(`/api/email-in?trip_id=${encodeURIComponent(trip.id)}`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.entries)) {
          // Map the DB shape into the EmailInEntry shape (camelCase already matches)
          setEntries(json.entries as EmailInEntry[]);
        } else {
          setEntries([]);
        }
      } catch (err) {
        console.warn("[inbox] fetch failed, falling back to local", err);
        setEntries(getLocalInbox(trip.id));
      }
    } else {
      setEntries(getLocalInbox(trip.id));
    }
    setLoading(false);
  }, [trip, mode, client]);

  useEffect(() => { refetch(); }, [refetch]);

  const address = useMemo(() => trip ? emailInAddress(trip.id) : null, [trip]);
  const shortId = useMemo(() => trip ? tripShortId(trip.id) : null, [trip]);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      haptic("light");
      toast("Address copiada al portapapeles", "success");
    } catch {
      toast("No se pudo copiar", "warn");
    }
  }, [address]);

  const commitEntry = useCallback(async (entry: EmailInEntry) => {
    if (!trip) return;
    const created: string[] = [];
    for (const b of entry.parsed_bookings) {
      const res = await addReservation({
        trip_id: trip.id,
        type: b.type as ReservationType,
        criticality: "important" as Criticality,
        provider: b.provider || "Sin proveedor",
        city_id: null,
        city_name: b.city_name,
        description: b.description || `${b.type} · ${b.provider}`,
        purchase_date: null,
        use_date: b.use_date,
        use_end_date: b.use_end_date,
        payment_deadline: b.payment_deadline,
        original_amount: b.original_amount || 0,
        original_currency: b.original_currency || trip.base_currency,
        exchange_rate: 1,
        base_amount: b.original_amount || 0,
        status: (b.status || "pending") as ReservationStatus,
        confirmation_received: b.status === "confirmed" || b.status === "paid",
        locator: b.locator,
        link: null,
        contact: b.contact,
        cancellation_policy: b.cancellation_policy,
        is_cancellable: b.is_cancellable ?? false,
        notes: b.notes || `Importado desde ${entry.from_address}`,
      });
      if (res?.id) created.push(res.id);
    }

    // Mark committed
    if (mode === "online" && client) {
      await client.from("email_in_entries").update({
        status: "committed",
        committed_reservation_ids: created,
        committed_at: new Date().toISOString(),
      }).eq("id", entry.id);
    } else {
      updateLocalInbox(trip.id, entry.id, {
        status: "committed",
        committed_reservation_ids: created,
      });
    }
    haptic("medium");
    toast(`${created.length} reserva${created.length === 1 ? "" : "s"} importada${created.length === 1 ? "" : "s"}`, "success");
    refetch();
  }, [trip, addReservation, client, mode, refetch]);

  const dismissEntry = useCallback(async (entry: EmailInEntry) => {
    if (!trip) return;
    if (mode === "online" && client) {
      await client.from("email_in_entries").update({ status: "dismissed" }).eq("id", entry.id);
    } else {
      updateLocalInbox(trip.id, entry.id, { status: "dismissed" });
    }
    haptic("light");
    refetch();
  }, [trip, client, mode, refetch]);

  if (!trip) {
    return (
      <div className="animate-fade-in">
        <LargeTitle title="Bandeja" serif />
        <EmptyState title="Sin viaje activo" icon={<Inbox className="w-8 h-8" />} />
      </div>
    );
  }

  const active = entries.filter(e => e.status === "parsed" || e.status === "failed" || e.status === "pending");
  const archived = entries.filter(e => e.status === "committed" || e.status === "dismissed");

  return (
    <div className="animate-fade-in">
      <LargeTitle eyebrow={trip.name} title="Bandeja" serif />

      {/* Address card */}
      <div className="px-4">
        <IOSFeatureCard padding="lg">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-2xl tampu-icon tampu-icon-indigo flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground mb-1">
                Forwardeá emails a
              </p>
              <p className="font-mono text-[14.5px] font-semibold break-all leading-tight">
                {address}
              </p>
              <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                Cualquier confirmación de vuelo, hotel o tour mandala acá y la
                parseamos como reserva en este viaje. Short ID:{" "}
                <span className="font-mono">{shortId}</span>.
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={copyAddress} size="sm" className="gap-1.5">
              <Copy className="w-3.5 h-3.5" /> Copiar
            </Button>
            <a
              href={`mailto:${address}?subject=Test%20Tampu&body=Forward%20your%20booking%20emails%20here`}
              className="pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-[12px] font-semibold text-foreground"
            >
              Probar
            </a>
          </div>
        </IOSFeatureCard>
      </div>

      {/* Active entries */}
      {loading ? (
        <div className="px-4 mt-8">
          <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando bandeja…
          </div>
        </div>
      ) : active.length === 0 && archived.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Bandeja vacía"
            description="Mandá tu primer email al alias de arriba"
            icon={<Inbox className="w-8 h-8" />}
          />
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <IOSSection eyebrow="Pendientes">
              {active.map(e => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  onCommit={() => commitEntry(e)}
                  onDismiss={() => dismissEntry(e)}
                  formatDate={formatDate}
                />
              ))}
            </IOSSection>
          )}

          {archived.length > 0 && (
            <IOSSection eyebrow={`Archivo · ${archived.length}`}>
              {archived.slice(0, 5).map(e => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  onCommit={() => {}}
                  onDismiss={() => {}}
                  formatDate={formatDate}
                  readonly
                />
              ))}
            </IOSSection>
          )}
        </>
      )}
    </div>
  );
}

function EntryRow({
  entry, onCommit, onDismiss, formatDate, readonly,
}: {
  entry: EmailInEntry;
  onCommit: () => void;
  onDismiss: () => void;
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
  readonly?: boolean;
}) {
  return (
    <div className="ios-list-row !items-start !py-3 flex-col gap-2">
      <div className="flex items-start gap-3 w-full">
        <span className={
          "w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 " +
          (entry.status === "parsed" ? "tampu-icon tampu-icon-cardon"
            : entry.status === "committed" ? "tampu-icon tampu-icon-indigo"
            : entry.status === "failed" ? "tampu-icon tampu-icon-mostaza"
            : "bg-muted")
        }>
          {entry.status === "failed" ? <AlertTriangle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold leading-tight truncate">
            {entry.subject || "(sin asunto)"}
          </p>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            De {entry.from_name || entry.from_address}
            {entry.carrier_hint && ` · ${entry.carrier_hint}`}
            {` · ${formatDate(entry.received_at)}`}
          </p>
        </div>
        <StatusPill status={entry.status} count={entry.bookings_count} />
      </div>

      {entry.bookings_count > 0 && (
        <ul className="text-[12px] text-muted-foreground space-y-0.5 pl-11 w-full">
          {entry.parsed_bookings.slice(0, 3).map((b: ParsedBooking, i: number) => (
            <li key={i} className="truncate">
              · <span className="font-medium text-foreground">{b.type}</span> ·{" "}
              {b.description || b.provider}
              {b.use_date && ` · ${formatDate(b.use_date)}`}
            </li>
          ))}
          {entry.parsed_bookings.length > 3 && (
            <li>+ {entry.parsed_bookings.length - 3} más</li>
          )}
        </ul>
      )}

      {entry.error_message && entry.status === "failed" && (
        <p className="text-[11.5px] text-warning pl-11">{entry.error_message}</p>
      )}

      {!readonly && entry.status === "parsed" && (
        <div className="flex gap-2 pl-11 w-full">
          <Button size="sm" onClick={onCommit} className="gap-1.5 h-8">
            <Check className="w-3.5 h-3.5" />
            Importar al viaje
          </Button>
          <Button size="sm" variant="outline" onClick={onDismiss} className="gap-1.5 h-8">
            <X className="w-3.5 h-3.5" /> Descartar
          </Button>
        </div>
      )}
      {!readonly && entry.status === "failed" && (
        <div className="pl-11">
          <Button size="sm" variant="outline" onClick={onDismiss} className="gap-1.5 h-8">
            <X className="w-3.5 h-3.5" /> Descartar
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status, count }: { status: EmailInEntry["status"]; count: number }) {
  if (status === "parsed") return <Pill tone="ok">{count}</Pill>;
  if (status === "committed") return <Pill tone="primary"><Sparkles className="w-2.5 h-2.5 inline mr-0.5" /> imp</Pill>;
  if (status === "failed") return <Pill tone="warn">fail</Pill>;
  if (status === "dismissed") return <Pill tone="neutral">desc</Pill>;
  return <Pill tone="neutral">pend</Pill>;
}
