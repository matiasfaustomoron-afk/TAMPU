import { describe, it, expect } from "vitest";
import { calculateNightCoverage } from "../night-coverage";
import { tripFixture, makeTripDay } from "./fixtures";

describe("calculateNightCoverage", () => {
  it("all nights covered when all days have accommodation", () => {
    const days = Array.from({ length: 5 }, (_, i) =>
      makeTripDay({ day_number: i + 1, accommodation: `Hotel ${i}`, status: "confirmed" })
    );
    const result = calculateNightCoverage(tripFixture, days);
    expect(result.nights_covered).toBe(5);
    expect(result.uncovered_days).toHaveLength(0);
  });

  it("detects null accommodation as uncovered", () => {
    const days = [
      makeTripDay({ day_number: 1, accommodation: "Hotel A" }),
      makeTripDay({ day_number: 2, accommodation: null }),
      makeTripDay({ day_number: 3, accommodation: "Hotel B" }),
    ];
    const result = calculateNightCoverage(tripFixture, days);
    expect(result.nights_covered).toBe(2);
    expect(result.uncovered_days).toHaveLength(1);
    expect(result.uncovered_days[0].day_number).toBe(2);
  });

  it("detects 'pending' accommodation as uncovered", () => {
    const days = [
      makeTripDay({ day_number: 1, accommodation: "pending - TBD" }),
      makeTripDay({ day_number: 2, accommodation: "Pending hotel" }),
    ];
    const result = calculateNightCoverage(tripFixture, days);
    expect(result.nights_covered).toBe(0);
    expect(result.uncovered_days).toHaveLength(2);
  });

  it("handles empty trip days", () => {
    const result = calculateNightCoverage(tripFixture, []);
    expect(result.nights_covered).toBe(0);
    expect(result.nights_total).toBeGreaterThan(0);
  });
});
