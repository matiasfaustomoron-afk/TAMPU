"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LargeTitle, IOSSection, IOSRow, IOSFeatureCard, Pill } from "@/components/ios";
import { EmptyState } from "@/components/shared";
import { useActiveTrip, useReservations, useDocuments, useTripDays, useCities } from "@/lib/hooks/use-trip-data";
import { buildEmergencyKit } from "@/lib/domain/emergency";
import {
  AlertTriangle, Phone, Shield, Building2, Home, Plane, MapPin,
  FileText, Printer, Ambulance,
} from "lucide-react";

const KIND_ICON: Record<string, React.ReactNode> = {
  insurance: <Shield className="w-4 h-4" />,
  tour_operator: <MapPin className="w-4 h-4" />,
  host: <Home className="w-4 h-4" />,
  airline: <Plane className="w-4 h-4" />,
  consulate: <Building2 className="w-4 h-4" />,
  embassy: <Building2 className="w-4 h-4" />,
  other: <Phone className="w-4 h-4" />,
};

export default function EmergencyPage() {
  const { data: trip } = useActiveTrip();
  const { data: reservations } = useReservations(trip?.id);
  const { data: documents } = useDocuments(trip?.id);
  const { data: tripDays } = useTripDays(trip?.id);
  const { data: cities } = useCities(trip?.id);

  const kit = useMemo(() => {
    if (!trip) return null;
    return buildEmergencyKit(trip, reservations || [], documents || [], tripDays || [], cities || []);
  }, [trip, reservations, documents, tripDays, cities]);

  if (!trip || !kit) {
    return (
      <div className="animate-fade-in">
        <LargeTitle title="SOS" eyebrow="Emergencia" serif />
        <div className="mt-8">
          <EmptyState title="Sin datos de emergencia" icon={<AlertTriangle className="w-8 h-8" />} />
        </div>
      </div>
    );
  }

  const primaryCountry = kit.countries[0];

  return (
    <div className="animate-fade-in">
      <LargeTitle
        eyebrow={kit.current_country ? `Hoy en ${kit.current_country}` : "Modo emergencia"}
        title="SOS"
        serif
        action={
          <Link href="/emergency/print">
            <Button size="sm" variant="outline" className="gap-1">
              <Printer className="w-3.5 h-3.5" />Card
            </Button>
          </Link>
        }
      />

      {/* ─── Hero — primary emergency number, BIG ─── */}
      {primaryCountry && (
        <div className="px-4">
          <IOSFeatureCard
            gradient="linear-gradient(135deg, #991b1b, #ef4444)"
            className="text-white relative"
            padding="xl"
          >
            <div className="absolute top-4 right-4">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" aria-hidden />
            </div>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/80">
              {primaryCountry.country}
            </p>
            <p className="text-[11px] text-white/60 mt-1">Llamada directa de emergencia</p>
            <a
              href={`tel:${primaryCountry.emergency_number}`}
              className="block mt-3 pressable"
              aria-label={`Llamar ${primaryCountry.emergency_number}`}
            >
              <p className="font-serif text-[88px] sm:text-[112px] leading-[0.85] tabular-nums tracking-tight">
                {primaryCountry.emergency_number}
              </p>
            </a>
            <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
              {primaryCountry.police && (
                <a href={`tel:${primaryCountry.police}`}
                   className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 pressable">
                  🚓 Policía · {primaryCountry.police}
                </a>
              )}
              {primaryCountry.ambulance && (
                <a href={`tel:${primaryCountry.ambulance}`}
                   className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 pressable">
                  🚑 Ambulancia · {primaryCountry.ambulance}
                </a>
              )}
            </div>
            {primaryCountry.notes && (
              <p className="text-[11px] text-white/75 mt-3 leading-relaxed">{primaryCountry.notes}</p>
            )}
          </IOSFeatureCard>
        </div>
      )}

      {/* Other countries (rest of the trip) */}
      {kit.countries.length > 1 && (
        <IOSSection eyebrow="Otros países del viaje">
          {kit.countries.slice(1).map(c => (
            <IOSRow
              key={c.iso2}
              icon={<Ambulance className="w-4 h-4" />}
              iconBg="tampu-icon tampu-icon-carmin"
              title={c.country}
              subtitle={[c.police && `Policía ${c.police}`, c.ambulance && `Ambulancia ${c.ambulance}`].filter(Boolean).join(" · ")}
              value={<span className="font-mono text-base font-bold">{c.emergency_number}</span>}
            />
          ))}
        </IOSSection>
      )}

      {/* Insurance kit */}
      {kit.insurance_kit && (
        <IOSSection eyebrow="Seguro de viaje" footer="Importante: pedí GOP (Guarantee of Payment) directa al hospital antes del traslado.">
          <IOSRow
            icon={<Shield className="w-4 h-4" />}
            iconBg="tampu-icon tampu-icon-indigo"
            title={kit.insurance_kit.provider}
            subtitle={kit.insurance_kit.locator ? `Localizador ${kit.insurance_kit.locator}` : "Sin localizador"}
          />
          {kit.insurance_kit.contact && (
            <IOSRow
              icon={<Phone className="w-4 h-4" />}
              iconBg="tampu-icon tampu-icon-cardon"
              title="Contacto 24h"
              subtitle={kit.insurance_kit.contact}
              onClick={() => { window.location.href = `tel:${kit.insurance_kit!.contact}`; }}
              chevron
            />
          )}
          {kit.insurance_kit.notes && (
            <div className="ios-list-row">
              <span className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                <FileText className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug text-muted-foreground">{kit.insurance_kit.notes}</p>
              </div>
            </div>
          )}
        </IOSSection>
      )}

      {/* Consulates */}
      {kit.consulates.length > 0 && (
        <IOSSection eyebrow="Consulados argentinos">
          {kit.consulates.map(c => (
            <IOSRow
              key={c.iso2}
              icon={<Building2 className="w-4 h-4" />}
              iconBg="tampu-icon tampu-icon-indigo"
              title={c.country}
              subtitle={[c.city, c.phone].filter(Boolean).join(" · ")}
              onClick={c.phone ? () => { window.location.href = `tel:${c.phone}`; } : undefined}
              chevron={!!c.phone}
            />
          ))}
        </IOSSection>
      )}

      {/* Personal contacts from reservations + documents */}
      {kit.contacts.length > 0 && (
        <IOSSection eyebrow="Contactos del viaje">
          {kit.contacts.map((c, i) => (
            <IOSRow
              key={i}
              icon={KIND_ICON[c.kind] || KIND_ICON.other}
              iconBg={c.ready ? "tampu-icon tampu-icon-cardon" : "tampu-icon tampu-icon-mostaza"}
              title={c.label}
              subtitle={[c.detail, c.phone].filter(Boolean).join(" · ")}
              value={!c.ready ? <Pill tone="warn">Falta</Pill> : undefined}
              onClick={c.phone ? () => { window.location.href = `tel:${c.phone}`; } : undefined}
              chevron={!!c.phone}
            />
          ))}
        </IOSSection>
      )}

      {/* Offline doc status */}
      {(documents || []).filter(d => d.criticality === "blocker" || d.criticality === "essential").length > 0 && (
        <IOSSection eyebrow="Documentos offline" footer="Si te quedás sin internet, estos deberían estar guardados en tu Vault.">
          {(documents || [])
            .filter(d => d.criticality === "blocker" || d.criticality === "essential")
            .map(d => (
              <IOSRow
                key={d.id}
                icon={<FileText className="w-4 h-4" />}
                iconBg={d.has_offline_copy ? "tampu-icon tampu-icon-cardon" : "tampu-icon tampu-icon-carmin"}
                title={d.name}
                value={
                  d.has_offline_copy
                    ? <Pill tone="ok">OK</Pill>
                    : <Pill tone="alert">Descargar</Pill>
                }
                href="/vault"
                chevron
              />
            ))}
        </IOSSection>
      )}

      {/* Mental checklist */}
      <section className="px-4 mb-8">
        <p className="ios-eyebrow">Checklist mental</p>
        <div className="ios-card p-5 space-y-3 text-[13px] leading-relaxed">
          <ChecklistItem>Antes de llamar al seguro: anotá localizador, ubicación exacta, síntomas.</ChecklistItem>
          <ChecklistItem>Pedí <strong>GOP</strong> directa al hospital antes de cualquier traslado.</ChecklistItem>
          <ChecklistItem>Notificá al consulado argentino del incidente — no esperan que vos viajes, sí que avises.</ChecklistItem>
          <ChecklistItem>Sacá fotos de heridas, daños o documentos. Anotá hora, lugar, testigos.</ChecklistItem>
          <ChecklistItem>Conservá <strong>todos los recibos físicos</strong> para reembolso.</ChecklistItem>
          <ChecklistItem>Pasaporte robado: <strong>denuncia policial primero</strong>, después consulado.</ChecklistItem>
        </div>
      </section>
    </div>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-warning shrink-0" aria-hidden />
      <p className="text-foreground/85">{children}</p>
    </div>
  );
}
