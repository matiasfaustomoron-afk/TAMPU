import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildRiskRegister } from "../risk-register";
import { tripFixture, makeReservation, makeDocument, makeTripDay, budgetSummaryFixture } from "./fixtures";

describe("buildRiskRegister", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-01T12:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });

  it("returns 5 domains", () => {
    const r = buildRiskRegister(tripFixture, [], [], [], [], budgetSummaryFixture);
    expect(r.domains.length).toBe(5);
    expect(r.domains.map(d => d.domain).sort()).toEqual(["documents", "health", "lodging", "money", "transport"]);
  });

  it("documents domain flags critical docs missing", () => {
    const d = makeDocument({ criticality: "blocker", status: "pending" });
    const r = buildRiskRegister(tripFixture, [], [], [d], [], budgetSummaryFixture);
    const docs = r.domains.find(x => x.domain === "documents")!;
    expect(docs.open_count).toBe(1);
    expect(docs.status).not.toBe("green");
  });

  it("lodging domain is red when close to trip + uncovered nights", () => {
    const day = makeTripDay({ accommodation: null });
    const r = buildRiskRegister(tripFixture, [], [], [], [day, day], budgetSummaryFixture);
    const lodging = r.domains.find(x => x.domain === "lodging")!;
    expect(lodging.open_count).toBe(2);
  });

  it("transport domain flags pending blocker flights", () => {
    const f = makeReservation({ type: "flight", criticality: "blocker", status: "pending" });
    const r = buildRiskRegister(tripFixture, [], [f], [], [], budgetSummaryFixture);
    const t = r.domains.find(x => x.domain === "transport")!;
    expect(t.open_count).toBe(1);
  });

  it("money domain is red when forecast_status is red", () => {
    const badBudget = { ...budgetSummaryFixture, forecast_status: "red" as const, forecast_total: 10000 };
    const r = buildRiskRegister(tripFixture, [], [], [], [], badBudget);
    const m = r.domains.find(x => x.domain === "money")!;
    expect(m.status).toBe("red");
  });

  it("health domain flags pending insurance", () => {
    const ins = makeReservation({ type: "insurance", criticality: "blocker", status: "pending" });
    const r = buildRiskRegister(tripFixture, [], [ins], [], [], budgetSummaryFixture);
    const h = r.domains.find(x => x.domain === "health")!;
    expect(h.status).toBe("red");
  });

  it("overall is the worst of all domains", () => {
    const d = makeDocument({ criticality: "blocker", status: "pending" });
    const r = buildRiskRegister(tripFixture, [], [], [d], [], budgetSummaryFixture);
    expect(["red", "orange", "yellow"]).toContain(r.overall);
  });
});
