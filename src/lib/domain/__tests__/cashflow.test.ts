import { describe, it, expect } from "vitest";
import { buildCashflow } from "../cashflow";
import { tripFixture, makeExpense, makeReservation } from "./fixtures";

describe("buildCashflow", () => {
  it("returns empty-ish buckets when no expenses or reservations", () => {
    const r = buildCashflow(tripFixture, [], []);
    expect(r.buckets.length).toBeGreaterThan(0);
    expect(r.total_spent).toBe(0);
    expect(r.daily_burn_rate).toBe(0);
  });

  it("sums total_spent from expenses", () => {
    const e1 = makeExpense({ date: "2026-08-12", base_amount: 100 });
    const e2 = makeExpense({ date: "2026-08-13", base_amount: 50 });
    const r = buildCashflow(tripFixture, [e1, e2], []);
    expect(r.total_spent).toBe(150);
  });

  it("includes payment_deadlines from pending reservations in committed_future", () => {
    const res = makeReservation({ status: "pending", payment_deadline: "2026-07-15", base_amount: 1000 });
    const r = buildCashflow(tripFixture, [], [res]);
    expect(r.total_committed_future).toBe(1000);
  });

  it("excludes paid/cancelled reservations from committed_future", () => {
    const res = makeReservation({ status: "paid", payment_deadline: "2026-07-15", base_amount: 1000 });
    const r = buildCashflow(tripFixture, [], [res]);
    expect(r.total_committed_future).toBe(0);
  });

  it("groups expenses into weekly buckets", () => {
    const e1 = makeExpense({ date: "2026-08-12", base_amount: 100 }); // Wed
    const e2 = makeExpense({ date: "2026-08-13", base_amount: 50 }); // Thu (same week)
    const e3 = makeExpense({ date: "2026-08-20", base_amount: 200 }); // next week
    const r = buildCashflow(tripFixture, [e1, e2, e3], []);
    // expect at least 2 weeks with expenses
    const weeksWithSpend = r.weekly.filter(w => w.expenses > 0);
    expect(weeksWithSpend.length).toBeGreaterThanOrEqual(2);
  });

  it("groups expenses by destination", () => {
    const e1 = makeExpense({ city_name: "Seoul", base_amount: 300 });
    const e2 = makeExpense({ city_name: "Seoul", base_amount: 100 });
    const e3 = makeExpense({ city_name: "Manila", base_amount: 200 });
    const r = buildCashflow(tripFixture, [e1, e2, e3], []);
    expect(r.by_destination.length).toBe(2);
    expect(r.by_destination[0].city).toBe("Seoul");
    expect(r.by_destination[0].spent).toBe(400);
    expect(r.by_destination[1].city).toBe("Manila");
  });

  it("computes cumulative running total", () => {
    const e1 = makeExpense({ date: "2026-08-12", base_amount: 100 });
    const e2 = makeExpense({ date: "2026-08-13", base_amount: 50 });
    const r = buildCashflow(tripFixture, [e1, e2], []);
    const last = r.buckets[r.buckets.length - 1];
    expect(last.cumulative).toBe(150);
  });
});
