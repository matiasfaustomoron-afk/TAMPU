import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildOpenDecisions } from "../decisions";
import { makeTask, makeReservation } from "./fixtures";

describe("buildOpenDecisions", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-01T12:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });

  it("returns empty when no qualifying items", () => {
    expect(buildOpenDecisions([], [])).toEqual([]);
  });

  it("includes essential pending tasks in planning stage", () => {
    const t = makeTask({ stage: "planning", criticality: "essential", status: "pending", due_date: "2026-07-15" });
    const r = buildOpenDecisions([t], []);
    expect(r.length).toBe(1);
    expect(r[0].source).toBe("task");
  });

  it("excludes done tasks", () => {
    const t = makeTask({ stage: "planning", criticality: "essential", status: "done" });
    expect(buildOpenDecisions([t], [])).toEqual([]);
  });

  it("excludes operational tasks (web check-in, etc) unless blocker", () => {
    const t = makeTask({ stage: "planning", criticality: "essential", title: "Web check-in Emirates" });
    expect(buildOpenDecisions([t], [])).toEqual([]);
  });

  it("includes operational blocker tasks (e.g. mandatory check-in)", () => {
    const t = makeTask({ stage: "planning", criticality: "blocker", title: "Web check-in Emirates" });
    expect(buildOpenDecisions([t], []).length).toBe(1);
  });

  it("excludes nice_to_have tasks", () => {
    const t = makeTask({ stage: "planning", criticality: "nice_to_have", status: "pending" });
    expect(buildOpenDecisions([t], [])).toEqual([]);
  });

  it("includes pending blocker reservations", () => {
    const res = makeReservation({ status: "pending", criticality: "blocker", payment_deadline: "2026-07-15" });
    const r = buildOpenDecisions([], [res]);
    expect(r.length).toBe(1);
    expect(r[0].source).toBe("reservation");
  });

  it("urgency critical for ≤7 days", () => {
    const t = makeTask({ stage: "planning", criticality: "blocker", status: "pending", due_date: "2026-07-05" });
    const r = buildOpenDecisions([t], []);
    expect(r[0].urgency).toBe("critical");
  });

  it("sorts by urgency then days_until", () => {
    const a = makeTask({ stage: "planning", criticality: "essential", status: "pending", due_date: "2026-07-30" });
    const b = makeTask({ stage: "planning", criticality: "blocker", status: "pending", due_date: "2026-07-05" });
    const r = buildOpenDecisions([a, b], []);
    expect(r[0].id).toBe(b.id);
  });
});
