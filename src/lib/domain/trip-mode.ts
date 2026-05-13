import type { Trip } from "@/lib/types/database";
import { daysUntil } from "@/lib/utils/helpers";

export type TripMode = "planning" | "pre_departure" | "in_trip" | "return" | "archived";

export interface TripModeInfo {
  mode: TripMode;
  label_key: string;
  days_until_start: number;
  days_until_end: number;
  trip_day_number: number | null;
}

export function detectTripMode(trip: Trip): TripModeInfo {
  const startDelta = daysUntil(trip.start_date);
  const endDelta = daysUntil(trip.end_date);
  if (trip.status === "archived" || trip.status === "completed") {
    return { mode: "archived", label_key: "archived", days_until_start: startDelta, days_until_end: endDelta, trip_day_number: null };
  }
  if (startDelta > 30) return { mode: "planning", label_key: "planning", days_until_start: startDelta, days_until_end: endDelta, trip_day_number: null };
  if (startDelta > 0) return { mode: "pre_departure", label_key: "pre_departure", days_until_start: startDelta, days_until_end: endDelta, trip_day_number: null };
  if (endDelta >= 0) {
    const totalDays = Math.max(1, -daysUntil(trip.start_date) + 1);
    return { mode: "in_trip", label_key: "in_trip", days_until_start: startDelta, days_until_end: endDelta, trip_day_number: totalDays };
  }
  if (endDelta > -3) return { mode: "return", label_key: "return", days_until_start: startDelta, days_until_end: endDelta, trip_day_number: null };
  return { mode: "archived", label_key: "archived", days_until_start: startDelta, days_until_end: endDelta, trip_day_number: null };
}
