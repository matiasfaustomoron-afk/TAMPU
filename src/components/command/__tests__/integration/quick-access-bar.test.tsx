// @vitest-environment happy-dom
/// <reference lib="dom" />
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuickAccessBar } from "../../index";
import type { QuickAccessSnapshot } from "@/lib/domain/quick-access";

const T = {
  title: "Quick access",
  passport: "Passport",
  insurance: "Insurance",
  nextFlight: "Next flight",
  bed: "Bed",
  emergency: "SOS",
  offline: "offline",
  ready: "Ready",
  missing: "Missing",
};

function fmtDate(d: string) { return d; }

describe("<QuickAccessBar />", () => {
  it("shows 'Missing' for all blocks when snapshot is empty", () => {
    const snapshot: QuickAccessSnapshot = {
      passport: null, insurance: null, next_flight: null, current_bed: null,
      emergency_contacts: [], offline_ready_count: 0, offline_total_count: 0,
    };
    render(<QuickAccessBar snapshot={snapshot} t={T} formatDate={fmtDate} />);
    // 3 labels read "Missing": passport, insurance — bed renders "Missing", flight too
    expect(screen.getAllByText("Missing").length).toBeGreaterThanOrEqual(3);
  });

  it("shows passport name and Ready when passport is ready", () => {
    const snapshot: QuickAccessSnapshot = {
      passport: { name: "AR Passport", status: "ready", ready: true, offline: true },
      insurance: null, next_flight: null, current_bed: null,
      emergency_contacts: [], offline_ready_count: 0, offline_total_count: 0,
    };
    render(<QuickAccessBar snapshot={snapshot} t={T} formatDate={fmtDate} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("AR Passport")).toBeInTheDocument();
  });

  it("shows current bed city and address", () => {
    const snapshot: QuickAccessSnapshot = {
      passport: null, insurance: null, next_flight: null,
      current_bed: { city: "Seoul", address: "Airbnb Jongno", date: "2026-08-22", check_in: false, check_out: false },
      emergency_contacts: [], offline_ready_count: 0, offline_total_count: 0,
    };
    render(<QuickAccessBar snapshot={snapshot} t={T} formatDate={fmtDate} />);
    expect(screen.getByText("Seoul")).toBeInTheDocument();
    expect(screen.getByText("Airbnb Jongno")).toBeInTheDocument();
  });

  it("shows emergency contact count", () => {
    const snapshot: QuickAccessSnapshot = {
      passport: null, insurance: null, next_flight: null, current_bed: null,
      emergency_contacts: [{ name: "Consulate AR", notes: null }, { name: "Wander 24h", notes: null }],
      offline_ready_count: 0, offline_total_count: 0,
    };
    render(<QuickAccessBar snapshot={snapshot} t={T} formatDate={fmtDate} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders 5 links (passport, insurance, flight, bed, sos)", () => {
    const snapshot: QuickAccessSnapshot = {
      passport: null, insurance: null, next_flight: null, current_bed: null,
      emergency_contacts: [], offline_ready_count: 0, offline_total_count: 0,
    };
    const { container } = render(<QuickAccessBar snapshot={snapshot} t={T} formatDate={fmtDate} />);
    expect(container.querySelectorAll("a").length).toBe(5);
  });
});
