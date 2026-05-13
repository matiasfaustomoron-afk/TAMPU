"use client";

import { Plane, Bed, Compass, ExternalLink, Train, Shield, Wifi, Info } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { PARTNER_CONFIG, buildAffiliateUrl, type Partner } from "@/lib/affiliates/config";

/**
 * Booking deep-links + AFFILIATE DISCLOSURE TRANSPARENTE.
 *
 * Refactor mayo 2026: la config de partners + tracking IDs vive en
 * `lib/affiliates/config.ts` para que el ENV controle qué partners están activos
 * realmente (tracking ID real) vs cuáles son placeholder (sin tracking).
 *
 * El componente:
 *  - Renderiza las 6 categorías
 *  - Para cada partner: si está activated (tiene tracking ID en ENV), construye la URL
 *    afiliada real con el ID. Si no, link directo sin ganancia (badge oculto).
 *  - Footer cuenta SOLO los partners realmente activos.
 *
 * Postura ética:
 *  - SIEMPRE mostrar 2+ opciones del mismo vertical (no solo la afiliada).
 *  - El badge "Tampu gana $X" solo aparece si el partner está REALMENTE afiliado.
 *  - "Compré por otro lado" siempre disponible (link a /import).
 */

interface Provider {
  partner: Partner;
  name: string;
  icon: typeof Plane;
  tint: string;
  buildPath: (destination: string) => string;
}

// Cada provider linkea a un PARTNER definido en `lib/affiliates/config.ts`.
// El badge "Tampu gana $X" solo aparece si el ENV de ese partner está seteado.
// Sin ENV = link directo sin trackeo, sin promesas vacías al usuario.
const FLIGHTS: Provider[] = [
  { partner: "skyscanner", name: "Skyscanner", icon: Plane, tint: "tampu-icon tampu-icon-indigo",
    buildPath: d => `flights-to/${d}/` },
  { partner: "google-flights", name: "Google Flights", icon: Plane, tint: "tampu-icon tampu-icon-indigo",
    buildPath: d => `?q=${encodeURIComponent("flights to " + d)}` },
  { partner: "kayak", name: "Kayak", icon: Plane, tint: "tampu-icon tampu-icon-canela",
    buildPath: d => `${d}` },
];

const HOTELS: Provider[] = [
  { partner: "booking", name: "Booking.com", icon: Bed, tint: "tampu-icon tampu-icon-indigo",
    buildPath: d => `?ss=${encodeURIComponent(d)}` },
  { partner: "airbnb", name: "Airbnb", icon: Bed, tint: "tampu-icon tampu-icon-carmin",
    buildPath: d => `${d}` },
  { partner: "hostelworld", name: "Hostelworld", icon: Bed, tint: "tampu-icon tampu-icon-cobre",
    buildPath: d => `?search_keywords=${encodeURIComponent(d)}` },
];

const EXPERIENCES: Provider[] = [
  { partner: "getyourguide", name: "GetYourGuide", icon: Compass, tint: "tampu-icon tampu-icon-cardon",
    buildPath: d => `?q=${encodeURIComponent(d)}` },
  { partner: "viator", name: "Viator", icon: Compass, tint: "tampu-icon tampu-icon-mostaza",
    buildPath: d => `${d}` },
];

const TRAINS: Provider[] = [
  { partner: "trainline", name: "Trainline", icon: Train, tint: "tampu-icon tampu-icon-cardon",
    buildPath: d => `${d}` },
];

const INSURANCE: Provider[] = [
  { partner: "heymondo", name: "Heymondo", icon: Shield, tint: "tampu-icon tampu-icon-cardon",
    buildPath: () => `` },
  { partner: "iati", name: "IATI Seguros", icon: Shield, tint: "tampu-icon tampu-icon-cobre",
    buildPath: () => `` },
  { partner: "assistcard", name: "Assist Card", icon: Shield, tint: "tampu-icon tampu-icon-terracota",
    buildPath: () => `` },
];

const ESIM: Provider[] = [
  { partner: "airalo", name: "Airalo", icon: Wifi, tint: "tampu-icon tampu-icon-indigo",
    buildPath: () => `` },
  { partner: "holafly", name: "Holafly", icon: Wifi, tint: "tampu-icon tampu-icon-cobre",
    buildPath: () => `` },
];

/**
 * Affiliate disclosure pill — solo aparece si el partner está REALMENTE activado.
 * "Activado" = tracking ID en env var. Sin tracking ID, sin badge, sin promesa vacía.
 */
function AffiliatePill({ partner }: { partner: Partner }) {
  const spec = PARTNER_CONFIG[partner];
  if (!spec.envKey) return null;
  const isActive =
    typeof process !== "undefined" && spec.envKey ? !!process.env[spec.envKey] : false;
  if (!isActive || !spec.expectedRate) return null;
  const r = spec.expectedRate;
  return (
    <span
      className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-warning/15 text-warning whitespace-nowrap"
      title={`Si reservás acá, Tampu gana ${r.currency} ${r.amount.toFixed(2)} ${r.conditions}. El precio para vos no cambia.`}
    >
      <Info className="w-2.5 h-2.5" aria-hidden />
      Tampu gana ${r.amount.toFixed(2)}
    </span>
  );
}

export function BookingLinks({ destination }: { destination: string }) {
  if (!destination || destination.trim().length < 2) return null;

  const sections: { label: string; items: Provider[] }[] = [
    { label: "Vuelos", items: FLIGHTS },
    { label: "Hoteles & estadía", items: HOTELS },
    { label: "Experiencias", items: EXPERIENCES },
    { label: "Seguros de viaje", items: INSURANCE },
    { label: "eSIM / conectividad", items: ESIM },
    { label: "Trenes", items: TRAINS },
  ];

  // Conteo de partners REALMENTE activos (tracking ID en env). Sin ENV = 0.
  const allPartners = sections.flatMap(s => s.items.map(i => i.partner));
  const totalActive = allPartners.filter(p => {
    const spec = PARTNER_CONFIG[p];
    if (!spec.envKey) return false;
    return typeof process !== "undefined" && !!process.env[spec.envKey];
  }).length;

  return (
    <div className="ios-card overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <p className="ios-eyebrow !p-0 flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5 text-primary" aria-hidden />
          Reservar para {destination}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Búsquedas pre-cargadas en los sitios que ya usás
        </p>
      </div>
      <div className="px-5 pb-3 space-y-4">
        {sections.map(section => (
          <div key={section.label}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{section.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {section.items.map(p => {
                const Icon = p.icon;
                return (
                  <a
                    key={p.partner}
                    href={buildAffiliateUrl(p.partner, p.buildPath(destination))}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(
                      "pressable inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11.5px] font-semibold",
                      p.tint
                    )}
                    aria-label={`Reservar en ${p.name}`}
                  >
                    <Icon className="w-3 h-3" aria-hidden /> {p.name}
                    <AffiliatePill partner={p.partner} />
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Transparent affiliate footer ─── */}
      <div className="px-5 py-3 border-t border-border/40 bg-warning/5">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" aria-hidden />
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Sobre los badges amarillos.</strong>{" "}
            {totalActive > 0 ? (
              <>
                Son {totalActive} {totalActive === 1 ? "partner activo donde Tampu recibe" : "partners activos donde Tampu recibe"} una pequeña
                comisión si comprás por nuestro link. <strong>El precio para vos es el mismo</strong>{" "}
                que entrando directo al sitio — así nos sostenemos sin cobrar suscripción.
              </>
            ) : (
              <>
                Por ahora <strong>Tampu no tiene programas de afiliación activos</strong>. Los
                links de arriba son directos a los sitios, sin trackeo y sin ganancia para
                nosotros. Cuando activemos partnerships, vas a ver badges amarillos con el
                monto exacto que ganamos por conversión.
              </>
            )}{" "}
            Si comprás por otro lado, cargá la reserva manual en{" "}
            <a href="/import" className="text-primary underline">Importar</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
