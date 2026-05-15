"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { haptic } from "@/lib/native/platform";

/**
 * MoreFab — botón flotante apilado ENCIMA del AssistantFab.
 *
 * Reemplaza la tab "Más" del tab bar. Ahora Fotos ocupa el 5º slot del tab bar
 * y "Más" pasa a ser un FAB transversal accesible desde cualquier pantalla.
 *
 * ─── FAB stacking documentado ───
 *
 *    [ ExpenseFab ]   ← solo en /expenses, bottom = safe-area + 216px
 *    [ MoreFab    ]   ← este componente,  bottom = safe-area + 152px
 *    [ AssistantFab ] ← bottom = safe-area + 88px
 *    ━━━━━━━━━━━━━━   ← tab bar 64px alto + safe-area-inset-bottom
 *
 * Gap = 56 (alto FAB) + 8 (espaciado) = 64px entre FABs.
 *
 * Hidden en:
 *   - /welcome, /login, /onboarding, /more (rutas pre-onboarding o redundantes)
 *   - viewport max-height <= 700px (iPhone SE / iPhone 13 mini landscape) —
 *     a esa altura, 3 FABs apilados comen demasiado de la pantalla; el user
 *     accede vía tab "Más" del bottom menu o link directo.
 */

const HIDDEN_ROUTES = ["/welcome", "/login", "/onboarding", "/more"];

export function MoreFab() {
  const pathname = usePathname();
  if (HIDDEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return null;
  }

  return (
    <Link
      href="/more"
      onClick={() => haptic("light")}
      aria-label="Más opciones"
      title="Más"
      className="more-fab fixed z-40 right-4 w-14 h-14 rounded-2xl shadow-[0_8px_24px_rgba(48,26,13,0.18),0_0_0_1px_rgba(48,26,13,0.05)_inset] bg-card hover:scale-105 hover:shadow-[0_12px_32px_rgba(48,26,13,0.22)] active:scale-95 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary border border-border/60"
      style={{ bottom: "calc(var(--fab-stack-2) + env(safe-area-inset-bottom))" }}
    >
      <MoreHorizontal className="w-6 h-6 text-foreground" aria-hidden="true" strokeWidth={2.2} />
    </Link>
  );
}
