"use client";

/**
 * Apple Wallet button — descarga un `.pkpass` firmado para una reserva de vuelo.
 *
 * Diferencia vs spec original: la API en `/api/pkpass` es POST con `PassRequest`
 * body (no GET con `[id]` dinámico). Construimos el body desde la `Reservation`
 * y lo posteamos. iOS / Safari detectan `application/vnd.apple.pkpass` y abren
 * Apple Wallet automáticamente; en desktop browsers el `.pkpass` se descarga.
 *
 * Graceful degrade: si el endpoint devuelve 503 (certificado Apple Developer
 * no configurado), mostramos toast informativo en vez de un error duro.
 */

import { Wallet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ios/toast";
import { reportError } from "@/lib/utils/errors";
import type { Reservation } from "@/lib/types/database";
import { useI18n } from "@/i18n/provider";

interface Props {
  reservation: Reservation;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Construye el `PassRequest` desde la Reservation. Como el schema de
 * `reservations` no tiene campos específicos de vuelo (carrier, IATA codes,
 * gate, seat), inferimos lo posible desde `description` + `provider` y dejamos
 * vacíos los demás — Apple Wallet renderiza el pase igual; los founders
 * podrán enriquecer con un parser futuro.
 */
function buildPassRequestFromReservation(r: Reservation) {
  return {
    type: "flight" as const,
    serial: r.id,
    description: r.description || "Vuelo",
    organizationName: "Tampu",
    flight: {
      carrier: r.provider || "",
      flightNumber: "",
      // Sin parser de description todavía: dejamos placeholders vacíos.
      // El usuario ve el pase con datos parciales y puede completarlos manual
      // si Apple los expone editables; igualmente sirve como recordatorio en
      // Wallet con el localizador, fecha y aerolínea.
      origin: r.city_name || "",
      destination: "",
      departure: r.use_date ? new Date(r.use_date).toISOString() : new Date().toISOString(),
      locator: r.locator || undefined,
    },
  };
}

export function AddToWalletButton({ reservation, className, size = "sm" }: Props) {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const tw = t.wallet;

  async function handleClick() {
    setLoading(true);
    try {
      const body = buildPassRequestFromReservation(reservation);
      const res = await fetch(`/api/pkpass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // 503 = cert Apple Developer no configurado. Graceful degrade.
        if (res.status === 503) {
          toast(tw.certMissing, "info");
          return;
        }
        const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
          error?: string;
        };
        toast(`${tw.errorPrefix}: ${err.error || res.status}`, "error");
        return;
      }

      // Disparar la descarga del .pkpass. iOS Safari abre Wallet directamente.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tampu-pass-${reservation.id}.pkpass`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(tw.downloadedToast, "success");
    } catch (e) {
      reportError(e, tw.errorPrefix);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleClick}
      disabled={loading}
      className={className}
      aria-label={tw.ariaLabel}
    >
      <Wallet className="w-4 h-4 mr-2" aria-hidden />
      {loading ? tw.loading : tw.button}
    </Button>
  );
}
