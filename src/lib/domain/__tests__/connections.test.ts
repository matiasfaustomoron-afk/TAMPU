import { describe, it, expect } from "vitest";
import { analyzeConnections } from "../connections";
import { makeReservation, makeTripDay } from "./fixtures";

describe("analyzeConnections", () => {
  it("returns no issues when there is a single flight", () => {
    const r = makeReservation({ type: "flight", use_date: "2026-08-12", status: "confirmed" });
    const a = analyzeConnections([r], [], []);
    expect(a.issues.filter(i => i.kind === "tight_layover").length).toBe(0);
    expect(a.flights_analyzed).toBe(1);
  });

  it("flags arrival-without-bed when accommodation is pending", () => {
    const r = makeReservation({ type: "flight", use_date: "2026-08-12", use_end_date: "2026-08-12", status: "confirmed", city_name: "Manila" });
    const day = makeTripDay({ date: "2026-08-12", city_name: "Manila", accommodation: "pending - airport hotel" });
    const a = analyzeConnections([r], [day], []);
    expect(a.issues.some(i => i.kind === "uncovered_arrival")).toBe(true);
  });

  it("does not flag arrival when accommodation is confirmed", () => {
    const r = makeReservation({ type: "flight", use_date: "2026-08-12", use_end_date: "2026-08-12", status: "confirmed", city_name: "Seoul" });
    const day = makeTripDay({ date: "2026-08-12", city_name: "Seoul", accommodation: "Airbnb Jongno" });
    const a = analyzeConnections([r], [day], []);
    expect(a.issues.some(i => i.kind === "uncovered_arrival")).toBe(false);
  });

  it("flags same-day check-in and check-out", () => {
    const co = makeTripDay({ date: "2026-08-20", check_out: true, accommodation: "Wander" });
    const ci = makeTripDay({ date: "2026-08-20", check_in: true, accommodation: "POM hotel" });
    const a = analyzeConnections([], [co, ci], []);
    expect(a.issues.some(i => i.kind === "no_buffer_checkout")).toBe(true);
  });

  it("flags tour-start within 12h of a flight arrival", () => {
    const flight = makeReservation({ type: "flight", use_date: "2026-08-14", use_end_date: "2026-08-14", status: "confirmed" });
    const tour = makeReservation({ type: "tour", criticality: "blocker", use_date: "2026-08-14", status: "confirmed", description: "PNG tour" });
    const a = analyzeConnections([flight, tour], [], []);
    expect(a.issues.some(i => i.kind === "tight_tour_start")).toBe(true);
  });

  it("does not flag tour-start when buffered enough", () => {
    const flight = makeReservation({ type: "flight", use_date: "2026-08-10", use_end_date: "2026-08-10", status: "confirmed" });
    const tour = makeReservation({ type: "tour", criticality: "blocker", use_date: "2026-08-14", status: "confirmed", description: "PNG tour" });
    const a = analyzeConnections([flight, tour], [], []);
    expect(a.issues.some(i => i.kind === "tight_tour_start")).toBe(false);
  });

  it("ignores cancelled flights", () => {
    const r1 = makeReservation({ type: "flight", use_date: "2026-08-12", status: "cancelled" });
    const a = analyzeConnections([r1], [], []);
    expect(a.flights_analyzed).toBe(0);
  });

  it("groups severity counts", () => {
    const f1 = makeReservation({ type: "flight", use_date: "2026-08-14", use_end_date: "2026-08-14", status: "confirmed" });
    const tour = makeReservation({ type: "tour", criticality: "blocker", use_date: "2026-08-14", status: "confirmed" });
    const a = analyzeConnections([f1, tour], [], []);
    expect(a.total_critical + a.total_warning).toBeGreaterThanOrEqual(1);
  });
});
