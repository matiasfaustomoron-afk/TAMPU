import { describe, it, expect } from "vitest";
import { haversine, optimizeRoute, twoOpt, optimizeRouteFull, type RoutePoint } from "../route-optimizer";

describe("route-optimizer", () => {
  describe("haversine", () => {
    it("returns 0 for identical points", () => {
      const p: RoutePoint = { id: "a", lat: -34.6, lng: -58.4 };
      expect(haversine(p, p)).toBeCloseTo(0, 1);
    });

    it("computes Buenos Aires → Sao Paulo distance ~1690 km", () => {
      const bsas: RoutePoint = { id: "bsas", lat: -34.6037, lng: -58.3816 };
      const gru: RoutePoint = { id: "gru", lat: -23.5505, lng: -46.6333 };
      const d = haversine(bsas, gru);
      expect(d).toBeGreaterThan(1650);
      expect(d).toBeLessThan(1750);
    });
  });

  describe("optimizeRoute (greedy NN)", () => {
    it("returns identity for empty array", () => {
      const r = optimizeRoute([]);
      expect(r.ordered).toEqual([]);
      expect(r.totalKm).toBe(0);
    });

    it("returns identity for single point", () => {
      const p: RoutePoint = { id: "a", lat: 0, lng: 0 };
      const r = optimizeRoute([p]);
      expect(r.ordered).toEqual([p]);
      expect(r.totalKm).toBe(0);
    });

    it("orders a square optimally starting from first point", () => {
      // Square corners: (0,0), (0,1), (1,1), (1,0). Greedy from (0,0) walks
      // perimeter in CCW order: (0,0) → (0,1) → (1,1) → (1,0). Total = 3 sides
      const pts: RoutePoint[] = [
        { id: "a", lat: 0, lng: 0 },
        { id: "b", lat: 0, lng: 1 },
        { id: "c", lat: 1, lng: 1 },
        { id: "d", lat: 1, lng: 0 },
      ];
      const r = optimizeRoute(pts);
      expect(r.ordered[0].id).toBe("a");
      expect(r.ordered.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    });

    it("respects pinned starting point", () => {
      const pts: RoutePoint[] = [
        { id: "a", lat: 10, lng: 10 },
        { id: "b", lat: 0, lng: 0, pinned: true },
        { id: "c", lat: 1, lng: 1 },
      ];
      const r = optimizeRoute(pts);
      expect(r.ordered[0].id).toBe("b");
    });
  });

  describe("twoOpt", () => {
    it("improves a deliberately bad route", () => {
      // Punto medio sería más eficiente; pongamos un crossover obvio
      const pts: RoutePoint[] = [
        { id: "a", lat: 0, lng: 0 },
        { id: "b", lat: 1, lng: 1 },
        { id: "c", lat: 1, lng: 0 },
        { id: "d", lat: 0, lng: 1 },
      ];
      // Distancia ABCD con cruce
      let bad = 0;
      for (let i = 1; i < pts.length; i++) bad += haversine(pts[i - 1], pts[i]);
      const r = twoOpt(pts);
      expect(r.totalKm).toBeLessThanOrEqual(bad);
    });
  });

  describe("optimizeRouteFull", () => {
    it("produces a path through all points (no drops, no duplicates)", () => {
      const pts: RoutePoint[] = [
        { id: "a", lat: -34.6, lng: -58.4 },
        { id: "b", lat: -33.4, lng: -70.6 },
        { id: "c", lat: -12.0, lng: -77.0 },
        { id: "d", lat: -23.5, lng: -46.6 },
        { id: "e", lat: -16.5, lng: -68.1 },
      ];
      const r = optimizeRouteFull(pts);
      const ids = new Set(r.ordered.map((p) => p.id));
      expect(ids.size).toBe(pts.length);
      for (const p of pts) expect(ids.has(p.id)).toBe(true);
    });
  });
});
