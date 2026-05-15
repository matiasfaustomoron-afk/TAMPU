"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronRight,
  Ticket,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useAllTrips } from "@/lib/hooks/use-trip-data";
import { useSupabase } from "@/lib/context/supabase-provider";
import { loadDemoTrip, hasUserTrip } from "@/lib/demo/papua-seoul-trip";
import { toast } from "@/components/ios/toast";
import { track, EVENTS } from "@/lib/analytics";
import { haptic } from "@/lib/native/platform";
import { useT } from "@/i18n/provider";

/**
 * WELCOME — versión post-auditoría (mayo 2026).
 *
 * Decisión estratégica (lifestyle business / red-team auditor):
 *   - YA NO mostramos founder-data (Papúa+Seúl) en hero/CTA/cards. Confundía
 *     al nuevo user, no se identificaba con destinos esotéricos, dañaba
 *     conversión en early access.
 *   - El welcome ahora es genérico: tagline corto + 3 cards de "qué resuelve" +
 *     CTA primario al wizard de viajes + demo como secundario.
 *   - El viaje Papúa+Seúl vive en `src/lib/demo/papua-seoul-trip.ts` como
 *     módulo opt-in. Si mañana borramos el demo, borrás un archivo y se va
 *     limpio.
 *
 * Visual: Faena editorial mode — cream warm + bloques sólidos. Sin photos
 * de destino porque NO queremos forzar una postal específica (el user nuevo
 * decide qué destino quiere). Las cards son tipográficas + iconos.
 *
 * Voseo argentino, copy natural, sin marketing cringe.
 */
export default function WelcomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const { data: trips, loading } = useAllTrips();
  const { user, loading: authLoading } = useSupabase();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasTrips = !loading && trips && trips.length > 0;

  // Si el user ya tiene un viaje, no debería ver welcome — redirige a /today.
  // Excepción: si está pendiente la confirmación del demo, NO redirigimos
  // (sino el modal se cierra antes de que el user pueda decidir).
  // Guard: solo disparar cuando estamos efectivamente en /welcome — durante
  // la transición de router.replace() React puede re-correr este efecto en
  // un momento donde pathname ya cambió pero el componente todavía no se
  // desmontó, generando un segundo replace() innecesario (flicker visible).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname !== "/welcome") return;
    if (hasTrips && !confirmOpen) router.replace("/today");
  }, [hasTrips, router, confirmOpen, pathname]);

  // Si el user está autenticado pero todavía no tiene ningún viaje, lo
  // mandamos directo al wizard de creación. Welcome page tiene sentido para
  // anon (signup CTA), no para auth-without-trip — ese caso necesita acción.
  // Mismo guard que arriba: si pathname ya cambió, NO disparamos el replace —
  // estamos en transición y dispararlo crea un flicker al volver a /welcome
  // por un frame antes de irse a /trips?wizard=1.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname !== "/welcome") return;
    if (!authLoading && !loading && user && !hasTrips && !confirmOpen) {
      router.replace("/trips?wizard=1");
    }
  }, [authLoading, loading, user, hasTrips, confirmOpen, router, pathname]);

  useEffect(() => {
    track(EVENTS.ONBOARDING_START);
  }, []);

  const doLoadDemo = () => {
    track(EVENTS.ONBOARDING_LOAD_EXAMPLE);
    haptic("medium");
    loadDemoTrip();
    toast(t.welcome.demoToast, "success");
    setTimeout(() => router.push("/today"), 350);
  };

  const handleDemoCta = () => {
    haptic("light");
    if (hasUserTrip()) {
      setConfirmOpen(true);
      return;
    }
    doLoadDemo();
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-2xl skeleton" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <section className="px-6 pt-14 pb-20 max-w-2xl mx-auto">
        {/* Eyebrow */}
        <p className="text-[11px] font-bold tracking-[0.32em] uppercase text-primary mb-6">
          {t.welcome.eyebrow}
        </p>

        {/* Hero — serif huge, sin destino hardcodeado.
            text-balance reparte el wrap evitando viuda (1 palabra suelta en
            última línea). Chrome 114+ / Safari 17.4+ / Firefox 121+. */}
        <h1 className="font-serif text-[52px] sm:text-[68px] leading-[0.94] text-foreground tracking-tight text-balance">
          {t.welcome.title}
        </h1>
        <h2 className="font-serif italic text-[40px] sm:text-[52px] leading-[0.98] text-primary mt-2 text-balance">
          {t.welcome.titleItalic}
        </h2>

        {/* Subtitle — 1 oración, descriptivo, sin marketing */}
        <p className="mt-8 text-[16px] leading-[1.55] text-foreground/85 max-w-md">
          {t.welcome.subtitle}
        </p>

        {/* 3 cards "qué resuelve" — concretas, no genéricas */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FeatureCard
            icon={<Ticket className="w-5 h-5" />}
            title={t.welcome.cards.passes.title}
            body={t.welcome.cards.passes.body}
          />
          <FeatureCard
            icon={<ShieldCheck className="w-5 h-5" />}
            title={t.welcome.cards.vault.title}
            body={t.welcome.cards.vault.body}
          />
          <FeatureCard
            icon={<Wallet className="w-5 h-5" />}
            title={t.welcome.cards.money.title}
            body={t.welcome.cards.money.body}
          />
        </div>

        {/* Primary CTA — bloque terracota sólido, claro y dominante */}
        <Link
          href="/trips"
          onClick={() => {
            haptic("light");
            track(EVENTS.ONBOARDING_CREATE_TRIP);
          }}
          className="mt-10 inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-4 rounded-2xl text-[15px] font-semibold text-white tampu-block-terracota pressable shadow-[var(--shadow-card)]"
        >
          {t.welcome.primaryCta}
          <ChevronRight className="w-4 h-4" />
        </Link>

        {/* Secondary — demo opt-in, sutil */}
        <button
          type="button"
          onClick={handleDemoCta}
          className="mt-3 block w-full sm:w-auto text-left sm:text-center text-[13px] text-muted-foreground hover:text-foreground font-medium py-3 px-2 transition-colors underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground/50"
        >
          {t.welcome.secondaryCta}
        </button>

        {/* Atajo opcional — pegar email */}
        <Link
          href="/import"
          onClick={() =>
            track(EVENTS.ONBOARDING_CREATE_TRIP, { variant: "import-first" })
          }
          className="mt-2 block text-[13px] text-muted-foreground hover:text-foreground font-medium py-2 transition-colors"
        >
          {t.welcome.pasteEmail} →
        </Link>

        {/* Pills editoriales — qué garantiza el producto */}
        <div className="mt-12 flex flex-wrap items-center gap-2">
          {[
            t.welcome.pills.offline,
            t.welcome.pills.noAccounts,
            t.welcome.pills.noTracking,
            t.welcome.pills.wallet,
            t.welcome.pills.languages,
          ].map((label) => (
            <span
              key={label}
              className="px-3 py-1.5 rounded-full text-[10.5px] font-semibold bg-card text-muted-foreground border border-border tracking-wide"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Confirmación: ya hay viaje real cargado y el user pidió demo */}
      {confirmOpen && (
        <DemoConfirmDialog
          title={t.welcome.demoConfirm.title}
          body={t.welcome.demoConfirm.body}
          accept={t.welcome.demoConfirm.accept}
          cancel={t.welcome.demoConfirm.cancel}
          onAccept={() => {
            setConfirmOpen(false);
            doLoadDemo();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// FeatureCard — tipográfica + icono. Sin foto (welcome es destino-agnóstico).
// ──────────────────────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]">
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 text-primary mb-3"
        aria-hidden
      >
        {icon}
      </span>
      <h3 className="font-serif text-[20px] leading-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
        {body}
      </p>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// DemoConfirmDialog — modal liviano cuando el user ya tiene viaje cargado.
// Sin dependencias externas (Sheet/Dialog) para no acoplar el welcome a otras
// estructuras del componente library.
// ──────────────────────────────────────────────────────────────────────────

function DemoConfirmDialog({
  title,
  body,
  accept,
  cancel,
  onAccept,
  onCancel,
}: {
  title: string;
  body: string;
  accept: string;
  cancel: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-confirm-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-card rounded-3xl shadow-[var(--shadow-floating)] p-6 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="demo-confirm-title"
          className="font-serif text-[24px] leading-tight text-foreground"
        >
          {title}
        </h3>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          {body}
        </p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 rounded-xl text-[14px] font-semibold text-foreground bg-muted hover:bg-muted/80 transition-colors pressable"
          >
            {cancel}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="px-5 py-3 rounded-xl text-[14px] font-semibold text-white tampu-block-terracota pressable shadow-[var(--shadow-card)]"
          >
            {accept}
          </button>
        </div>
      </div>
    </div>
  );
}
