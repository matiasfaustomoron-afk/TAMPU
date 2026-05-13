import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildQuickAccess } from "../quick-access";
import { tripFixture, makeReservation, makeDocument, makeTripDay } from "./fixtures";

describe("buildQuickAccess", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-15T12:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });

  it("returns empty snapshot when no inputs", () => {
    const q = buildQuickAccess(tripFixture, [], [], []);
    expect(q.passport).toBeNull();
    expect(q.insurance).toBeNull();
    expect(q.next_flight).toBeNull();
    expect(q.current_bed).toBeNull();
    expect(q.emergency_contacts).toEqual([]);
  });

  it("picks passport document", () => {
    const p = makeDocument({ type: "passport", name: "AR Passport", status: "ready" });
    const q = buildQuickAccess(tripFixture, [], [p], []);
    expect(q.passport).not.toBeNull();
    expect(q.passport!.ready).toBe(true);
  });

  it("uses insurance reservation if present", () => {
    const r = makeReservation({ type: "insurance", provider: "IATI", status: "confirmed" });
    const q = buildQuickAccess(tripFixture, [r], [], []);
    expect(q.insurance?.provider).toBe("IATI");
    expect(q.insurance?.status).toBe("confirmed");
  });

  it("falls back to insurance document if no reservation", () => {
    const d = makeDocument({ type: "insurance", name: "Policy", status: "ready" });
    const q = buildQuickAccess(tripFixture, [], [d], []);
    expect(q.insurance?.provider).toBe("Policy");
  });

  it("picks next future flight by use_date", () => {
    const r1 = makeReservation({ type: "flight", use_date: "2026-09-01", status: "confirmed" });
    const r2 = makeReservation({ type: "flight", use_date: "2026-08-20", status: "confirmed" });
    const q = buildQuickAccess(tripFixture, [r1, r2], [], []);
    expect(q.next_flight?.date).toBe("2026-08-20");
  });

  it("identifies current bed from today's tripDay", () => {
    const today = makeTripDay({ date: "2026-08-15", city_name: "Seoul", accommodation: "Airbnb Jongno" });
    const q = buildQuickAccess(tripFixture, [], [], [today]);
    expect(q.current_bed?.city).toBe("Seoul");
    expect(q.current_bed?.address).toBe("Airbnb Jongno");
  });

  it("skips pending accommodations", () => {
    const today = makeTripDay({ date: "2026-08-15", city_name: "Manila", accommodation: "pending - airport hotel" });
    const future = makeTripDay({ date: "2026-08-17", city_name: "POM", accommodation: "Confirmed hotel" });
    const q = buildQuickAccess(tripFixture, [], [], [today, future]);
    expect(q.current_bed?.city).toBe("POM");
  });

  it("counts offline critical documents", () => {
    const d1 = makeDocument({ criticality: "blocker", has_offline_copy: true });
    const d2 = makeDocument({ criticality: "essential", has_offline_copy: false });
    const d3 = makeDocument({ criticality: "nice_to_have", has_offline_copy: false });
    const q = buildQuickAccess(tripFixture, [], [d1, d2, d3], []);
    expect(q.offline_total_count).toBe(2);
    expect(q.offline_ready_count).toBe(1);
  });
});
