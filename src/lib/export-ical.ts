"use client";

// ─── iCal (.ics) export ───
// Convert a trip + its reservations + trip_days into a downloadable .ics file
// that Apple Calendar / Google Calendar / Outlook can import.

import type { Trip, Reservation, TripDay, Task } from "@/lib/types/database";

function pad(n: number): string { return String(n).padStart(2, "0"); }

function toICSDate(d: Date | string, allDay: boolean = false): string {
  const date = typeof d === "string" ? new Date(d.includes("T") ? d : `${d}T09:00:00`) : d;
  if (allDay) {
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  }
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

function escapeICS(s: string): string {
  return s.replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
}

function uid(seed: string): string {
  // Stable per-event UID. Calendar apps dedupe on this.
  return `${seed}@travel-os`;
}

interface ICSEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;     // YYYY-MM-DD or full ISO
  end?: string;
  allDay: boolean;
}

function eventToBlock(e: ICSEvent): string {
  const lines: string[] = ["BEGIN:VEVENT", `UID:${e.uid}`];
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(e.start, true)}`);
    if (e.end) lines.push(`DTEND;VALUE=DATE:${toICSDate(e.end, true)}`);
  } else {
    lines.push(`DTSTART:${toICSDate(e.start)}`);
    if (e.end) lines.push(`DTEND:${toICSDate(e.end)}`);
  }
  lines.push(`SUMMARY:${escapeICS(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function extractTime(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  return `${pad(parseInt(m[1], 10))}:${m[2]}`;
}

export function buildICS({
  trip, reservations, tripDays, tasks,
}: {
  trip: Trip;
  reservations: Reservation[];
  tripDays: TripDay[];
  tasks: Task[];
}): string {
  const events: ICSEvent[] = [];

  // Trip envelope — all-day event spanning the whole trip
  events.push({
    uid: uid(`trip-${trip.id}`),
    summary: `✈ ${trip.name}`,
    description: trip.description || `Viaje a ${trip.destination}`,
    location: trip.destination,
    start: trip.start_date,
    end: trip.end_date,
    allDay: true,
  });

  // Reservations
  for (const r of reservations) {
    if (!r.use_date) continue;
    const t = extractTime(r.description) || extractTime(r.notes);
    const startStr = t ? `${r.use_date}T${t}:00` : r.use_date;
    const endStr = r.use_end_date
      ? (t ? `${r.use_end_date}T${t}:00` : r.use_end_date)
      : undefined;
    const kindLabel = r.type === "flight" ? "✈" : r.type === "accommodation" ? "🏠" : r.type === "train" ? "🚆" : r.type === "bus" ? "🚌" : r.type === "tour" ? "🗺" : r.type === "insurance" ? "🛡" : "•";
    events.push({
      uid: uid(`res-${r.id}`),
      summary: `${kindLabel} ${r.description}`,
      description: [
        r.provider,
        r.locator ? `Loc: ${r.locator}` : null,
        r.contact ? `Contact: ${r.contact}` : null,
        r.notes,
      ].filter(Boolean).join("\n"),
      location: r.city_name || undefined,
      start: startStr,
      end: endStr,
      allDay: !t,
    });
  }

  // Trip days (only meaningful ones)
  for (const d of tripDays) {
    if (!d.main_activity && !d.main_transport) continue;
    const summary = d.main_activity || d.main_transport || "Día del viaje";
    const t = extractTime(d.main_activity) || extractTime(d.main_transport);
    events.push({
      uid: uid(`day-${d.id}`),
      summary: `📅 ${summary}`,
      description: [d.accommodation, d.notes].filter(Boolean).join("\n"),
      location: d.city_name || undefined,
      start: t ? `${d.date}T${t}:00` : d.date,
      allDay: !t,
    });
  }

  // Tasks with due dates
  for (const tk of tasks) {
    if (!tk.due_date) continue;
    events.push({
      uid: uid(`task-${tk.id}`),
      summary: `✅ ${tk.title}`,
      description: tk.next_action || tk.notes || "",
      start: tk.due_date,
      allDay: true,
    });
  }

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tampu//ES",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeICS(trip.name)}`,
    `X-WR-CALDESC:Itinerario completo de ${escapeICS(trip.name)} generado por Tampu`,
  ].join("\r\n");
  const footer = "END:VCALENDAR";
  return [header, ...events.map(eventToBlock), footer].join("\r\n");
}

export function downloadICS(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
