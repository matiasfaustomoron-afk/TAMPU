import { describe, it, expect, vi } from "vitest";
import { mergeDraftIntoTrip, isMostlyPlanned } from "../itinerary-merger";
import type { DraftItinerary } from "../itinerary-generator";
import type { Trip, TripDay, Reservation } from "@/lib/types/database";

function mkTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1", user_id: "user-1", name: "Test", description: null,
    destination: "Seúl", status: "planning",
    start_date: "2026-08-01", end_date: "2026-08-03",
    base_currency: "USD", total_budget: 0, contingency_percent: 0,
    contingency_amount: 0, alert_days_warning: 7, alert_days_critical: 3,
    budget_warning_threshold: 80, budget_danger_threshold: 95,
    is_active: true, created_at: "", updated_at: "",
    ...overrides,
  };
}

function mkDay(date: string, overrides: Partial<TripDay> = {}): TripDay {
  return {
    id: `day-${date}`, trip_id: "trip-1", date, day_number: 1, city_id: null,
    city_name: null, zone: null, accommodation: null,
    accommodation_reservation_id: null, check_in: false, check_out: false,
    main_activity: null, secondary_activity: null, main_transport: null,
    estimated_cost: 0, actual_cost: 0, notes: null, status: "empty",
    ...overrides,
  };
}

function mkDraft(): DraftItinerary {
  return {
    destination: "Seúl",
    start_date: "2026-08-01",
    end_date: "2026-08-03",
    total_days: 3,
    currency: "USD",
    total_estimated_cost: 300,
    days: [
      {
        day_number: 1, date: "2026-08-01", city: "Seúl", zone: "Hongdae",
        accommodation_suggestion: "Hotel A", main_transport: "Metro",
        activities: [
          { time: "10:00", title: "Templo", description: "Visita", kind: "sightseeing", estimated_cost: 10 },
          { time: "14:00", title: "Almuerzo", description: "Bibimbap", kind: "food", estimated_cost: 15 },
        ],
        total_estimated_cost: 25,
        notes: null,
      },
      {
        day_number: 2, date: "2026-08-02", city: "Seúl", zone: "Gangnam",
        accommodation_suggestion: "Hotel B", main_transport: "Metro",
        activities: [
          { time: "09:00", title: "Mercado", description: "Tour", kind: "experience", estimated_cost: 20 },
        ],
        total_estimated_cost: 20,
        notes: "Día relax",
      },
      {
        day_number: 3, date: "2026-08-03", city: "Seúl", zone: null,
        accommodation_suggestion: null, main_transport: null,
        activities: [],
        total_estimated_cost: 0,
        notes: null,
      },
    ],
    tips: ["tip1"],
    generated_by: "anthropic",
  };
}

describe("itinerary-merger", () => {
  it("inserta todos los días en un trip vacío", async () => {
    const trip = mkTrip();
    const draft = mkDraft();
    const upsertDay = vi.fn(async (row: Omit<TripDay, "id">) => mkDay(row.date, row));
    const addReservation = vi.fn(async (r: Omit<Reservation, "id" | "created_at" | "updated_at">) => ({
      id: `res-${Math.random()}`, created_at: "", updated_at: "", ...r,
    } as Reservation));

    const result = await mergeDraftIntoTrip(
      draft,
      { trip, existingDays: [], upsertDay, addReservation },
      { mode: "replace" }
    );

    expect(result.inserted).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    // 2 activities con cost en día 1 + 1 en día 2 = 3
    expect(result.reservationsCreated).toBe(3);
    expect(upsertDay).toHaveBeenCalledTimes(3);
  });

  it("modo merge preserva días con accommodation real", async () => {
    const trip = mkTrip();
    const draft = mkDraft();
    const existingDays: TripDay[] = [
      mkDay("2026-08-01", { accommodation: "Mi Hotel Real", status: "confirmed" }),
      mkDay("2026-08-02"),
    ];
    const upsertDay = vi.fn(async (row: Omit<TripDay, "id">) => mkDay(row.date, row));
    const addReservation = vi.fn(async (r) => ({ id: "r1", created_at: "", updated_at: "", ...r } as Reservation));

    const result = await mergeDraftIntoTrip(
      draft,
      { trip, existingDays, upsertDay, addReservation },
      { mode: "merge" }
    );

    expect(result.skipped).toBe(1);     // día 1 preservado
    expect(result.updated).toBe(1);     // día 2 sobrescrito
    expect(result.inserted).toBe(1);    // día 3 nuevo
  });

  it("respeta selectedDates: solo procesa días en el Set", async () => {
    const trip = mkTrip();
    const draft = mkDraft();
    const upsertDay = vi.fn(async (row: Omit<TripDay, "id">) => mkDay(row.date, row));
    const addReservation = vi.fn(async (r) => ({ id: "r1", created_at: "", updated_at: "", ...r } as Reservation));

    const result = await mergeDraftIntoTrip(
      draft,
      { trip, existingDays: [], upsertDay, addReservation },
      { mode: "replace", selectedDates: new Set(["2026-08-02"]) }
    );

    expect(result.inserted).toBe(1);
    expect(upsertDay).toHaveBeenCalledTimes(1);
  });

  it("createActivityReservations=false NO inserta reservas", async () => {
    const trip = mkTrip();
    const draft = mkDraft();
    const upsertDay = vi.fn(async (row: Omit<TripDay, "id">) => mkDay(row.date, row));
    const addReservation = vi.fn(async (r) => ({ id: "r1", created_at: "", updated_at: "", ...r } as Reservation));

    await mergeDraftIntoTrip(
      draft,
      { trip, existingDays: [], upsertDay, addReservation },
      { mode: "replace", createActivityReservations: false }
    );

    expect(addReservation).not.toHaveBeenCalled();
  });

  describe("isMostlyPlanned", () => {
    it("returns false para trip vacío", () => {
      expect(isMostlyPlanned([])).toBe(false);
    });
    it("returns true cuando >50% tienen plan", () => {
      const days = [
        mkDay("2026-08-01", { status: "planned" }),
        mkDay("2026-08-02", { accommodation: "Hotel" }),
        mkDay("2026-08-03"),
      ];
      expect(isMostlyPlanned(days)).toBe(true);
    });
    it("returns false cuando <=50% tienen plan", () => {
      const days = [
        mkDay("2026-08-01", { status: "planned" }),
        mkDay("2026-08-02"),
        mkDay("2026-08-03"),
      ];
      expect(isMostlyPlanned(days)).toBe(false);
    });
  });
});
