"use client";

// ─── RecapShareButton ─────────────────────────────────────────────────────
//
// Botón que dispara el flujo de share del recap del viaje. Intenta la Web
// Share API nativa (iOS/Android sheet, en desktop algunos browsers) y si no
// está disponible o el user la dismissó, copia el link al clipboard como
// fallback.
//
// El link apunta a `/recap/[tripId]` — página pública con og:image que da
// preview rica en WhatsApp/Twitter/iMessage.
//
// Si `disabled` es `true` (cuando trip.recap_public === false), el componente
// renderiza un Link a /settings#share-trip — visualmente queda como disabled
// pero al tap el user va directo a la configuración para activar el flag.
// Antes mostrábamos un toast.info "Activá en Ajustes" sin navegar — UX malo
// porque obligaba al user a buscar la opción él mismo.

import Link from "next/link";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ios/toast";

interface Props {
  tripId: string;
  tripName: string;
  size?: "sm" | "default";
  /** Cuando trip.recap_public === false, el botón se muestra en disabled state
   *  pero es clickable como link a /settings#share-trip para que el user vaya
   *  directo a activarlo. */
  disabled?: boolean;
}

export function RecapShareButton({ tripId, tripName, size = "sm", disabled = false }: Props) {
  async function handleShare() {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${baseUrl}/recap/${tripId}`;
    const shareText = `Mirá mi viaje a ${tripName}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Mi viaje en Tampu",
          text: shareText,
          url,
        });
        return;
      } catch {
        /* user dismissed — fallback */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copiado", "info");
    } catch {
      toast("No se pudo compartir", "warn");
    }
  }

  // Disabled state — funciona como Link a la sección de ajustes donde se
  // activa el flag recap_public. Mantenemos el styling disabled (opacity)
  // pero es navegable. No usamos `Button disabled` porque eso bloquea el
  // click handler nativo del Link wrapping.
  if (disabled) {
    return (
      <Link
        href="/settings#share-trip"
        className="block opacity-60 hover:opacity-80 transition-opacity"
        aria-label="Compartir recap (desactivado — activá en Ajustes)"
        title="Activá Compartir en Ajustes para habilitar el link público"
      >
        <Button
          variant="outline"
          size={size}
          className="gap-2 w-full pointer-events-none"
          tabIndex={-1}
        >
          <Share2 className="w-4 h-4" />
          Compartir recap (activá en Ajustes)
        </Button>
      </Link>
    );
  }

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleShare}
      className="gap-2"
    >
      <Share2 className="w-4 h-4" />
      Compartir recap
    </Button>
  );
}
