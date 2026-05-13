"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/helpers";
import { debounce } from "@/lib/perf/debounce";
import { useT } from "@/i18n/provider";
import { Sun, Plane, FolderClosed, Wallet, Camera } from "lucide-react";
import { ToastHost } from "@/components/ios/toast";
import { AssistantFab } from "@/components/command/assistant-fab";
import { MoreFab } from "@/components/command/more-fab";
import { TaskRemindersSync } from "@/components/task-reminders-sync";
import { haptic } from "@/lib/native/platform";

// ─── Tab bar — 5 primary destinations, iOS pattern ───
// Order is deliberate: Cartera at center (position 3) because Cartera is the product's
// edge. Mental order: now → trip context → THE THING → money → escape valve.
const TABS = [
  { key: "today",    href: "/today",     label: "Hoy",        icon: Sun },
  { key: "trip",     href: "/itinerary", label: "Viaje",      icon: Plane },
  { key: "vault",    href: "/vault",     label: "Documentos", icon: FolderClosed },
  { key: "money",    href: "/expenses",  label: "Dinero",     icon: Wallet },
  { key: "journal",  href: "/journal",   label: "Fotos",      icon: Camera },
] as const;

// Routes that belong to each tab — used to keep the active state right
// even when the user is on a sub-page (e.g. /budget shows "Dinero" active).
// Restructure mayo 2026 v2: la 5ª tab pasa de "Más" a "Fotos" (/journal).
// "Más" ahora es FAB flotante apilado encima del AssistantFab — accedés a
// todo lo demás (profile, settings, share, etc) desde ahí.
const TAB_OWNERSHIP: Record<string, string> = {
  // Hoy — brief contextual
  "/today": "/today", "/alerts": "/today",
  // Viaje — todo lo que tiene fecha y lugar
  "/itinerary": "/itinerary", "/trips": "/itinerary", "/map": "/itinerary",
  "/reservations": "/itinerary", "/tasks": "/itinerary",
  "/visas": "/itinerary", "/packing": "/itinerary", "/health": "/itinerary",
  // Documentos — vault + ingestion
  "/vault": "/vault", "/import": "/vault",
  // Dinero — gastos + presupuesto
  "/expenses": "/expenses", "/budget": "/expenses", "/cashflow": "/expenses", "/split": "/expenses",
  // Fotos — journal con reviews
  "/journal": "/journal",
  // Resto vive bajo el MoreFab — no tiene tab pero se accede vía FAB
};

function activeTab(pathname: string): string {
  const owned = TAB_OWNERSHIP[pathname];
  if (owned) return owned;
  // sub-routes
  for (const [base, owner] of Object.entries(TAB_OWNERSHIP)) {
    if (pathname.startsWith(base + "/")) return owner;
  }
  return "/today";
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const active = activeTab(pathname);

  // Prefetch agresivo de las 4 tabs no activas al montar el layout — elimina
  // el "queda renderizando" que aparece al cambiar de tab. Skip current tab:
  // la ruta activa ya fue server-rendered, prefetcharla es trabajo redundante
  // que solo agrega un request HTTP al network panel.
  useEffect(() => {
    for (const tab of TABS) {
      if (tab.href === active) continue;
      try { router.prefetch(tab.href); } catch { /* noop */ }
    }
  }, [router, active]);

  const handleHoverPrefetch = (href: string) => {
    try { router.prefetch(href); } catch { /* noop */ }
  };

  // ─── Pill indicator que migra entre tabs con spring physics ───
  // Medimos el bounding box del tab activo y desplazamos un div absoluto.
  // Cuando cambia `active`, CSS transition con spring ease mueve el pill.
  const navRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number; opacity: number }>({ left: 0, width: 0, opacity: 0 });

  useEffect(() => {
    const nav = navRef.current;
    const recompute = () => {
      const el = tabRefs.current[active];
      if (!el || !nav) return;
      const elBox = el.getBoundingClientRect();
      const navBox = nav.getBoundingClientRect();
      setPillStyle({
        left: elBox.left - navBox.left,
        width: elBox.width,
        opacity: 1,
      });
    };
    // Defer to next frame — `Link` puede haber sido remountado
    const rafId = requestAnimationFrame(recompute);

    // ResizeObserver es ~10x más barato que window.resize: solo dispara cuando
    // el nav box realmente cambia (orientación, soft keyboard, dynamic island,
    // tab bar safe-area change), no en cada pixel de drag de la ventana.
    // Debounce 150ms para evitar layout thrash durante el resize burst del SO.
    const debounced = debounce(recompute, 150);
    const ro = nav && typeof ResizeObserver !== "undefined" ? new ResizeObserver(debounced) : null;
    if (ro && nav) ro.observe(nav);
    // Fallback para browsers/jsdom sin RO (tests, IE-equivalents).
    if (!ro) window.addEventListener("resize", debounced);

    return () => {
      cancelAnimationFrame(rafId);
      debounced.cancel();
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", debounced);
    };
  }, [active]);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Main scroll area — mobile-first container even on desktop */}
      <main className="mx-auto max-w-md sm:max-w-lg pb-32 safe-area-top">
        {children}
      </main>

      {/* iOS bottom tab bar — frosted glass + pill indicator + haptics */}
      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 left-0 right-0 z-50 ios-material border-t border-border/40 safe-area-bottom"
      >
        <div
          ref={navRef}
          className="relative mx-auto max-w-md sm:max-w-lg flex items-center justify-around h-[64px]"
        >
          {/* Pill background animado — spring transition entre tabs.
              Antes: cubic-bezier(0.34,1.56,0.64,1) — overshoot ~12% (bouncy).
              Ahora: cubic-bezier(0.32,1.0,0.4,1) — settle limpio sin rebote.
              El icono mantiene el spring (tab-icon-bounce) para el "snap" del
              feedback de tap. El pill viaja entre tabs como una pieza editorial,
              no rebota. */}
          <span
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 h-12 rounded-2xl bg-primary/12 transition-[left,width,opacity] duration-[380ms] ease-[cubic-bezier(0.32,1,0.4,1)]"
            style={{
              left: `${pillStyle.left}px`,
              width: `${pillStyle.width}px`,
              opacity: pillStyle.opacity,
            }}
          />
          {TABS.map((tab) => {
            const isActive = active === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                prefetch={true}
                ref={(el) => { tabRefs.current[tab.href] = el; }}
                onMouseEnter={() => handleHoverPrefetch(tab.href)}
                onTouchStart={() => handleHoverPrefetch(tab.href)}
                onFocus={() => handleHoverPrefetch(tab.href)}
                onClick={() => {
                  if (!isActive) haptic("light");
                }}
                aria-current={isActive ? "page" : undefined}
                aria-label={tab.label}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center gap-0.5 flex-1 h-full",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl mx-0.5",
                  "transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {/* Filled icon señal premium iOS — cuando active, fill="currentColor"
                    se aplica al SVG root y los path children lo heredan (no tienen
                    fill explícito). Lucide default es fill="none" stroke-only, así
                    que esto crea el "solid silhouette" feel de SF Symbols active.
                    strokeWidth 2.6 cuando active = bordes ligeramente más bold
                    además del fill, para que el cambio sea sutil pero perceptible. */}
                <Icon
                  className={cn(
                    "w-[22px] h-[22px] transition-transform duration-[420ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                    isActive ? "scale-110 tab-icon-bounce" : "scale-100",
                  )}
                  strokeWidth={isActive ? 2.6 : 2}
                  fill={isActive ? "currentColor" : "none"}
                />
                <span
                  className={cn(
                    "text-[10px] leading-tight transition-all duration-300",
                    isActive ? "font-bold tracking-tight" : "font-semibold tracking-normal",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Asistente transversal — accesible desde cualquier tab vía botón flotante (estilo Arc Search).
          El antiguo ExpenseFab (FAB de gastos) ahora vive dentro de /expenses como CTA contextual,
          no pegado a la tab bar (regla iOS HIG: tab bar solo navega). */}
      <MoreFab />
      <AssistantFab />
      <ToastHost />
      <TaskRemindersSync />
      {/* unused i18n reference — keeps the import alive in case a tab i18n key is added later */}
      <span className="sr-only">{t.common.appName}</span>
    </div>
  );
}
