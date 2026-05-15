"use client";

// ─── ExpiringDocCard ─────────────────────────────────────────────────────
//
// Surface attachments del viaje activo que tienen `expires_at` dentro de los
// próximos 90 días. Hasta 3 items, con días restantes. Si no hay attachments
// con expiry o ninguno cae en la ventana, el card no se monta.
//
// La columna `attachments.expires_at` viene de la migration 00037. El tipo
// `Attachment` en `lib/types/database.ts` aún no la declara — leemos via cast
// hasta que se regenere el tipo.

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useActiveTrip, useAttachments } from "@/lib/hooks/use-trip-data";
import type { Attachment } from "@/lib/types/database";

type AttachmentWithExpiry = Attachment & { expires_at: string | null };

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;

export function ExpiringDocCard() {
  const { data: trip } = useActiveTrip();
  const { data: attachments } = useAttachments(trip?.id);

  if (!trip?.id || !attachments || attachments.length === 0) return null;

  const now = Date.now();
  const cutoff = now + WINDOW_DAYS * DAY_MS;

  const expiring = (attachments as AttachmentWithExpiry[])
    .filter((a) => {
      if (!a.expires_at) return false;
      const ts = new Date(a.expires_at).getTime();
      return Number.isFinite(ts) && ts > now && ts <= cutoff;
    })
    .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())
    .slice(0, 3);

  if (expiring.length === 0) return null;

  return (
    <div className="ios-card p-4">
      <p className="ios-eyebrow mb-2 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-warning" />
        Vencen pronto
      </p>
      <ul className="space-y-2">
        {expiring.map((att) => {
          const ts = new Date(att.expires_at!).getTime();
          const daysLeft = Math.max(0, Math.ceil((ts - now) / DAY_MS));
          return (
            <li key={att.id}>
              <Link
                href="/vault"
                className="flex items-center justify-between gap-2 text-sm py-1 pressable"
              >
                <span className="truncate font-medium text-foreground">
                  {att.file_name}
                </span>
                <span
                  className={`text-[11px] font-mono tabular-nums shrink-0 ${
                    daysLeft <= 7 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {daysLeft === 0 ? "hoy" : daysLeft === 1 ? "1 día" : `${daysLeft} días`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
