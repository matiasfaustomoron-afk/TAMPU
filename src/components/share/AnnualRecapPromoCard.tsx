"use client";

// ─── AnnualRecapPromoCard ────────────────────────────────────────────────
//
// Promo "Tampu · Unpacked" (estilo Spotify Wrapped) que solo aparece entre
// Noviembre y Enero. CTA hacia /recap/year/[userId]?y=YYYY donde renderizamos
// países / días / vuelos del año. Si estamos en Enero, mostramos el año
// anterior (la cobertura de Wrapped clásica).
//
// Si no hay user (demo / unconfigured / loading), el card simplemente no se
// monta — no rompe el feed Hoy.

import Link from "next/link";
import { useSupabase } from "@/lib/context/supabase-provider";

export function AnnualRecapPromoCard() {
  const { user } = useSupabase();

  // Solo visible Nov, Dic, Ene (month index 10, 11, 0)
  const month = new Date().getMonth();
  if (![10, 11, 0].includes(month)) return null;
  if (!user?.id) return null;

  const year = month === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();

  return (
    <Link
      href={`/recap/year/${user.id}?y=${year}`}
      className="block ios-feature-card tampu-gradient-warm text-white pressable"
      aria-label={`Tampu Unpacked ${year}`}
    >
      <div className="p-4">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/80">
          Tampu · Unpacked
        </p>
        <h3 className="text-lg font-semibold mt-1 text-white">
          Tu año en viajes {year}
        </h3>
        <p className="text-sm text-white/90 mt-1">
          Países, días, vuelos. Listo para compartir.
        </p>
      </div>
    </Link>
  );
}
