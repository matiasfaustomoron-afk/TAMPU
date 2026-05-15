"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveTrip, useReservations, useAttachments } from "@/lib/hooks/use-trip-data";
import { Plane, ChevronDown, ChevronUp, FileText, Paperclip } from "lucide-react";
import type { Attachment, Reservation } from "@/lib/types/database";
import { attachmentsForReservation } from "@/lib/domain/attachment-linker";

// ─── Boarding passes widget for the Dashboard ───
// Collapsible list of boarding passes saved in the Vault, grouped under
// upcoming flights. Quick-tap access without leaving the dashboard.

interface BoardingItem {
  flight: Reservation;
  attachments: Attachment[];
  days_until: number;
}

function daysUntilIso(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(iso + "T00:00:00").getTime();
  return Math.ceil((t - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function BoardingPassesWidget() {
  const { data: trip } = useActiveTrip();
  const { data: reservations } = useReservations(trip?.id);
  // Antes: fetch directo a Supabase + parse manual de localStorage. Ahora una
  // sola línea via TanStack — el hook resuelve online/demo y se refresca cuando
  // mAddAttachment invalida la query.
  const { data: attachmentsRaw } = useAttachments(trip?.id);
  const attachments = useMemo<Attachment[]>(() => attachmentsRaw ?? [], [attachmentsRaw]);
  const [open, setOpen] = useState(true);

  const items = useMemo<BoardingItem[]>(() => {
    if (!reservations) return [];
    const flights = reservations.filter(r => r.type === "flight" && r.status !== "cancelled" && r.status !== "expired");
    const list: BoardingItem[] = flights.map(f => ({
      flight: f,
      attachments: attachmentsForReservation(f.id, attachments).filter(a => a.category === "boarding_pass"),
      days_until: daysUntilIso(f.use_date),
    }));
    // Show flights with attachments + upcoming flights without attachments (so user knows what's missing)
    return list
      .filter(i => i.attachments.length > 0 || (i.days_until >= -1 && i.days_until <= 60))
      .sort((a, b) => a.days_until - b.days_until);
  }, [reservations, attachments]);

  const orphanBoardings = useMemo(
    () => attachments.filter(a =>
      a.category === "boarding_pass" &&
      (a.entity_type !== "reservation" || !reservations?.find(r => r.id === a.entity_id))
    ),
    [attachments, reservations]
  );

  if (items.length === 0 && orphanBoardings.length === 0) return null;

  const total = items.reduce((s, i) => s + i.attachments.length, 0) + orphanBoardings.length;

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Pases de embarque</h2>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {total} archivo{total !== 1 ? "s" : ""}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="pt-0 space-y-2">
          {items.map(i => (
            <FlightRow key={i.flight.id} item={i} />
          ))}

          {orphanBoardings.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-[10px] uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> Pases sin vincular a reserva
              </p>
              <ul className="space-y-1">
                {orphanBoardings.map(a => (
                  <li key={a.id}>
                    <Link
                      href={`/vault?file=${a.id}`}
                      className="flex items-center gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{a.file_name}</p>
                        {a.notes && <p className="text-[10px] text-muted-foreground truncate">{a.notes}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function FlightRow({ item }: { item: BoardingItem }) {
  const { flight, attachments, days_until } = item;
  const [expanded, setExpanded] = useState(false);
  const hasAttachments = attachments.length > 0;
  const isUpcoming = days_until >= -1 && days_until <= 30;

  return (
    <div className={`rounded-md border ${isUpcoming ? "border-primary/40" : ""}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-2 flex items-start gap-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${hasAttachments ? "tampu-icon tampu-icon-cardon" : "bg-muted text-muted-foreground"}`}>
          <Plane className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{flight.description.substring(0, 80)}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{flight.provider}</span>
            {flight.use_date && (
              <span className="text-[10px] text-muted-foreground">
                · {flight.use_date}
                {days_until >= 0 && days_until <= 30 && (
                  <span className={`ml-1 ${days_until <= 3 ? "text-destructive font-bold" : days_until <= 7 ? "text-primary font-medium" : ""}`}>
                    ({days_until === 0 ? "hoy" : `${days_until}d`})
                  </span>
                )}
              </span>
            )}
            {flight.locator && (
              <span className="text-[10px] text-muted-foreground font-mono">· {flight.locator}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {hasAttachments ? (
            <span className="text-[10px] text-success font-medium">
              {attachments.length} doc{attachments.length !== 1 ? "s" : ""}
            </span>
          ) : isUpcoming ? (
            <Link
              href="/vault"
              onClick={e => e.stopPropagation()}
              className="text-[10px] text-primary underline"
            >
              Subir
            </Link>
          ) : null}
        </div>
      </button>

      {expanded && hasAttachments && (
        <div className="px-2 pb-2 space-y-1">
          {attachments.map(a => (
            <Link
              key={a.id}
              href={`/vault?file=${a.id}`}
              className="flex items-center gap-2 p-2 rounded bg-muted/20 hover:bg-muted/40 transition-colors text-xs"
            >
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{a.file_name}</span>
              <span className="text-[10px] text-muted-foreground">{(a.file_size / 1024).toFixed(0)} KB</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
