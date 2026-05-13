import "@testing-library/jest-dom/vitest";

// Polyfill: structuredClone may be missing in some environments
if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = ((v: unknown) => JSON.parse(JSON.stringify(v))) as typeof globalThis.structuredClone;
}
