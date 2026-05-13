import { describe, it, expect } from "vitest";
import { calculateBudgetSummary } from "../forecast";
import { tripFixture, makeBudgetCategory, makeExpense, makeReservation } from "./fixtures";

describe("calculateBudgetSummary", () => {
  it("computes basic totals correctly", () => {
    const cats = [makeBudgetCategory({ category: "flights", budgeted_amount: 2500 })];
    const expenses = [makeExpense({ category: "flights", base_amount: 1000 })];
    const reservations = [makeReservation({ status: "confirmed", base_amount: 500 })];

    const result = calculateBudgetSummary(tripFixture, cats, expenses, reservations);
    expect(result.total_spent).toBe(1000);
    expect(result.total_committed).toBe(500);
    expect(result.available).toBe(7500 - 1000 - 500);
  });

  it("does not double-count expenses linked to reservations", () => {
    const res = makeReservation({ id: "r-linked", status: "confirmed", base_amount: 1000 });
    const cats = [makeBudgetCategory()];
    const expenses = [makeExpense({ base_amount: 1000, reservation_id: "r-linked" })];

    const result = calculateBudgetSummary(tripFixture, cats, expenses, [res]);
    // Reservation should NOT be counted in committed because it's already in expenses
    expect(result.total_committed).toBe(0);
    expect(result.total_spent).toBe(1000);
  });

  it("handles zero budget gracefully", () => {
    const trip = { ...tripFixture, total_budget: 0 };
    const result = calculateBudgetSummary(trip, [], [], []);
    expect(result.percent_used).toBe(0);
    expect(result.available).toBe(0);
  });

  it("computes per-category breakdown", () => {
    const cats = [
      makeBudgetCategory({ category: "flights", budgeted_amount: 2500 }),
      makeBudgetCategory({ category: "food", label: "Food", budgeted_amount: 800 }),
    ];
    const expenses = [
      makeExpense({ category: "flights", base_amount: 2000 }),
      makeExpense({ category: "food", base_amount: 100 }),
    ];
    const result = calculateBudgetSummary(tripFixture, cats, expenses, []);
    const flightsCat = result.categories.find(c => c.category === "flights");
    expect(flightsCat?.spent).toBe(2000);
    expect(flightsCat?.percent).toBe(80);
    expect(flightsCat?.status).toBe("yellow");
  });
});
