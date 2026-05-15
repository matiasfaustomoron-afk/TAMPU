"use client";

import { useState } from "react";
import { Copy, Share2, Mail, MessageCircle } from "lucide-react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ios/toast";
import { haptic } from "@/lib/native/platform";

/**
 * <AddressDisplay /> — bloque canónico para mostrar la inbox address per-trip.
 *
 * Render: short id grande + QR code (escaneable desde otro device) + address
 * texto completo + dos acciones (Copiar / Compartir).
 *
 * Filo competitivo Tampu: TripIt da una address única (`plans@tripit.com`) para
 * todos los viajes; Tampu da una address POR viaje, con un short_id legible y
 * un QR para que el usuario pueda compartirla rápido con un compañero de viaje
 * o forwardear desde otra cuenta.
 *
 * TODO: i18n — strings provisionales hardcoded, Agent 3 los mueve al dict.
 */
interface Props {
  /** Email completo `tampu+SHORTID@in.tampu.app` */
  address: string;
  /** Primeros 8 chars del UUID del trip (legible). Si no se pasa, oculta el bloque grande. */
  shortId?: string;
  /** Label sobre el bloque. Default: "Dirección del viaje". */
  label?: string;
}

export function AddressDisplay({ address, shortId, label = "Dirección del viaje" }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast("Tu navegador no soporta copiar", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      haptic("light");
      setCopied(true);
      toast("Dirección copiada", "info");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Tu navegador no soporta copiar", "warn");
    }
  }

  async function handleShare() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        haptic("light");
        await navigator.share({ title: "Mi dirección Tampu", text: address });
      } catch {
        // user dismissed share sheet — no toast.
      }
    } else {
      // Fallback: copy.
      await handleCopy();
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-muted-foreground">
        {label}
      </div>

      {shortId && (
        <div
          className="text-3xl font-bold tracking-tight text-center font-mono bg-muted/30 rounded-[var(--radius)] p-4 select-all"
          aria-label={`Short ID: ${shortId}`}
        >
          {shortId}
        </div>
      )}

      {/* QR fondo blanco SIEMPRE — sino el contraste para el scanner falla en
          dark mode. Wrap con rounded card que respeta el radio editorial. */}
      <div className="flex justify-center bg-white rounded-[var(--radius)] p-4">
        <QRCode value={address} size={160} aria-label="Código QR de la dirección" />
      </div>

      <div className="text-[12px] text-muted-foreground break-all text-center font-mono select-all">
        {address}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleCopy}
          aria-label="Copiar dirección"
        >
          <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
          {copied ? "Copiado" : "Copiar"}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleShare}
          aria-label="Compartir dirección"
        >
          <Share2 className="w-4 h-4 mr-2" aria-hidden="true" />
          Compartir
        </Button>
      </div>

      {/* Atajos para "save it forever" — el user pega la address en su propio
          inbox / WhatsApp para tenerla siempre a mano. Resuelve el problema
          reportado por testers: "el mail es imposible de retener, muy largo". */}
      <div className="flex gap-2">
        <a
          href={`mailto:?subject=${encodeURIComponent("Mi dirección Tampu del viaje")}&body=${encodeURIComponent(`Para reenviar confirmaciones a este viaje, usá esta dirección:\n\n${address}\n\nO escaneá el QR de la app.\n\n— Tampu`)}`}
          className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium px-3"
          aria-label="Mandarme la dirección por email"
        >
          <Mail className="w-4 h-4" aria-hidden="true" />
          Mandármela por email
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Mi dirección Tampu del viaje: ${address}`)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium px-3"
          aria-label="Mandarme la dirección por WhatsApp"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          Por WhatsApp
        </a>
      </div>
    </div>
  );
}
