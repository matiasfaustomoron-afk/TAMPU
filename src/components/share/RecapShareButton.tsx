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

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ios/toast";

interface Props {
  tripId: string;
  tripName: string;
  size?: "sm" | "default";
}

export function RecapShareButton({ tripId, tripName, size = "sm" }: Props) {
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
