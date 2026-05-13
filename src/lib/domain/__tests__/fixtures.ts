import type { Trip, Task, Reservation, Document, PackingItem, TripDay, BudgetCategory, Expense, BudgetSummary } from "@/lib/types/database";

const TRIP_ID = "test-trip-001";

export const tripFixture: Trip = {
  id: TRIP_ID, user_id: "user-1", name: "Test Trip", description: null, destination: "Seoul + PNG",
  status: "planning", start_date: "2026-08-10", end_date: "2026-09-02",
  base_currency: "USD", total_budget: 7500, contingency_percent: 10, contingency_amount: 750,
  alert_days_warning: 7, alert_days_critical: 3, budget_warning_threshold: 80, budget_danger_threshold: 95,
  is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-" + Math.random().toString(36).slice(2, 8), trip_id: TRIP_ID,
    title: "Test Task", description: null, stage: "planning", category: "flights",
    subcategory: null, priority: "medium", criticality: "important", responsible: "Matias",
    created_at: "2026-01-01T00:00:00Z", start_date: null, due_date: null,
    status: "pending", progress: 0, is_blocker: false, dependency_id: null,
    next_action: null, requires_payment: false, estimated_amount: null, actual_amount: null,
    reservation_id: null, document_id: null, city_id: null, city_name: null, notes: null,
    updated_at: "2026-01-01T00:00:00Z", ...overrides,
  };
}

export function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r-" + Math.random().toString(36).slice(2, 8), trip_id: TRIP_ID,
    type: "flight", criticality: "blocker", provider: "Test Air", city_id: null, city_name: "Test City",
    description: "Test flight", purchase_date: null, use_date: "2026-08-15", use_end_date: null,
    payment_deadline: null, original_amount: 500, original_currency: "USD", exchange_rate: 1,
    base_amount: 500, status: "pending", confirmation_received: false, locator: null, link: null,
    contact: null, cancellation_policy: null, is_cancellable: true, notes: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
  };
}

export function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "d-" + Math.random().toString(36).slice(2, 8), trip_id: TRIP_ID,
    type: "passport", name: "Test Doc", criticality: "blocker", expiry_date: null,
    status: "pending", has_digital_copy: false, has_offline_copy: false, is_validated: false,
    action_required: null, notes: null, attachment_url: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
  };
}

export function makePackingItem(overrides: Partial<PackingItem> = {}): PackingItem {
  return {
    id: "p-" + Math.random().toString(36).slice(2, 8), trip_id: TRIP_ID,
    category: "gear", subcategory: null, item: "Test Item",
    quantity_target: 1, quantity_current: 0, is_essential: true,
    is_purchased: true, needs_purchase: false, assigned_bag: null,
    priority: "high", status: "pending", deadline: null, notes: null, ...overrides,
  };
}

export function makeTripDay(overrides: Partial<TripDay> = {}): TripDay {
  return {
    id: "td-" + Math.random().toString(36).slice(2, 8), trip_id: TRIP_ID,
    date: "2026-08-15", day_number: 5, city_id: null, city_name: "Seoul",
    zone: null, accommodation: "Hotel Seoul", accommodation_reservation_id: null,
    check_in: false, check_out: false, main_activity: null, secondary_activity: null,
    main_transport: null, estimated_cost: 0, actual_cost: 0, notes: null,
    status: "planned", ...overrides,
  };
}

export function makeBudgetCategory(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: "bc-" + Math.random().toString(36).slice(2, 8), trip_id: TRIP_ID,
    category: "flights", label: "Flights", budgeted_amount: 2500, order_index: 0, ...overrides,
  };
}

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "e-" + Math.random().toString(36).slice(2, 8), trip_id: TRIP_ID,
    date: "2026-04-01", city_id: null, city_name: null,
    category: "flights", subcategory: null, description: "Test Expense",
    payment_method: "credit_card_black", original_currency: "USD", original_amount: 500,
    exchange_rate: 1, base_amount: 500, is_fixed: true, is_budgeted: true,
    reservation_id: null, attachment_url: null, notes: null,
    created_at: "2026-01-01T00:00:00Z", ...overrides,
  };
}

export const budgetSummaryFixture: BudgetSummary = {
  total_budget: 7500, contingency: 750, effective_budget: 7500,
  total_spent: 6265, total_committed: 0, available: 1235,
  percent_used: 84, forecast_total: 6265, forecast_status: "yellow",
  categories: [],
};
