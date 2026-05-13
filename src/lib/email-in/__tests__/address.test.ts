import { describe, it, expect } from "vitest";
import {
  emailInAddress,
  tripShortId,
  extractTripShortIdFromAddress,
  buildTripIdLikePattern,
  getInboxAddress,
  parseInboxAddress,
} from "../address";

const TRIP_UUID = "a1b2c3d4-1234-5678-9abc-def012345678";
const EXPECTED_SHORT = "a1b2c3d4";

describe("email-in/address", () => {
  it("tripShortId returns first 8 chars without dashes, lowercase", () => {
    expect(tripShortId(TRIP_UUID)).toBe(EXPECTED_SHORT);
    expect(tripShortId("AABBCCDD-EEFF-1122")).toBe("aabbccdd");
  });

  it("emailInAddress composes `tampu+<shortId>@in.tampu.app`", () => {
    expect(emailInAddress(TRIP_UUID)).toBe(`tampu+${EXPECTED_SHORT}@in.tampu.app`);
  });

  it("getInboxAddress is alias of emailInAddress", () => {
    expect(getInboxAddress(TRIP_UUID)).toBe(emailInAddress(TRIP_UUID));
  });

  it("extracts short_id from plain address", () => {
    expect(extractTripShortIdFromAddress(`tampu+${EXPECTED_SHORT}@in.tampu.app`)).toBe(EXPECTED_SHORT);
  });

  it("extracts short_id from `Name <addr>` format", () => {
    expect(extractTripShortIdFromAddress(`"Tampu" <tampu+${EXPECTED_SHORT}@in.tampu.app>`)).toBe(EXPECTED_SHORT);
  });

  it("extracts short_id ignoring additional + suffixes", () => {
    expect(extractTripShortIdFromAddress(`tampu+${EXPECTED_SHORT}+extra@in.tampu.app`)).toBe(EXPECTED_SHORT);
  });

  it("returns null for invalid address", () => {
    expect(extractTripShortIdFromAddress("plain@example.com")).toBeNull();
    expect(extractTripShortIdFromAddress("")).toBeNull();
    expect(extractTripShortIdFromAddress("tampu+xyz@in.tampu.app")).toBeNull(); // xyz no es hex
  });

  it("parseInboxAddress returns { tripShortId } or null", () => {
    expect(parseInboxAddress(`tampu+${EXPECTED_SHORT}@in.tampu.app`)).toEqual({ tripShortId: EXPECTED_SHORT });
    expect(parseInboxAddress("nope@example.com")).toBeNull();
  });

  it("buildTripIdLikePattern adds dash separator", () => {
    expect(buildTripIdLikePattern(EXPECTED_SHORT)).toBe(`${EXPECTED_SHORT}-%`);
    expect(buildTripIdLikePattern("short")).toBe("short%");
  });
});
