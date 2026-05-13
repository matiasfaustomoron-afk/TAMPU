import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildMoneyInFlight } from "../money-in-flight";
import { tripFixture, makeReservation, makeTask } from "./fixtures";

describe("buildMoneyInFlight", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-01T12:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });

  it("returns empty totals when no items match", () => {
    const r = buildMoneyInFlight(tripFixture, [], []);
    expect(r.items.length).toBe(0);
    expect(r.total_base_30d).toBe(0);
  });

  it("includes pending reservations with payment_deadline", () => {
    const res = makeReservation({ status: "pending", payment_deadline: "2026-07-10", base_amount: 1000 });
    const r = buildMoneyInFlight(tripFixture, [res], []);
    expect(r.items.length).toBe(1);
    expect(r.items[0].source).toBe("reservation");
    expect(r.total_base_30d).toBe(1000);
  });

  it("excludes paid reservations", () => {
    const res = makeReservation({ status: "paid", payment_deadline: "2026-07-10", base_amount: 1000 });
    const r = buildMoneyInFlight(tripFixture, [res], []);
    expect(r.items.length).toBe(0);
  });

  it("includes unpaid tasks with due_date + requires_payment + estimated_amount", () => {
    const task = makeTask({ requires_payment: true, due_date: "2026-07-08", estimated_amount: 250 });
    const r = buildMoneyInFlight(tripFixture, [], [task]);
    expect(r.items.length).toBe(1);
    expect(r.items[0].source).toBe("task");
    expect(r.total_base_7d).toBe(250);
  });

  it("severity is critical for deadlines ≤ alert_days_critical", () => {
    const res = makeReservation({ status: "pending", payment_deadline: "2026-07-03", base_amount: 500 });
    const r = buildMoneyInFlight(tripFixture, [res], []);
    expect(r.items[0].severity).toBe("critical");
    expect(r.critical_count).toBe(1);
  });

  it("severity is info for deadlines beyond alert_days_warning", () => {
    const res = makeReservation({ status: "pending", payment_deadline: "2026-07-20", base_amount: 500 });
    const r = buildMoneyInFlight(tripFixture, [res], []);
    expect(r.items[0].severity).toBe("info");
  });

  it("sorts items by days_until ascending", () => {
    const r1 = makeReservation({ status: "pending", payment_deadline: "2026-07-15", base_amount: 100 });
    const r2 = makeReservation({ status: "pending", payment_deadline: "2026-07-05", base_amount: 100 });
    const r = buildMoneyInFlight(tripFixture, [r1, r2], []);
    expect(r.items[0].deadline).toBe("2026-07-05");
    expect(r.items[1].deadline).toBe("2026-07-15");
  });
});
