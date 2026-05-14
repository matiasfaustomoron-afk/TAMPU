"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useT } from "@/i18n/provider";
import { isDemoActive, exitDemoTrip } from "@/lib/demo/papua-seoul-trip";
import { haptic } from "@/lib/native/platform";

/**
 * DemoBanner — chip global superior que avisa "estás en viaje demo".
 *
 * Visible cuando `tampu_demo_mode=true`. Permite salir del demo en un tap.
 * Se oculta en /welcome y /passcode para no encimar con flujos críticos.
 *
 * Paleta: mostaza Hornocal (--tampu-mustard / fallback amber) — premium,
 * legible, distinto del primary terracota para no confundirse con CTA.
 */
export function DemoBanner() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isDemoActive());
    const onChange = () => setActive(isDemoActive());
    window.addEventListener("tampu-demo-mode-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("tampu-demo-mode-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  // Rutas donde NO mostramos el banner — onboarding y gate.
  const hideOn = pathname === "/welcome" || pathname?.startsWith("/passcode");
  if (!active || hideOn) return null;

  const handleExit = () => {
    haptic("medium");
    exitDemoTrip();
    router.replace("/welcome");
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 w-full bg-amber-500/95 text-amber-950 backdrop-blur supports-[backdrop-filter]:bg-amber-500/85 border-b border-amber-700/40"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto max-w-md sm:max-w-lg px-4 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase opacity-90 leading-none">
            {t.demoBanner.eyebrow}
          </p>
          <p className="text-[13px] font-medium leading-tight mt-0.5 truncate">
            {t.demoBanner.message}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExit}
          className="shrink-0 rounded-full bg-amber-950 text-amber-50 px-3 py-1.5 text-[12px] font-semibold pressable shadow-sm hover:bg-amber-900 transition-colors"
        >
          {t.demoBanner.exit}
        </button>
      </div>
    </div>
  );
}
