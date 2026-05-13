import { describe, it, expect } from "vitest";
import { buildTripICS } from "../ics-export";
import { tripFixture, makeReservation, makeTripDay } from "./fixtures";

describe("buildTripICS", () => {
  it("produces a valid VCALENDAR envelope", () => {
    const ics = buildTripICS(tripFixture, [], []);
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR$/);
    expect(ics).toContain("VERSION:2.0");
  });

  it("includes a trip-umbrella VEVENT", () => {
    const ics = buildTripICS(tripFixture, [], []);
    expect(ics).toContain(`UID:trip-${tripFixture.id}@travel-os`);
    expect(ics).toContain(`SUMMARY:Viaje: ${tripFixture.name}`);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260810");
    // End is exclusive (start_date + 1 day past end_date)
    expect(ics).toContain("DTEND;VALUE=DATE:20260903");
  });

  it("emits a VEVENT per active reservation", () => {
    const r1 = makeReservation({ use_date: "2026-08-12", status: "confirmed", description: "Flight A→B" });
    const r2 = makeReservation({ use_date: "2026-08-15", status: "cancelled", description: "Cancelled" });
    const ics = buildTripICS(tripFixture, [r1, r2], []);
    expect(ics).toContain("Flight A→B");
    expect(ics).not.toContain("Cancelled");
  });

  it("emits check-in and check-out events for trip days", () => {
    const day = makeTripDay({ date: "2026-08-22", accommodation: "Airbnb Jongno", check_in: true, check_out: false });
    const ics = buildTripICS(tripFixture, [], [day]);
    expect(ics).toMatch(/Check-in: Airbnb Jongno/);
  });

  it("escapes commas and newlines in summary/description", () => {
    const r = makeReservation({ use_date: "2026-08-12", status: "confirmed", description: "Hotel, room 12\nVIP" });
    const ics = buildTripICS(tripFixture, [r], []);
    expect(ics).toMatch(/Hotel\\,/);
    expect(ics).toMatch(/room 12\\nVIP/);
  });

  it("skips reservations without use_date", () => {
    const r = makeReservation({ use_date: null, status: "pending", description: "Unscheduled" });
    const ics = buildTripICS(tripFixture, [r], []);
    expect(ics).not.toContain("Unscheduled");
  });
});
