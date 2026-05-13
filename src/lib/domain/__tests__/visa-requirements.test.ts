import { describe, it, expect } from "vitest";
import { buildTripVisaSummary, lookupVisaRequirement } from "../visa-requirements";
import { tripFixture } from "./fixtures";
import type { City } from "@/lib/types/database";

function city(name: string, country: string): City {
  return {
    id: "c-" + name, trip_id: tripFixture.id, name, country,
    arrival_date: null, departure_date: null, nights: 0, order_index: 0, notes: null,
  };
}

describe("visa-requirements", () => {
  it("returns null for same passport-destination pair", () => {
    expect(lookupVisaRequirement("AR", "AR")).toBeNull();
  });

  it("flags PNG as eVisa for AR passport", () => {
    const r = lookupVisaRequirement("AR", "PG");
    expect(r?.type).toBe("evisa");
    expect(r?.cost_usd).toBeGreaterThan(0);
    expect(r?.apply_url).toMatch(/ica\.gov\.pg/);
  });

  it("flags Korea as eTA (K-ETA) for AR passport", () => {
    const r = lookupVisaRequirement("AR", "KR");
    expect(r?.type).toBe("eta");
    expect(r?.apply_url).toMatch(/k-eta/);
  });

  it("flags Philippines as visa-free 30 days", () => {
    const r = lookupVisaRequirement("AR", "PH");
    expect(r?.type).toBe("visa_free");
    expect(r?.max_stay_days).toBe(30);
  });

  it("flags USA as embassy visa (no Visa Waiver for AR)", () => {
    const r = lookupVisaRequirement("AR", "US");
    expect(r?.type).toBe("embassy_visa");
    expect(r?.apply_lead_days).toBeGreaterThanOrEqual(60);
  });

  it("returns unknown for non-AR passports (data scope)", () => {
    const r = lookupVisaRequirement("US", "PG");
    expect(r?.type).toBe("unknown");
  });

  it("buildTripVisaSummary aggregates costs and lead days from cities", () => {
    const cities = [
      city("Seoul", "South Korea"),
      city("Port Moresby", "Papua New Guinea"),
      city("Manila", "Philippines"),
    ];
    const s = buildTripVisaSummary(cities);
    expect(s.requirements.length).toBe(3);
    expect(s.total_cost_usd).toBeGreaterThan(0);
    expect(s.open_count).toBe(2); // PNG eVisa + KR eTA need action; PH visa-free doesn't
    expect(s.countries_needing_action).toEqual(expect.arrayContaining(["Papúa Nueva Guinea", "Corea del Sur"]));
  });

  it("buildTripVisaSummary deduplicates same country across cities", () => {
    const cities = [
      city("Manila", "Philippines"),
      city("Cebu", "Philippines"),
    ];
    const s = buildTripVisaSummary(cities);
    expect(s.requirements.length).toBe(1);
  });
});
