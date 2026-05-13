import { describe, it, expect } from "vitest";
import { calculateReadiness } from "../readiness-score";
import { tripFixture, makeTask, makeReservation, makeDocument, makePackingItem, makeTripDay, budgetSummaryFixture } from "./fixtures";

describe("calculateReadiness", () => {
  it("returns 100 when everything is complete", () => {
    const tasks = [
      makeTask({ criticality: "blocker", status: "done" }),
      makeTask({ criticality: "essential", status: "done" }),
    ];
    const reservations = [
      makeReservation({ criticality: "blocker", status: "confirmed" }),
    ];
    const documents = [
      makeDocument({ criticality: "blocker", status: "ready" }),
    ];
    const packing = [
      makePackingItem({ is_essential: true, status: "packed" }),
    ];
    const days = [
      makeTripDay({ status: "confirmed" }),
      makeTripDay({ status: "planned" }),
    ];
    const budget = { ...budgetSummaryFixture, percent_used: 50 };

    const result = calculateReadiness(tripFixture, tasks, reservations, documents, packing, budget, days);
    expect(result.overall_score).toBe(100);
    expect(result.status).toBe("green");
  });

  it("returns low score when nothing is done", () => {
    const tasks = [
      makeTask({ criticality: "blocker", status: "pending" }),
      makeTask({ criticality: "essential", status: "pending" }),
    ];
    const reservations = [
      makeReservation({ criticality: "blocker", status: "pending" }),
    ];
    const documents = [
      makeDocument({ criticality: "blocker", status: "pending" }),
    ];
    const packing = [
      makePackingItem({ is_essential: true, status: "pending" }),
    ];
    const days = [
      makeTripDay({ status: "empty" }),
      makeTripDay({ status: "empty" }),
    ];
    const budget = { ...budgetSummaryFixture, percent_used: 120 };

    const result = calculateReadiness(tripFixture, tasks, reservations, documents, packing, budget, days);
    expect(result.overall_score).toBeLessThan(20);
    expect(result.status).toBe("red");
    expect(result.critical_tasks_done).toBe(0);
    expect(result.critical_tasks_total).toBe(2);
  });

  it("handles empty arrays gracefully", () => {
    const result = calculateReadiness(tripFixture, [], [], [], [], budgetSummaryFixture, []);
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(100);
  });

  it("correctly counts night coverage", () => {
    const days = [
      makeTripDay({ accommodation: "Hotel A", status: "confirmed" }),
      makeTripDay({ accommodation: null, status: "empty" }),
      makeTripDay({ accommodation: "pending - TBD", status: "partial" }),
    ];
    const result = calculateReadiness(tripFixture, [], [], [], [], budgetSummaryFixture, days);
    expect(result.nights_covered).toBe(1);
    expect(result.nights_uncovered).toBeGreaterThan(0);
  });
});
