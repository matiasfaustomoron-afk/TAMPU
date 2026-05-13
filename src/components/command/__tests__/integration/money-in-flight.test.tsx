// @vitest-environment happy-dom
/// <reference lib="dom" />
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyInFlightCard } from "../../index";
import type { MoneyInFlightSummary } from "@/lib/domain/money-in-flight";

const T = {
  title: "Money in flight",
  pending: "pending",
  next7: "7d",
  next30: "30d",
  total: "Total",
  viewAll: "All",
  noPayments: "No payments",
  daysShort: "d",
  lateShort: "late",
};

function fmt(n: number) { return `$${n}`; }
function fmtDate(d: string) { return d; }

describe("<MoneyInFlightCard />", () => {
  it("renders the no-payments message when items are empty", () => {
    const summary: MoneyInFlightSummary = {
      items: [], total_base_7d: 0, total_base_30d: 0, total_base_all: 0, critical_count: 0,
    };
    render(<MoneyInFlightCard summary={summary} t={T} formatCurrency={fmt} formatDate={fmtDate} />);
    expect(screen.getByText("No payments")).toBeInTheDocument();
  });

  it("shows totals and items when present", () => {
    const summary: MoneyInFlightSummary = {
      items: [
        {
          id: "r-1", source: "reservation", title: "Travel insurance",
          provider: "IATI", deadline: "2026-07-15", days_until: 5,
          amount: 250, currency: "USD", base_amount: 250, severity: "critical", deep_link: "/reservations",
        },
      ],
      total_base_7d: 250, total_base_30d: 250, total_base_all: 250, critical_count: 1,
    };
    render(<MoneyInFlightCard summary={summary} t={T} formatCurrency={fmt} formatDate={fmtDate} />);
    expect(screen.getByText("Travel insurance")).toBeInTheDocument();
    expect(screen.getByText(/IATI/)).toBeInTheDocument();
    // Total in 7-day bucket shows $250
    expect(screen.getAllByText("$250").length).toBeGreaterThan(0);
  });

  it("applies critical border when critical_count > 0", () => {
    const summary: MoneyInFlightSummary = {
      items: [{
        id: "r-2", source: "reservation", title: "X", provider: "P",
        deadline: "2026-07-10", days_until: 2, amount: 100, currency: "USD",
        base_amount: 100, severity: "critical", deep_link: "/reservations",
      }],
      total_base_7d: 100, total_base_30d: 100, total_base_all: 100, critical_count: 1,
    };
    const { container } = render(<MoneyInFlightCard summary={summary} t={T} formatCurrency={fmt} formatDate={fmtDate} />);
    // The outer card carries border-l-destructive when critical_count > 0.
    // Previously asserted `border-l-red-500` (raw Tailwind); migrated to the
    // semantic token `border-l-destructive` as part of the tierra-palette rebrand
    // (mayo 2026) so dark/light modes pick up the right hue automatically.
    expect(container.querySelector(".border-l-destructive")).not.toBeNull();
  });
});
