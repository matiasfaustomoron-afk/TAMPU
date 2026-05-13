"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Tampu — Offline indicator.
 *
 * Banner sutil arriba que aparece cuando perdés conexión y un flash verde
 * cuando vuelve (2s y desaparece).
 *
 * Diseño:
 *   - Mostaza (warning Hornocal) cuando offline → señal calma, no alarma.
 *     Tampu es offline-FIRST: estar sin red es esperable, no roto.
 *   - Sage olive (success Hornocal) cuando vuelve → confirmación breve.
 *   - Position fixed top, respeta safe-area-inset-top (notch / dynamic island).
 *   - aria-live="polite" para que screen readers anuncien sin interrumpir.
 *   - No render-en-server: navigator.onLine no existe en SSR; useState inicial
 *     en `true` (asumir online) + corrección en `useEffect` evita hydration
 *     mismatch.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState<boolean>(true);
  // Cuando volvemos online, mostramos confirmación 2s antes de desmontar.
  const [showReconnected, setShowReconnected] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // Estado inicial real post-hydration.
    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      setShowReconnected(true);
      const t = window.setTimeout(() => setShowReconnected(false), 2_000);
      return () => window.clearTimeout(t);
    };
    const handleOffline = () => {
      setOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Render: offline banner persistente, o reconnected flash.
  if (online && !showReconnected) return null;

  const isOffline = !online;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed left-0 right-0 z-[120]",
        "flex items-center justify-center gap-2",
        "px-4 py-1.5 text-[11px] font-semibold",
        "transition-all duration-300 ease-out",
        isOffline
          // tampu-icon-mostaza (ocre Hornocal) — calma, no alarma.
          ? "bg-[oklch(0.78_0.14_75_/_0.95)] text-[oklch(0.18_0.030_32)]"
          // success Hornocal sage olive
          : "bg-[oklch(0.60_0.10_130_/_0.95)] text-white",
      ].join(" ")}
      style={{
        top: 0,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.4rem)",
        paddingBottom: "0.4rem",
        backdropFilter: "saturate(140%) blur(10px)",
        WebkitBackdropFilter: "saturate(140%) blur(10px)",
      }}
    >
      {isOffline ? (
        <>
          <WifiOff className="w-3.5 h-3.5" aria-hidden />
          <span>Modo offline · cambios guardados localmente</span>
        </>
      ) : (
        <>
          <Wifi className="w-3.5 h-3.5" aria-hidden />
          <span>Conectado · sincronizando</span>
        </>
      )}
    </div>
  );
}
