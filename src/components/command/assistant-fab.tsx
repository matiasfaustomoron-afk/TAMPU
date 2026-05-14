"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { haptic } from "@/lib/native/platform";

/**
 * Asistente transversal — botón flotante presente en cualquier tab.
 *
 * Patrón: Arc Search "Search for me". Tap → entra al asistente como modal/route.
 * Por ahora navega a /assistant; un turno futuro lo convertimos en modal full-screen
 * con backdrop blur y entrada por slide-up (mantiene el contexto de la tab actual).
 *
 * No se muestra en:
 *  - /assistant (la propia ruta del asistente — sería redundante)
 *  - /welcome y /login (pre-onboarding, sin trip activo)
 *  - /onboarding (sin trip aún)
 *
 * ─── FAB stacking documentado ───
 * Tab bar = 64px de alto + safe-area-inset-bottom.
 * Reglas iOS HIG: no solapar con tab bar, dejar 24px de gap.
 *
 *   AssistantFab  bottom = safe-area + 88px   (24px arriba del top del tab-bar) → abajo
 *   MoreFab       bottom = safe-area + 152px  (88 + 56 alto FAB + 8 gap)        → medio
 *   ExpenseFab    bottom = safe-area + 216px  (152 + 56 alto FAB + 8 gap)       → arriba
 *
 * En iPhone SE (max-height: 700px) escondemos MoreFab para evitar overlap con
 * el viewport más chico — el user puede tocar tab "Más" / link directo a /more.
 */
const HIDDEN_ROUTES = ["/assistant", "/welcome", "/login", "/onboarding"];

export function AssistantFab() {
  const pathname = usePathname();
  if (HIDDEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return null;
  }

  return (
    <Link
      href="/assistant"
      onClick={() => haptic("light")}
      aria-label="Abrir asistente"
      title="Asistente IA"
      className="fixed z-40 right-4 w-14 h-14 rounded-2xl text-white shadow-[0_8px_24px_rgba(48,26,13,0.22),0_0_0_1px_rgba(255,255,255,0.10)_inset] tampu-gradient-warm hover:scale-105 hover:shadow-[0_12px_32px_rgba(48,26,13,0.28)] active:scale-95 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
      style={{ bottom: "calc(88px + env(safe-area-inset-bottom))" }}
    >
      <Sparkles className="w-6 h-6" aria-hidden="true" strokeWidth={2.2} />
    </Link>
  );
}
