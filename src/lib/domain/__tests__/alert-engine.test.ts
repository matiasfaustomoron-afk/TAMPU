import { describe, it, expect } from "vitest";
import { generateAlerts } from "../alert-engine";
import { tripFixture, makeTask, makeReservation, makeDocument, makePackingItem, makeTripDay, budgetSummaryFixture } from "./fixtures";

const emptyBudget = { ...budgetSummaryFixture, percent_used: 50, forecast_total: 5000, categories: [] };

describe("generateAlerts", () => {
  it("returns empty when everything is fine", () => {
    const tasks = [makeTask({ status: "done", criticality: "blocker" })];
    const reservations = [makeReservation({ status: "confirmed", criticality: "blocker" })];
    const documents = [makeDocument({ status: "ready", criticality: "blocker", has_offline_copy: true })];
    const packing = [makePackingItem({ status: "packed", is_essential: true })];
    const days = [makeTripDay({ accommodation: "Hotel", status: "confirmed" })];
    const alerts = generateAlerts(tripFixture, tasks, reservations, documents, packing, days, emptyBudget);
    expect(alerts.length).toBe(0);
  });

  it("generates alert for overdue task", () => {
    const tasks = [makeTask({ status: "pending", due_date: "2020-01-01" })];
    const alerts = generateAlerts(tripFixture, tasks, [], [], [], [], emptyBudget);
    const overdue = alerts.filter(a => a.type === "task_overdue");
    expect(overdue.length).toBe(1);
    expect(overdue[0].severity).toBe("critical");
  });

  it("generates alert for critical pending reservation", () => {
    const reservations = [makeReservation({ criticality: "blocker", status: "pending" })];
    const alerts = generateAlerts(tripFixture, [], reservations, [], [], [], emptyBudget);
    const resAlerts = alerts.filter(a => a.type === "reservation_critical_pending");
    expect(resAlerts.length).toBe(1);
  });

  it("generates alert for critical missing document", () => {
    const documents = [makeDocument({ criticality: "blocker", status: "pending" })];
    const alerts = generateAlerts(tripFixture, [], [], documents, [], [], emptyBudget);
    const docAlerts = alerts.filter(a => a.type === "doc_critical_missing");
    expect(docAlerts.length).toBe(1);
    expect(docAlerts[0].severity).toBe("critical");
  });

  it("generates alert for uncovered nights", () => {
    const days = [
      makeTripDay({ accommodation: null, city_name: "Manila" }),
      makeTripDay({ accommodation: "pending - TBD", city_name: "POM" }),
    ];
    const alerts = generateAlerts(tripFixture, [], [], [], [], days, emptyBudget);
    const nightAlerts = alerts.filter(a => a.type === "night_uncovered");
    expect(nightAlerts.length).toBe(1);
    expect(nightAlerts[0].description).toContain("Manila");
  });

  it("generates alert for blocker task", () => {
    const tasks = [makeTask({ is_blocker: true, status: "pending" })];
    const alerts = generateAlerts(tripFixture, tasks, [], [], [], [], emptyBudget);
    const blockerAlerts = alerts.filter(a => a.type === "task_blocker_pending");
    expect(blockerAlerts.length).toBe(1);
  });

  it("generates alert for document without offline copy", () => {
    const docs = [makeDocument({ criticality: "essential", status: "ready", has_offline_copy: false })];
    const alerts = generateAlerts(tripFixture, [], [], docs, [], [], emptyBudget);
    const offlineAlerts = alerts.filter(a => a.type === "doc_no_offline");
    expect(offlineAlerts.length).toBe(1);
  });

  it("generates alert for over-budget category", () => {
    const budget = {
      ...emptyBudget,
      categories: [{ category: "flights", label: "Flights", budgeted: 2500, spent: 3000, committed: 0, remaining: -500, percent: 120, status: "red" as const }],
    };
    const alerts = generateAlerts(tripFixture, [], [], [], [], [], budget);
    const budgetAlerts = alerts.filter(a => a.type === "budget_over_category");
    expect(budgetAlerts.length).toBe(1);
  });

  it("generates alert for forecast exceeded", () => {
    const budget = { ...emptyBudget, total_budget: 7500, forecast_total: 9000, contingency: 750 };
    const alerts = generateAlerts(tripFixture, [], [], [], [], [], budget);
    const forecastAlerts = alerts.filter(a => a.type === "forecast_exceeded");
    expect(forecastAlerts.length).toBe(1);
    expect(forecastAlerts[0].severity).toBe("critical");
  });
});
