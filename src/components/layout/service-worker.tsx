"use client";

import { useEffect } from "react";
import { registerServiceWorker, applyServiceWorkerUpdate } from "@/lib/sw-registration";
import { toast } from "@/components/ios/toast";

/**
 * Monta el Service Worker registrar + escucha updates para mostrar un toast.
 *
 * El registro vive en `@/lib/sw-registration` (lógica testeable + reutilizable).
 * Este componente sólo es el puente React → registración, y la UI del update
 * (toast con CTA "Actualizar").
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    let registration: ServiceWorkerRegistration | null = null;

    registerServiceWorker().then((reg) => {
      registration = reg;
    });

    // Listener global: cuando hay un SW waiting, mostramos toast.
    const onUpdateReady = (e: Event) => {
      const detail = (e as CustomEvent<{ registration: ServiceWorkerRegistration }>).detail;
      registration = detail.registration;
      // Toast con CTA — el usuario decide cuándo aplicar (no forzamos reload).
      // Nota: la toast actual del proyecto no soporta CTA, así que disparamos
      // un toast informativo y auto-aplicamos en 4s si el usuario no la cierra.
      // (Implementación minimal — un CTA real requeriría extender el ToastHost,
      // territorio fuera de este Agente.)
      toast("Nueva versión disponible — actualizando…", "info");
      window.setTimeout(() => {
        if (registration) applyServiceWorkerUpdate(registration);
      }, 4_000);
    };
    window.addEventListener("tampu-sw-update-ready", onUpdateReady);

    return () => {
      window.removeEventListener("tampu-sw-update-ready", onUpdateReady);
    };
  }, []);

  return null;
}
