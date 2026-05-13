import type { Trip, TripDay } from "@/lib/types/database";
import { daysBetween } from "@/lib/utils/helpers";

export interface NightCoverage {
  nights_total: number;
  nights_covered: number;
  nights_uncovered: number;
  uncovered_days: { day_number: number; date: string; city_name: string | null }[];
}

export function calculateNightCoverage(trip: Trip, tripDays: TripDay[]): NightCoverage {
  const nightsTotal = daysBetween(trip.start_date, trip.end_date);
  const uncoveredDays = tripDays.filter(d => {
    if (!d.accommodation) return true;
    if (d.accommodation.toLowerCase().startsWith("pending")) return true;
    return false;
  });
  const nightsCovered = tripDays.length - uncoveredDays.length;
  return {
    nights_total: nightsTotal,
    nights_covered: nightsCovered,
    nights_uncovered: nightsTotal - nightsCovered,
    uncovered_days: uncoveredDays.map(d => ({
      day_number: d.day_number,
      date: d.date,
      city_name: d.city_name,
    })),
  };
}
