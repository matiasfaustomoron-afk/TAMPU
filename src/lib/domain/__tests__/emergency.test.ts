import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildEmergencyKit } from "../emergency";
import { tripFixture, makeReservation, makeTripDay } from "./fixtures";
import type { City } from "@/lib/types/database";

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: "c-" + Math.random().toString(36).slice(2, 8),
    trip_id: tripFixture.id,
    name: "Seoul",
    country: "South Korea",
    arrival_date: "2026-08-22",
    departure_date: "2026-09-02",
    nights: 11,
    order_index: 0,
    notes: null,
    ...overrides,
  };
}

describe("buildEmergencyKit", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-22T12:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });

  it("returns empty kit when no inputs", () => {
    const k = buildEmergencyKit(tripFixture, [], [], [], []);
    expect(k.contacts.length).toBe(0);
    expect(k.countries.length).toBe(0);
    expect(k.consulates.length).toBe(0);
  });

  it("derives Korea country numbers from cities", () => {
    const c = makeCity({ name: "Seoul", country: "South Korea" });
    const k = buildEmergencyKit(tripFixture, [], [], [], [c]);
    expect(k.countries.some(x => x.iso2 === "KR")).toBe(true);
  });

  it("adds the Argentine consulate for Korea but not for Argentina itself", () => {
    const c = makeCity({ name: "Seoul", country: "South Korea" });
    const k = buildEmergencyKit(tripFixture, [], [], [], [c]);
    expect(k.consulates.some(x => x.iso2 === "KR")).toBe(true);
  });

  it("builds insurance_kit from an insurance reservation", () => {
    const ins = makeReservation({ type: "insurance", provider: "IATI", locator: "POL-123", contact: "+34 1 234", status: "confirmed" });
    const k = buildEmergencyKit(tripFixture, [ins], [], [], []);
    expect(k.insurance_kit?.provider).toBe("IATI");
    expect(k.insurance_kit?.locator).toBe("POL-123");
    expect(k.insurance_kit?.contact).toBe("+34 1 234");
  });

  it("includes tour operator + accommodation host contacts", () => {
    const tour = makeReservation({ type: "tour", provider: "Wander", contact: "alvaro@wander.com", status: "confirmed" });
    const host = makeReservation({ type: "accommodation", provider: "Airbnb", contact: "host@example.com", city_name: "Seoul" });
    const k = buildEmergencyKit(tripFixture, [tour, host], [], [], []);
    expect(k.contacts.some(c => c.kind === "tour_operator")).toBe(true);
    expect(k.contacts.some(c => c.kind === "host")).toBe(true);
  });

  it("derives current_country from today's tripDay", () => {
    const day = makeTripDay({ date: "2026-08-22", city_name: "Seoul" });
    const c = makeCity({ name: "Seoul", country: "South Korea" });
    const k = buildEmergencyKit(tripFixture, [], [], [day], [c]);
    expect(k.current_country).toBe("South Korea");
  });
});
