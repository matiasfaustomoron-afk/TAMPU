"use client";
import { useEffect, useMemo } from "react";
import { useActiveTrip, useReservations, useDocuments, useTripDays, useCities } from "@/lib/hooks/use-trip-data";
import { buildEmergencyKit } from "@/lib/domain/emergency";
import { EmptyState } from "@/components/shared";
import { Printer, AlertTriangle } from "lucide-react";

// Single-page print-friendly emergency card.
// Visit /emergency/print and press Cmd/Ctrl+P → save as PDF, fold and carry.

export default function PrintEmergencyPage() {
  const { data: trip } = useActiveTrip();
  const { data: reservations } = useReservations(trip?.id);
  const { data: documents } = useDocuments(trip?.id);
  const { data: tripDays } = useTripDays(trip?.id);
  const { data: cities } = useCities(trip?.id);

  useEffect(() => {
    document.title = "Tampu — Emergency card";
    // Auto-open print dialog after a short delay so React can render the layout first
    const tm = setTimeout(() => {
      if (typeof window !== "undefined") window.print();
    }, 400);
    return () => clearTimeout(tm);
  }, []);

  const kit = useMemo(() => {
    if (!trip) return null;
    return buildEmergencyKit(trip, reservations || [], documents || [], tripDays || [], cities || []);
  }, [trip, reservations, documents, tripDays, cities]);

  if (!trip || !kit) return <EmptyState title="Sin datos" icon={<AlertTriangle className="w-8 h-8" />} />;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; border: none !important; max-width: 100% !important; }
        }
        .print-page { color: #111; background: white; max-width: 210mm; margin: 0 auto; padding: 12mm; font-family: -apple-system, system-ui, sans-serif; }
        .print-page h1 { font-size: 18pt; margin: 0 0 4pt; }
        .print-page h2 { font-size: 11pt; margin: 12pt 0 4pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1pt solid #ccc; padding-bottom: 2pt; }
        .print-page p, .print-page li { font-size: 10pt; line-height: 1.4; }
        .print-page .row { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt; margin: 4pt 0; }
        .print-page .cell { padding: 4pt 6pt; border: 0.5pt solid #ddd; border-radius: 2pt; }
        .print-page .big { font-size: 16pt; font-weight: 700; font-family: ui-monospace, monospace; }
        .print-page .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
        .print-page ul { padding-left: 14pt; margin: 4pt 0; }
        .print-page .warn { background: #fff4e5; border-left: 3pt solid #f59e0b; padding: 4pt 8pt; margin: 6pt 0; }
      `}</style>

      <div className="bg-zinc-100 dark:bg-zinc-900 min-h-screen py-6">
        <div className="no-print max-w-3xl mx-auto mb-4 px-4 flex items-center justify-between">
          <p className="text-sm">Esta página se abrirá el diálogo de imprimir automáticamente. Guardalo como PDF y llevalo en el bolso.</p>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm">
            <Printer className="w-4 h-4" />Imprimir
          </button>
        </div>

        <div className="print-page" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)", borderRadius: "4pt", border: "1pt solid #eee" }}>
          <h1>EMERGENCY CARD — {trip.name}</h1>
          <p style={{ color: "#666", fontSize: "9pt" }}>
            {trip.destination} · {trip.start_date} → {trip.end_date}
          </p>

          <h2>SOS por país</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6pt" }}>
            {kit.countries.map(c => (
              <div key={c.iso2} className="cell">
                <p className="label">{c.country}</p>
                <p className="big">{c.emergency_number}</p>
                {(c.police || c.ambulance) && (
                  <p style={{ fontSize: "8pt", color: "#444" }}>
                    {c.police && `Pol. ${c.police}`} {c.ambulance && `· Amb. ${c.ambulance}`}
                  </p>
                )}
              </div>
            ))}
          </div>

          {kit.insurance_kit && (
            <>
              <h2>Seguro</h2>
              <div className="row">
                <div className="cell">
                  <p className="label">Proveedor</p>
                  <p>{kit.insurance_kit.provider}</p>
                </div>
                <div className="cell">
                  <p className="label">Localizador</p>
                  <p style={{ fontFamily: "ui-monospace, monospace" }}>{kit.insurance_kit.locator || "—"}</p>
                </div>
              </div>
              <div className="cell">
                <p className="label">Contacto 24h</p>
                <p className="big" style={{ fontSize: "12pt" }}>{kit.insurance_kit.contact || "—"}</p>
              </div>
              <div className="warn">
                <p style={{ fontSize: "8pt", fontWeight: 700 }}>GOP — recordatorio</p>
                <p style={{ fontSize: "8pt" }}>{kit.insurance_kit.gop_note}</p>
              </div>
            </>
          )}

          {kit.consulates.length > 0 && (
            <>
              <h2>Consulados argentinos</h2>
              <ul>
                {kit.consulates.map(c => (
                  <li key={c.iso2}>
                    <strong>{c.country}</strong> — {c.city} {c.phone && <span style={{ fontFamily: "ui-monospace, monospace" }}>· {c.phone}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {kit.contacts.length > 0 && (
            <>
              <h2>Contactos del viaje</h2>
              <ul>
                {kit.contacts.slice(0, 12).map((c, i) => (
                  <li key={i}>
                    <strong>{c.label}</strong>
                    {c.detail && <span style={{ fontFamily: "ui-monospace, monospace" }}> · {c.detail}</span>}
                    {c.phone && <span> · {c.phone}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2>Checklist</h2>
          <ul>
            <li>Antes de llamar al seguro: anotar localizador, ubicación, síntomas</li>
            <li>Pedir GOP directa al hospital/operador antes del traslado</li>
            <li>Notificar al consulado argentino del incidente</li>
            <li>Fotos de heridas/daños/documentos. Hora, lugar, testigos</li>
            <li>Conservar recibos para reembolso del seguro</li>
            <li>Pasaporte robado → denuncia policial primero, después consulado</li>
          </ul>

          <p style={{ fontSize: "7pt", color: "#888", marginTop: "8pt", textAlign: "center" }}>
            Generado por Tampu · {new Date().toLocaleDateString("es-AR")}
          </p>
        </div>
      </div>
    </>
  );
}
