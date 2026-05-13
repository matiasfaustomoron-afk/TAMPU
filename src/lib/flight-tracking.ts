"use client";

// ─── Flight tracking deep-links ───
// We don't have a paid flight API. Instead we surface the user's flight
// number to public real-time trackers (Flightradar24, FlightAware, Google).
// Free, no key, real-time data.

/** Extract IATA flight code like "EK 274", "EK274", "Emirates EK274" from text. */
export function extractFlightNumber(text: string | null | undefined): string | null {
  if (!text) return null;
  // Common patterns: "EK 274", "EK274", "BA 123", "AA1234", "LH/LH456"
  const m = text.match(/\b([A-Z]{2,3})\s?(\d{1,4}[A-Z]?)\b/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}${m[2].toUpperCase()}`;
}

export interface TrackerLink {
  label: string;
  url: string;
}

/** Build deep-links for known public flight trackers. */
export function trackerLinks(flightNumber: string): TrackerLink[] {
  const fn = flightNumber.replace(/\s+/g, "");
  return [
    { label: "Flightradar24", url: `https://www.flightradar24.com/data/flights/${fn.toLowerCase()}` },
    { label: "FlightAware",   url: `https://flightaware.com/live/flight/${fn}` },
    { label: "Google",        url: `https://www.google.com/search?q=${encodeURIComponent(`vuelo ${fn} estado en vivo`)}` },
  ];
}
