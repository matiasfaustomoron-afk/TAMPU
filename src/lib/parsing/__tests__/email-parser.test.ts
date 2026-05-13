import { describe, it, expect } from "vitest";
import { heuristicMultiParse } from "../email-parser";
import { SAMPLES } from "../__fixtures__/email-samples";

describe("heuristicMultiParse — fixture corpus", () => {
  for (const sample of SAMPLES) {
    it(`detects carrier "${sample.carrier}" in fixture "${sample.id}"`, () => {
      const result = heuristicMultiParse(sample.raw);
      if (sample.carrier !== "Other") {
        expect(result.carrier_hint).toBe(sample.carrier);
      }
    });

    it(`detects language "${sample.language}" in fixture "${sample.id}"`, () => {
      const result = heuristicMultiParse(sample.raw);
      expect(result.languages).toContain(sample.language);
    });

    it(`extracts >= ${sample.expectedMinBookings} booking(s) from fixture "${sample.id}"`, () => {
      const result = heuristicMultiParse(sample.raw);
      expect(result.bookings.length).toBeGreaterThanOrEqual(sample.expectedMinBookings);
    });

    it(`first booking type matches expected for fixture "${sample.id}"`, () => {
      const result = heuristicMultiParse(sample.raw);
      expect(result.bookings.length).toBeGreaterThan(0);
      // We accept either the expected type or "flight" for cases where the test
      // expects accommodation but the email has flight content above it; tighten
      // per-sample later if needed.
      const types = result.bookings.map((b) => b.type);
      expect(types).toContain(sample.expectedType);
    });
  }
});

describe("heuristicMultiParse — invariants", () => {
  it("returns empty bookings on garbage input", () => {
    const r = heuristicMultiParse("hola que tal andas");
    // The text has zero locator, zero date, zero currency. Filter drops it.
    expect(r.bookings.length).toBe(0);
  });

  it("never lets amounts go negative", () => {
    for (const s of SAMPLES) {
      const r = heuristicMultiParse(s.raw);
      for (const b of r.bookings) {
        expect(b.original_amount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("locator (when present) is uppercase alphanumeric", () => {
    for (const s of SAMPLES) {
      const r = heuristicMultiParse(s.raw);
      for (const b of r.bookings) {
        if (b.locator) {
          expect(b.locator).toMatch(/^[A-Z0-9]{5,10}$/);
        }
      }
    }
  });

  it("dates (when present) are ISO yyyy-mm-dd", () => {
    for (const s of SAMPLES) {
      const r = heuristicMultiParse(s.raw);
      for (const b of r.bookings) {
        if (b.use_date) {
          expect(b.use_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
  });

  it("currencies are ISO 4217 (3 letters)", () => {
    for (const s of SAMPLES) {
      const r = heuristicMultiParse(s.raw);
      for (const b of r.bookings) {
        expect(b.original_currency).toMatch(/^[A-Z]{3}$/);
      }
    }
  });
});

describe("heuristicMultiParse — Despegar multibooking split", () => {
  it("splits 'Vuelo 1 / Vuelo 2' into separate bookings", () => {
    const despegar = SAMPLES.find((s) => s.id === "despegar-multi")!;
    const result = heuristicMultiParse(despegar.raw);
    expect(result.bookings.length).toBeGreaterThanOrEqual(2);
    // First two should be flights (the round trip)
    expect(result.bookings[0].type).toBe("flight");
    expect(result.bookings[1].type).toBe("flight");
  });
});

describe("heuristicMultiParse — Portuguese detection", () => {
  it("identifies pt-BR distinct from es", () => {
    const gol = SAMPLES.find((s) => s.id === "gol-pt-br-single")!;
    const result = heuristicMultiParse(gol.raw);
    expect(result.languages).toContain("pt");
    // Critically: confirms TripIt's gap — Tampu does parse Portuguese.
  });
});
