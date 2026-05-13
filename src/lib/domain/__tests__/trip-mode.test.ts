import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { detectTripMode } from "../trip-mode";
import { tripFixture } from "./fixtures";

function withFakeToday(iso: string, fn: () => void) {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso + "T12:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });
  fn();
}

describe("detectTripMode", () => {
  describe("planning mode (> 30 days out)", () => {
    withFakeToday("2026-01-01", () => {
      it("returns planning", () => {
        const m = detectTripMode(tripFixture);
        expect(m.mode).toBe("planning");
        expect(m.days_until_start).toBeGreaterThan(30);
      });
    });
  });

  describe("pre_departure (≤30 days out, before start)", () => {
    withFakeToday("2026-07-25", () => {
      it("returns pre_departure", () => {
        const m = detectTripMode(tripFixture);
        expect(m.mode).toBe("pre_departure");
        expect(m.days_until_start).toBeLessThanOrEqual(30);
        expect(m.days_until_start).toBeGreaterThan(0);
      });
    });
  });

  describe("in_trip (between start and end)", () => {
    withFakeToday("2026-08-20", () => {
      it("returns in_trip with trip_day_number", () => {
        const m = detectTripMode(tripFixture);
        expect(m.mode).toBe("in_trip");
        expect(m.trip_day_number).not.toBeNull();
        expect(m.trip_day_number).toBeGreaterThan(0);
      });
    });
  });

  describe("return (1-2 days after end)", () => {
    withFakeToday("2026-09-03", () => {
      it("returns return", () => {
        const m = detectTripMode(tripFixture);
        expect(m.mode).toBe("return");
      });
    });
  });

  describe("archived (long after end)", () => {
    withFakeToday("2026-10-15", () => {
      it("returns archived", () => {
        const m = detectTripMode(tripFixture);
        expect(m.mode).toBe("archived");
      });
    });
  });

  describe("archived status overrides date", () => {
    withFakeToday("2026-01-01", () => {
      it("respects trip.status === archived even when planning by date", () => {
        const m = detectTripMode({ ...tripFixture, status: "archived" });
        expect(m.mode).toBe("archived");
      });
    });
  });
});
