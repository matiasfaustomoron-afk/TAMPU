import type { Trip, Reservation, TripDay } from "@/lib/types/database";

// ─── ICS calendar export ───
// Produces a single-file .ics that Apple Calendar / Google Calendar / Outlook can import.
// One VEVENT per reservation + per trip day with accommodation.

function pad(n: number): string { return n.toString().padStart(2, "0"); }

function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function icsAllDay(iso: string): string {
  return iso.replace(/-/g, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function fold(line: string): string {
  // ICS lines must not exceed 75 octets; fold with CRLF + space
  if (line.length <= 73) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    out.push(line.slice(i, i + 73));
    i += 73;
  }
  return out.join("\r\n ");
}

interface VEvent {
  uid: string;
  start: string;       // YYYYMMDD or YYYYMMDDTHHMMSSZ
  end: string;
  allDay: boolean;
  summary: string;
  description?: string;
  location?: string;
}

function buildVEvent(e: VEvent): string {
  const lines: string[] = ["BEGIN:VEVENT"];
  lines.push(`UID:${e.uid}@travel-os`);
  lines.push(`DTSTAMP:${icsDate(new Date())}`);
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${e.start}`);
    lines.push(`DTEND;VALUE=DATE:${e.end}`);
  } else {
    lines.push(`DTSTART:${e.start}`);
    lines.push(`DTEND:${e.end}`);
  }
  lines.push(fold(`SUMMARY:${escapeText(e.summary)}`));
  if (e.description) lines.push(fold(`DESCRIPTION:${escapeText(e.description)}`));
  if (e.location) lines.push(fold(`LOCATION:${escapeText(e.location)}`));
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function buildTripICS(trip: Trip, reservations: Reservation[], tripDays: TripDay[]): string {
  const events: string[] = [];

  // Trip umbrella event — all-day, end is exclusive in ICS
  events.push(buildVEvent({
    uid: `trip-${trip.id}`,
    start: icsAllDay(trip.start_date),
    end: icsAllDay(addDays(trip.end_date, 1)),
    allDay: true,
    summary: `Viaje: ${trip.name}`,
    description: `Destino: ${trip.destination}\nPresupuesto: ${trip.base_currency} ${trip.total_budget}`,
    location: trip.destination,
  }));

  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "expired") continue;
    if (!r.use_date) continue;
    const end = r.use_end_date || r.use_date;
    events.push(buildVEvent({
      uid: `res-${r.id}`,
      start: icsAllDay(r.use_date),
      end: icsAllDay(addDays(end, 1)),
      allDay: true,
      summary: `[${r.type}] ${r.description.substring(0, 70)}`,
      description: [
        `Proveedor: ${r.provider}`,
        r.locator ? `Localizador: ${r.locator}` : "",
        r.status ? `Estado: ${r.status}` : "",
        r.contact ? `Contacto: ${r.contact}` : "",
        r.notes || "",
      ].filter(Boolean).join("\n"),
      location: r.city_name || "",
    }));
  }

  for (const d of tripDays) {
    if (!d.accommodation || d.accommodation.toLowerCase().startsWith("pending")) continue;
    if (!d.check_in && !d.check_out) continue;
    if (d.check_in) {
      events.push(buildVEvent({
        uid: `checkin-${d.id}`,
        start: icsAllDay(d.date),
        end: icsAllDay(addDays(d.date, 1)),
        allDay: true,
        summary: `Check-in: ${d.accommodation}`,
        description: d.city_name || "",
        location: d.city_name || "",
      }));
    }
    if (d.check_out) {
      events.push(buildVEvent({
        uid: `checkout-${d.id}`,
        start: icsAllDay(d.date),
        end: icsAllDay(addDays(d.date, 1)),
        allDay: true,
        summary: `Check-out: ${d.accommodation}`,
        description: d.city_name || "",
        location: d.city_name || "",
      }));
    }
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tampu//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(trip.name)}`,
    `X-WR-CALDESC:${escapeText("Viaje exportado desde Tampu")}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadICS(filename: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
