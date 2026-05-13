"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Mail, MessageCircle, Camera, Plane } from "lucide-react";
import { useAllTrips } from "@/lib/hooks/use-trip-data";
import { seedExampleTrip } from "@/lib/demo/demo-store";
import { toast } from "@/components/ios/toast";
import { track, EVENTS } from "@/lib/analytics";
import { haptic } from "@/lib/native/platform";
import { DestinationPhoto } from "@/components/brand/destination-photo";

/**
 * WELCOME — Faena editorial mode.
 *
 * Mental model: revista de hospitality premium (Faena, Tierra Hotels, Aman).
 * NO dark canvas. NO scrim que mate la foto. Cream warm de fondo + fotos
 * vibrantes en frames + bloques sólidos Hornocal como marcos del texto.
 *
 * Tipografía: Instrument Serif HUGE para los heroes. Cuerpo sans suelto.
 *
 * Estructura por step:
 *   - eyebrow uppercase tracking ancho
 *   - serif title MUY grande
 *   - serif subtitle italic
 *   - foto andina en frame rounded, 16:10 / 4:5, sin darkening
 *   - cuerpo de texto en cream
 *   - CTA en bloque sólido Hornocal
 *
 * Photos: si están en `/photos/andean/`, se sirven local. Fallback gradient.
 */

// Cada step usa un destino conceptual — el resolver Wikipedia devuelve la postal real.
// Sin curaduría local todavía → Wikipedia es la fuente (Tier 2 del resolver).
const STEP_DESTINATIONS = {
  1: "Machu Picchu",          // Step 1 — la promesa, postal Inca
  2: "Cordillera de los Andes", // Step 2 — el camino
  3: "Hornocal",                // Step 3 — los 14 colores (deliberado para mostrar paleta)
};

export default function WelcomePage() {
  const router = useRouter();
  const { data: trips, loading } = useAllTrips();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const hasTrips = !loading && trips && trips.length > 0;

  useEffect(() => { if (hasTrips) router.replace("/today"); }, [hasTrips, router]);
  useEffect(() => { track(EVENTS.ONBOARDING_START); }, []);
  useEffect(() => { if (step === 2) track(EVENTS.ONBOARDING_AHA_VIEWED); }, [step]);

  const loadExample = () => {
    track(EVENTS.ONBOARDING_LOAD_EXAMPLE);
    haptic("medium");
    seedExampleTrip();
    toast("Viaje de ejemplo cargado", "success");
    setTimeout(() => router.push("/today"), 350);
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
      {/* Progress dots — terracota Hornocal */}
      <div className="px-6 pt-5 flex items-center justify-center gap-2">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1 rounded-full transition-all duration-500 ${
              n === step ? "w-10 bg-primary" : n < step ? "w-5 bg-primary/50" : "w-5 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div key={step} className="animate-fade-in">
        {step === 1 && <StepOne onNext={() => { haptic("light"); setStep(2); }} />}
        {step === 2 && <StepTwo onBack={() => { haptic("light"); setStep(1); }} onNext={() => { haptic("light"); setStep(3); }} />}
        {step === 3 && <StepThree onBack={() => { haptic("light"); setStep(2); }} onLoadExample={loadExample} />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// STEP 1 — La promesa editorial
// ──────────────────────────────────────────────────────────────────────────

function StepOne({ onNext }: { onNext: () => void }) {
  return (
    <section className="px-6 pt-12 pb-16 max-w-2xl mx-auto">
      <p className="text-[11px] font-bold tracking-[0.32em] uppercase text-primary mb-6">
        Tampu · La posta del viajero
      </p>

      <h1 className="font-serif text-[52px] sm:text-[68px] leading-[0.94] text-foreground tracking-tight">
        Tu cartera<br />de viaje.
      </h1>

      <h2 className="font-serif italic text-[34px] sm:text-[44px] leading-[0.98] text-primary mt-3">
        Sabe lo que te falta.
      </h2>

      {/* Foto Hero — resolver Wikipedia trae la postal icónica de Machu Picchu */}
      <figure className="mt-10 relative">
        <div className="rounded-2xl overflow-hidden shadow-[var(--shadow-floating)]">
          <DestinationPhoto destination={STEP_DESTINATIONS[1]} aspect="4/5" priority showCredit />
        </div>
        <div className="tampu-stratigraphy-bar h-1.5 mt-0" aria-hidden />
        <figcaption className="mt-3 text-[10px] tracking-[0.20em] uppercase text-muted-foreground">
          Machu Picchu · Perú · La posta del Inca
        </figcaption>
      </figure>

      <p className="mt-10 text-[16px] leading-[1.55] text-foreground/85 max-w-md">
        Reenviás un email o un WhatsApp con tu reserva y aparece en tu viaje.
        Offline. Sin cuentas. Sin tracking.
      </p>

      <button
        onClick={onNext}
        className="mt-8 inline-flex items-center gap-2 px-7 py-4 rounded-2xl text-[15px] font-semibold text-white tampu-block-terracota pressable shadow-[var(--shadow-card)]"
      >
        Ver cómo funciona
        <ChevronRight className="w-4 h-4" />
      </button>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// STEP 2 — El aha: email → pase de embarque
// ──────────────────────────────────────────────────────────────────────────

function StepTwo({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <section className="px-6 pt-12 pb-16 max-w-2xl mx-auto">
      <p className="text-[11px] font-bold tracking-[0.32em] uppercase text-primary mb-5">
        Cómo funciona
      </p>

      <h2 className="font-serif text-[52px] sm:text-[64px] leading-[0.94] text-foreground tracking-tight">
        Lo reenviás.<br />
        <span className="italic text-primary">Aparece.</span>
      </h2>

      {/* Foto Cordillera — resolver Wikipedia */}
      <figure className="mt-9 relative">
        <div className="rounded-2xl overflow-hidden shadow-[var(--shadow-floating)]">
          <DestinationPhoto destination={STEP_DESTINATIONS[2]} aspect="16/10" showCredit />
        </div>
        <div className="tampu-stratigraphy-bar h-1.5 mt-0" aria-hidden />
      </figure>

      {/* 3 source channels — neutros sobre cream, mismo tratamiento.
          Disciplina 1+1: solo el primary terracota cuando se selecciona, el resto
          en cream. Sin saturación. */}
      <div className="mt-8 grid grid-cols-3 gap-2">
        <SourceCell icon={<Mail className="w-4 h-4" />} label="Email" sub="Vuelo BUE→SCL" />
        <SourceCell icon={<MessageCircle className="w-4 h-4" />} label="WhatsApp" sub="Check-in Cusco" />
        <SourceCell icon={<Camera className="w-4 h-4" />} label="Foto" sub="Tour Machu" />
      </div>

      {/* Arrow descending — terracota solid */}
      <div className="mt-6 flex flex-col items-center">
        <span className="w-9 h-9 rounded-full tampu-block-terracota flex items-center justify-center shadow-[var(--shadow-card)]" aria-hidden>
          <ChevronRight className="w-4 h-4 rotate-90 text-white" strokeWidth={2.5} />
        </span>
      </div>

      {/* Pase de embarque — el ÚNICO bloque oscuro de la pantalla. Foco visual.
          Decisión auditor mayo 2026: el eyebrow visible al user dice "Pase de
          embarque" (español argentino premium), no "Boarding pass". El comment
          de código sí queda como "boarding pass" porque ahí es term técnico. */}
      <article className="mt-6 relative tampu-block-indigo rounded-2xl p-6 overflow-hidden shadow-[var(--shadow-floating)]">
        <span aria-hidden className="absolute top-4 right-4 opacity-70">
          <Plane className="w-5 h-5" />
        </span>
        <p className="text-[10px] font-bold tracking-[0.28em] uppercase opacity-75 mb-2">Pase de embarque</p>
        <h3 className="font-serif text-3xl leading-tight">LATAM LA8064</h3>
        <p className="text-[15px] opacity-90 mt-1">Buenos Aires → Santiago</p>

        <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-3 gap-3 text-[11px]">
          <div>
            <p className="opacity-70 uppercase tracking-wider">Localizador</p>
            <p className="font-mono mt-0.5">QWERTY</p>
          </div>
          <div>
            <p className="opacity-70 uppercase tracking-wider">Asiento</p>
            <p className="font-mono mt-0.5">12A</p>
          </div>
          <div>
            <p className="opacity-70 uppercase tracking-wider">Gate</p>
            <p className="font-mono mt-0.5">—</p>
          </div>
        </div>
        <p className="mt-4 text-[11px] opacity-80">Disponible offline · Apple Wallet ready</p>
      </article>

      <p className="mt-9 text-[15px] leading-[1.55] text-foreground/85">
        Funciona en español, portugués e inglés. LATAM, Aerolineas, Despegar, Airbnb,
        Booking, transfers por WhatsApp.{" "}
        <strong className="text-foreground">Cero templates — lo lee el asistente.</strong>
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button onClick={onBack} className="text-[13px] text-muted-foreground font-medium px-4 py-2.5 pressable">
          ← Atrás
        </button>
        <button
          onClick={onNext}
          className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-[15px] font-semibold text-white tampu-block-terracota pressable shadow-[var(--shadow-card)]"
        >
          Empezar mi viaje
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

function SourceCell({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-[var(--shadow-card)]">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary mb-2" aria-hidden>
        {icon}
      </span>
      <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">{label}</p>
      <p className="text-[11px] mt-0.5 text-foreground truncate">{sub}</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// STEP 3 — Elegí cómo empezar
// ──────────────────────────────────────────────────────────────────────────

function StepThree({ onBack, onLoadExample }: { onBack: () => void; onLoadExample: () => void }) {
  return (
    <section className="px-6 pt-12 pb-16 max-w-2xl mx-auto">
      <p className="text-[11px] font-bold tracking-[0.32em] uppercase text-primary mb-5">
        Elegí cómo empezar
      </p>

      <h2 className="font-serif text-[48px] sm:text-[60px] leading-[0.94] text-foreground tracking-tight">
        ¿Mirás un viaje real
        <br />
        <span className="italic text-primary">o lo armás vos?</span>
      </h2>

      {/* Foto Hornocal — los 14 colores reales del cerro */}
      <figure className="mt-9 relative">
        <div className="rounded-2xl overflow-hidden shadow-[var(--shadow-floating)]">
          <DestinationPhoto destination={STEP_DESTINATIONS[3]} aspect="16/10" showCredit />
        </div>
        <div className="tampu-stratigraphy-bar h-1.5 mt-0" aria-hidden />
      </figure>

      {/* Path A — bloque TERRACOTA sólido, recomendado */}
      <button
        onClick={onLoadExample}
        className="mt-8 w-full text-left tampu-block-terracota rounded-2xl p-6 pressable shadow-[var(--shadow-floating)] relative overflow-hidden"
        aria-label="Cargar viaje de ejemplo"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase opacity-85 mb-1.5">
              Recomendado · 5 segundos
            </p>
            <h3 className="font-serif text-[28px] leading-tight">Cargar viaje de ejemplo</h3>
            <p className="text-[14px] mt-2 opacity-92 leading-snug">
              Papúa + Seúl 2026 · 11 días, 6 reservas, 4 documentos.
              Para ver cómo se siente Tampu en uso.
            </p>
          </div>
          <ChevronRight className="w-6 h-6 shrink-0 mt-2 opacity-80" />
        </div>
      </button>

      {/* Path B — bloque CREAM con borde terracota, secundario */}
      <Link
        href="/trips"
        onClick={() => track(EVENTS.ONBOARDING_CREATE_TRIP)}
        className="mt-3 block w-full text-left bg-card rounded-2xl p-6 pressable shadow-[var(--shadow-card)] border-2 border-primary/15 hover:border-primary/40 transition-colors"
        aria-label="Crear mi propio viaje"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground mb-1.5">
              Si ya sabés a dónde vas
            </p>
            <h3 className="font-serif text-[28px] leading-tight text-foreground">Crear mi viaje</h3>
            <p className="text-[14px] text-muted-foreground mt-2 leading-snug">
              Destino, fechas y listo. 30 segundos. Después podés reenviar tus confirmaciones.
            </p>
          </div>
          <ChevronRight className="w-6 h-6 shrink-0 mt-2 text-primary" />
        </div>
      </Link>

      <Link
        href="/import"
        onClick={() => track(EVENTS.ONBOARDING_CREATE_TRIP, { variant: "import-first" })}
        className="mt-5 block text-center text-[13px] text-muted-foreground hover:text-foreground font-medium py-2 transition-colors"
      >
        o pegá un email para empezar →
      </Link>

      {/* Pills editoriales — cream con thin border */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {["Offline", "Sin cuentas", "Sin tracking", "Apple Wallet", "Español + PT"].map((label) => (
          <span
            key={label}
            className="px-3 py-1.5 rounded-full text-[10.5px] font-semibold bg-card text-muted-foreground border border-border tracking-wide"
          >
            {label}
          </span>
        ))}
      </div>

      <button
        onClick={onBack}
        className="mt-6 mx-auto block text-[12px] text-muted-foreground font-medium pressable"
      >
        ← Atrás
      </button>
    </section>
  );
}
