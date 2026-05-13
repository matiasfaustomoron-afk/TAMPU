import { describe, it, expect } from "vitest";
import { buildSplitSummary, parseSplitFromNotes, encodeSplitToNotes, type SplitExpense } from "../split";
import { makeExpense } from "./fixtures";

function shared(amount: number, paid_by: string, members: string[]): SplitExpense {
  return { ...makeExpense({ base_amount: amount }), split: { paid_by, shared_with: members } };
}

describe("buildSplitSummary", () => {
  it("returns empty when no expenses", () => {
    const r = buildSplitSummary([]);
    expect(r.count).toBe(0);
    expect(r.by_user.length).toBe(0);
  });

  it("equally splits a 2-person expense", () => {
    const r = buildSplitSummary([shared(100, "A", ["A", "B"])]);
    const a = r.by_user.find(b => b.user === "A")!;
    const b = r.by_user.find(b => b.user === "B")!;
    expect(a.net).toBe(50);
    expect(b.net).toBe(-50);
    expect(r.settlements).toEqual([{ from: "B", to: "A", amount: 50 }]);
  });

  it("nets out across multiple expenses", () => {
    const r = buildSplitSummary([
      shared(60, "A", ["A", "B", "C"]),  // A is owed 40, B/C each owe 20
      shared(30, "B", ["A", "B", "C"]),  // B is owed 20, A/C each owe 10
    ]);
    // Net: A = +40 - 10 = +30; B = -20 + 20 = 0; C = -20 - 10 = -30
    expect(r.by_user.find(b => b.user === "A")?.net).toBe(30);
    expect(r.by_user.find(b => b.user === "C")?.net).toBe(-30);
    expect(r.by_user.find(b => b.user === "B")).toBeUndefined(); // filtered as zero
    expect(r.settlements.length).toBe(1);
    expect(r.settlements[0]).toEqual({ from: "C", to: "A", amount: 30 });
  });

  it("greedy match minimises number of settlements", () => {
    // 3 owe, 1 is owed
    const r = buildSplitSummary([shared(100, "A", ["A", "B", "C", "D"])]);
    // A is owed 75; B, C, D each owe 25
    expect(r.settlements.length).toBe(3);
    expect(r.settlements.every(s => s.to === "A" && s.amount === 25)).toBe(true);
  });

  it("encodes and parses split metadata in notes round-trip", () => {
    const meta = { paid_by: "Yo", shared_with: ["Yo", "Ana"] };
    const encoded = encodeSplitToNotes("nota libre", meta);
    expect(encoded).toContain("__SPLIT__:");
    expect(encoded).toContain("nota libre");
    const decoded = parseSplitFromNotes(encoded);
    expect(decoded).toEqual(meta);
  });

  it("returns null when parsing notes without split tag", () => {
    expect(parseSplitFromNotes(null)).toBeNull();
    expect(parseSplitFromNotes("just a note")).toBeNull();
  });

  it("decoding malformed tag returns null safely", () => {
    expect(parseSplitFromNotes("__SPLIT__:{broken}__")).toBeNull();
  });
});
