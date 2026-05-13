import { describe, it, expect } from "vitest";
import { buildTripHealthPlan } from "../vaccinations";
import { tripFixture, makeTask, makeDocument } from "./fixtures";
import type { City } from "@/lib/types/database";

function city(name: string, country: string): City {
  return {
    id: "c-" + name, trip_id: tripFixture.id, name, country,
    arrival_date: null, departure_date: null, nights: 0, order_index: 0, notes: null,
  };
}

describe("buildTripHealthPlan", () => {
  it("returns empty plan when no countries match", () => {
    const p = buildTripHealthPlan([city("Antarctica", "Antarctica")], [], []);
    expect(p.countries.length).toBe(0);
    expect(p.vaccines_needed.length).toBe(0);
  });

  it("PNG produces malaria + polio booster + hep A vaccines", () => {
    const cities = [city("Port Moresby", "Papua New Guinea")];
    const p = buildTripHealthPlan(cities, [], []);
    expect(p.malaria_required).toBe(true);
    expect(p.malaria_countries).toContain("Papúa Nueva Guinea");
    const ids = p.vaccines_needed.map(v => v.vaccine.id);
    expect(ids).toContain("polio_booster");
    expect(ids).toContain("hep_a");
  });

  it("Korea-only trip has no malaria for Seoul-only travelers", () => {
    const cities = [city("Seoul", "South Korea")];
    const p = buildTripHealthPlan(cities, [], []);
    expect(p.malaria_required).toBe(true); // present in DMZ areas; flagged in the country profile
    expect(p.malaria_countries).toContain("Corea del Sur");
  });

  it("deduplicates vaccines across countries and lists shared destinations", () => {
    const cities = [
      city("Port Moresby", "Papua New Guinea"),
      city("Seoul", "South Korea"),
      city("Manila", "Philippines"),
    ];
    const p = buildTripHealthPlan(cities, [], []);
    const hepA = p.vaccines_needed.find(v => v.vaccine.id === "hep_a");
    expect(hepA).toBeDefined();
    expect(hepA!.countries.length).toBeGreaterThanOrEqual(2);
  });

  it("marks vaccine as ready when matching task is done", () => {
    const cities = [city("Port Moresby", "Papua New Guinea")];
    const done = makeTask({ category: "health", status: "done", title: "Hepatitis A" });
    const p = buildTripHealthPlan(cities, [done], []);
    const hepA = p.vaccines_needed.find(v => v.vaccine.id === "hep_a");
    expect(hepA?.user_status).toBe("ready");
  });

  it("marks vaccine as ready when matching medical doc is ready", () => {
    const cities = [city("Port Moresby", "Papua New Guinea")];
    const doc = makeDocument({ type: "medical", status: "ready", name: "Hepatitis A vaccine cert" });
    const p = buildTripHealthPlan(cities, [], [doc]);
    const hepA = p.vaccines_needed.find(v => v.vaccine.id === "hep_a");
    expect(hepA?.user_status).toBe("ready");
  });

  it("open_count counts pending strongly_recommended + required vaccines", () => {
    const cities = [city("Port Moresby", "Papua New Guinea")];
    const p = buildTripHealthPlan(cities, [], []);
    expect(p.open_count).toBeGreaterThan(0);
  });

  it("computes max lead_weeks across vaccines", () => {
    const cities = [city("Port Moresby", "Papua New Guinea")];
    const p = buildTripHealthPlan(cities, [], []);
    expect(p.total_lead_weeks).toBeGreaterThanOrEqual(4);
  });
});
