"use client";

/**
 * Trip summary PDF export — zero-dependency approach.
 *
 * DECISION (mayo 2026): instead of bundling jspdf (~140KB even tree-shaken) or
 * html2pdf (~220KB with its html2canvas dep), we open a new tab with print-styled
 * HTML and let the browser/iOS native "Print → Save as PDF" handle it.
 *
 * Wins:
 *   - 0 KB added to bundle
 *   - System fonts + crisp vector text (no canvas rasterization)
 *   - Works on iOS Safari out of the box (Capacitor share sheet picks up PDFs)
 *   - User can pick paper size, orientation, etc.
 *
 * Trade-off: requires user click in print dialog. We surface that clearly in the
 * UX copy ("Tu sistema te va a pedir guardar como PDF").
 *
 * If a future requirement demands fully programmatic export (e.g. background
 * generation for email attachments), swap in jspdf-autotable behind this same
 * `generateTripSummaryPDF` function — callers don't need to change.
 */

import type {
  Trip,
  Reservation,
  TripDay,
  BudgetSummary,
  Document,
} from "@/lib/types/database";

export interface TripSummaryInput {
  trip: Trip;
  reservations: Reservation[];
  tripDays: TripDay[];
  budget: BudgetSummary | null;
  documents: Document[];
  /** Locale for date/currency formatting. Defaults to "es-AR". */
  locale?: string;
}

// ─── Hornocal palette (mirrors BRAND.md / Tampu tokens) ───
const COLORS = {
  terracota: "#B95C3F",
  cardon: "#5E7152",
  mostaza: "#C9A227",
  carmin: "#8E2932",
  indigo: "#2B3A55",
  piedra: "#7C7062",
  paper: "#FBF7F2",
  ink: "#1F1A14",
  inkSoft: "#5C544A",
};

function fmtDate(d: string | null | undefined, locale = "es-AR"): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(locale, {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return d;
  }
}

function fmtCurrency(amount: number, currency: string, locale = "es-AR"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the print-ready HTML document. Inline CSS + system fonts only.
 */
export function buildTripSummaryHTML(input: TripSummaryInput): string {
  const { trip, reservations, tripDays, budget, documents, locale = "es-AR" } = input;
  const startFmt = fmtDate(trip.start_date, locale);
  const endFmt = fmtDate(trip.end_date, locale);
  const days = Math.max(
    1,
    Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000),
  );

  const confirmed = reservations.filter(
    (r) => r.status === "confirmed" || r.status === "paid",
  );
  const emergencyDocs = documents.filter(
    (d) => d.type === "emergency_contact" || d.type === "insurance" || d.type === "medical",
  );

  const cssVars = Object.entries(COLORS)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(" ");

  const reservationRows = confirmed
    .map(
      (r) => `
      <tr>
        <td>${esc(r.type)}</td>
        <td>${esc(r.provider)}</td>
        <td>${fmtDate(r.use_date, locale)}</td>
        <td>${esc(r.locator || "—")}</td>
        <td class="num">${fmtCurrency(r.base_amount, trip.base_currency, locale)}</td>
      </tr>`,
    )
    .join("");

  const dayRows = tripDays
    .map(
      (d) => `
      <tr>
        <td class="day-num">D${d.day_number ?? "—"}</td>
        <td>${fmtDate(d.date, locale)}</td>
        <td>${esc(d.city_name || "—")}</td>
        <td>${esc(d.accommodation || "—")}</td>
        <td>${esc(d.main_activity || "—")}</td>
      </tr>`,
    )
    .join("");

  const emergencyRows = emergencyDocs
    .map(
      (d) => `
      <li>
        <strong>${esc(d.name)}</strong>
        ${d.notes ? ` — <span class="ink-soft">${esc(d.notes)}</span>` : ""}
      </li>`,
    )
    .join("");

  const categories = budget?.categories ?? [];
  const budgetRows = categories
    .map(
      (c) => `
      <tr>
        <td>${esc(c.label)}</td>
        <td class="num">${fmtCurrency(c.budgeted, trip.base_currency, locale)}</td>
        <td class="num">${fmtCurrency(c.spent, trip.base_currency, locale)}</td>
        <td class="num">${c.percent}%</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${locale.startsWith("es") ? "es" : "en"}">
<head>
<meta charset="UTF-8" />
<title>${esc(trip.name)} — Tampu</title>
<style>
  :root { ${cssVars} }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    color: var(--ink);
    background: var(--paper);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 780px; margin: 0 auto; padding: 48px 44px; }
  .ink-soft { color: var(--inkSoft); }
  h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 600;
       font-size: 48px; line-height: 1.05; margin: 0 0 8px; }
  h2 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 600;
       font-size: 26px; margin: 32px 0 10px; color: var(--terracota); }
  h3 { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
       color: var(--inkSoft); font-weight: 700; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #E5DDD2; vertical-align: top; }
  th { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
       color: var(--inkSoft); font-weight: 700; border-bottom: 2px solid var(--ink); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .day-num { font-weight: 700; color: var(--terracota); }
  .cover { padding: 80px 0 60px; border-bottom: 1px solid #E5DDD2; }
  .cover .eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
                    color: var(--terracota); font-weight: 700; }
  .meta { display: flex; flex-wrap: wrap; gap: 24px 40px; margin-top: 20px; font-size: 13px; }
  .meta strong { display: block; font-size: 10px; letter-spacing: 0.14em;
                 text-transform: uppercase; color: var(--inkSoft); font-weight: 700; margin-bottom: 2px; }
  ul.contacts { padding: 0; margin: 0; list-style: none; font-size: 13px; }
  ul.contacts li { padding: 8px 0; border-bottom: 1px solid #E5DDD2; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #E5DDD2;
            font-size: 10px; color: var(--inkSoft); display: flex; justify-content: space-between; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px;
           font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
           background: var(--mostaza); color: white; text-transform: uppercase; }
  @media print {
    .page { padding: 28px 32px; }
    h2 { page-break-after: avoid; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="cover">
    <p class="eyebrow">Tampu · Resumen de viaje</p>
    <h1>${esc(trip.name)}</h1>
    <p class="ink-soft" style="font-size:16px;margin:4px 0 0">${esc(trip.destination)}</p>
    <div class="meta">
      <div><strong>Salida</strong>${startFmt}</div>
      <div><strong>Vuelta</strong>${endFmt}</div>
      <div><strong>Duración</strong>${days} días</div>
      <div><strong>Presupuesto</strong>${fmtCurrency(trip.total_budget, trip.base_currency, locale)}</div>
      <div><span class="badge">${esc(trip.status)}</span></div>
    </div>
  </div>

  ${dayRows
    ? `
  <h2>Itinerario día por día</h2>
  <table>
    <thead>
      <tr><th>Día</th><th>Fecha</th><th>Ciudad</th><th>Alojamiento</th><th>Actividad</th></tr>
    </thead>
    <tbody>${dayRows}</tbody>
  </table>`
    : ""}

  ${reservationRows
    ? `
  <h2>Reservas confirmadas</h2>
  <table>
    <thead>
      <tr><th>Tipo</th><th>Proveedor</th><th>Fecha</th><th>Localizador</th><th>Monto</th></tr>
    </thead>
    <tbody>${reservationRows}</tbody>
  </table>`
    : ""}

  ${budget
    ? `
  <h2>Presupuesto</h2>
  <table>
    <thead>
      <tr><th>Categoría</th><th>Presupuestado</th><th>Gastado</th><th>%</th></tr>
    </thead>
    <tbody>${budgetRows}</tbody>
    <tfoot>
      <tr style="border-top:2px solid var(--ink);font-weight:700;">
        <td>Total</td>
        <td class="num">${fmtCurrency(budget.total_budget, trip.base_currency, locale)}</td>
        <td class="num">${fmtCurrency(budget.total_spent, trip.base_currency, locale)}</td>
        <td class="num">${budget.percent_used}%</td>
      </tr>
    </tfoot>
  </table>`
    : ""}

  ${emergencyRows
    ? `
  <h2>Contactos y documentos de emergencia</h2>
  <ul class="contacts">${emergencyRows}</ul>`
    : ""}

  <div class="footer">
    <span>Generado por Tampu · ${new Date().toLocaleString(locale)}</span>
    <span>tampu.app</span>
  </div>
</div>

<script>
  // Auto-trigger the print dialog so the user can save as PDF.
  // Delay a tick to allow fonts to settle.
  window.addEventListener("load", function() { setTimeout(function() { window.print(); }, 250); });
</script>
</body>
</html>`;
}

/**
 * Public API — generate and present the PDF to the user.
 *
 * Strategy:
 *   1. Open new tab with the HTML
 *   2. Tab auto-fires print() on load
 *   3. User picks "Save as PDF" in system dialog
 *
 * Returns true if the new tab was opened. False if the popup was blocked.
 */
export function generateTripSummaryPDF(input: TripSummaryInput): boolean {
  if (typeof window === "undefined") return false;
  const html = buildTripSummaryHTML(input);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    // Popup blocked. Fallback: open via Blob URL.
    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.location.href = url;
      // GC the blob URL after the navigation kicks off
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return true;
    } catch {
      return false;
    }
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
