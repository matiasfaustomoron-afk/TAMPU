import { describe, it, expect } from "vitest";
import { suggestPackingItems } from "../packing-templates";
import { tripFixture, makePackingItem } from "./fixtures";

describe("suggestPackingItems", () => {
  it("returns base items even when no profile matches", () => {
    const r = suggestPackingItems({ ...tripFixture, destination: "Antarctica Mars" }, [], []);
    expect(r.length).toBeGreaterThan(0);
    expect(r.some(s => s.trigger === "base")).toBe(true);
  });

  it("PNG destination adds malaria-related items", () => {
    const r = suggestPackingItems({ ...tripFixture, destination: "Papua New Guinea" }, [], ["PNG Highlands"]);
    expect(r.some(s => /malar|DEET|repelente|manga larga/i.test(s.item))).toBe(true);
  });

  it("Seoul destination adds humidity-related items", () => {
    const r = suggestPackingItems({ ...tripFixture, destination: "Seoul South Korea" }, [], ["Seoul"]);
    expect(r.some(s => /quick-dry|SPF|impermeable/i.test(s.item))).toBe(true);
  });

  it("Dubai destination adds hot/dry items", () => {
    const r = suggestPackingItems({ ...tripFixture, destination: "Dubai UAE" }, [], ["Dubai"]);
    expect(r.some(s => /modesta|SPF/i.test(s.item))).toBe(true);
  });

  it("skips items already in the existing packing list", () => {
    const existing = [makePackingItem({ item: "Pasaporte" })];
    const r = suggestPackingItems(tripFixture, existing, []);
    expect(r.some(s => s.item === "Pasaporte")).toBe(false);
  });

  it("adds duration-based items for long trips", () => {
    const longTrip = { ...tripFixture, start_date: "2026-01-01", end_date: "2026-02-01" };
    const r = suggestPackingItems(longTrip, [], []);
    expect(r.some(s => s.trigger === "duration")).toBe(true);
  });

  it("does not add duration items for short trips", () => {
    const shortTrip = { ...tripFixture, start_date: "2026-01-01", end_date: "2026-01-05" };
    const r = suggestPackingItems(shortTrip, [], []);
    expect(r.some(s => s.trigger === "duration")).toBe(false);
  });
});
