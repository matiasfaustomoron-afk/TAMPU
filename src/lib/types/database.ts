// ─── TRAVEL OS TYPES ───
// Mirrors the database schema. Single source of truth.
//
// MIGRATION PATH: cuando se genere supabase-generated.ts vía supabase CLI,
// los Row types pueden re-exportarse así (descomentar):
//
//   import type { Database } from "./supabase-generated";
//   export type Trip = Database['public']['Tables']['trips']['Row'];
//   export type Reservation = Database['public']['Tables']['reservations']['Row'];
//   // etc.
//
// Por ahora los tipos manuales siguen siendo la source-of-truth (más completos
// y con discriminated unions en status/severity). supabase-generated.ts
// re-exporta DESDE estos, no al revés. Cuando el gen real corra, invertir
// la dirección de la dependencia.

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

// ─── ENUMS ───
export type TaskStatus = "pending" | "in_progress" | "waiting" | "done" | "cancelled";
export type Priority = "low" | "medium" | "high" | "critical";
export type Criticality = "nice_to_have" | "important" | "essential" | "blocker";
export type ReservationType = "flight" | "accommodation" | "train" | "bus" | "tour" | "insurance" | "connectivity" | "other";
export type ReservationStatus = "pending" | "booked" | "confirmed" | "paid" | "cancelled" | "expired";
export type DocumentType = "passport" | "visa" | "insurance" | "ticket" | "reservation" | "receipt" | "payment_method" | "medical" | "emergency_contact" | "address" | "other";
export type AlertSeverity = "info" | "warning" | "critical";
export type TripStatus = "planning" | "active" | "completed" | "archived";
export type DayStatus = "empty" | "partial" | "planned" | "confirmed";

// ─── ENTITIES ───

export interface Profile {
  id: UUID;
  email: string;
  full_name: string | null;
  timezone: string;
  preferred_currency: string;
  date_format: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Trip {
  id: UUID;
  user_id: UUID;
  name: string;
  description: string | null;
  destination: string;
  status: TripStatus;
  start_date: ISODate;
  end_date: ISODate;
  base_currency: string;
  total_budget: number;
  contingency_percent: number;
  contingency_amount: number;
  alert_days_warning: number;
  alert_days_critical: number;
  budget_warning_threshold: number;
  budget_danger_threshold: number;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface City {
  id: UUID;
  trip_id: UUID;
  name: string;
  country: string;
  arrival_date: ISODate | null;
  departure_date: ISODate | null;
  nights: number;
  order_index: number;
  notes: string | null;
}

export interface TripDay {
  id: UUID;
  trip_id: UUID;
  date: ISODate;
  day_number: number;
  city_id: UUID | null;
  city_name: string | null;
  zone: string | null;
  accommodation: string | null;
  accommodation_reservation_id: UUID | null;
  check_in: boolean;
  check_out: boolean;
  main_activity: string | null;
  secondary_activity: string | null;
  main_transport: string | null;
  estimated_cost: number;
  actual_cost: number;
  notes: string | null;
  status: DayStatus;
}

export interface Task {
  id: UUID;
  trip_id: UUID;
  title: string;
  description: string | null;
  stage: string | null;
  category: string;
  subcategory: string | null;
  priority: Priority;
  criticality: Criticality;
  responsible: string | null;
  created_at: ISODateTime;
  start_date: ISODate | null;
  due_date: ISODate | null;
  status: TaskStatus;
  progress: number;
  is_blocker: boolean;
  dependency_id: UUID | null;
  next_action: string | null;
  requires_payment: boolean;
  estimated_amount: number | null;
  actual_amount: number | null;
  reservation_id: UUID | null;
  document_id: UUID | null;
  city_id: UUID | null;
  city_name: string | null;
  notes: string | null;
  updated_at: ISODateTime;
}

export interface Reservation {
  id: UUID;
  trip_id: UUID;
  type: ReservationType;
  criticality: Criticality;
  provider: string;
  city_id: UUID | null;
  city_name: string | null;
  description: string;
  purchase_date: ISODate | null;
  use_date: ISODate | null;
  use_end_date: ISODate | null;
  payment_deadline: ISODate | null;
  original_amount: number;
  original_currency: string;
  exchange_rate: number;
  base_amount: number;
  status: ReservationStatus;
  confirmation_received: boolean;
  locator: string | null;
  link: string | null;
  contact: string | null;
  cancellation_policy: string | null;
  is_cancellable: boolean;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface BudgetCategory {
  id: UUID;
  trip_id: UUID;
  category: string;
  label: string;
  budgeted_amount: number;
  order_index: number;
}

export interface Expense {
  id: UUID;
  trip_id: UUID;
  date: ISODate;
  city_id: UUID | null;
  city_name: string | null;
  category: string;
  subcategory: string | null;
  description: string;
  payment_method: string;
  original_currency: string;
  original_amount: number;
  exchange_rate: number;
  base_amount: number;
  is_fixed: boolean;
  is_budgeted: boolean;
  reservation_id: UUID | null;
  attachment_url: string | null;
  notes: string | null;
  created_at: ISODateTime;
}

export interface Document {
  id: UUID;
  trip_id: UUID;
  type: DocumentType;
  name: string;
  criticality: Criticality;
  expiry_date: ISODate | null;
  status: "pending" | "ready" | "expired" | "not_applicable";
  has_digital_copy: boolean;
  has_offline_copy: boolean;
  is_validated: boolean;
  action_required: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface PackingItem {
  id: UUID;
  trip_id: UUID;
  category: string;
  subcategory: string | null;
  item: string;
  quantity_target: number;
  quantity_current: number;
  is_essential: boolean;
  is_purchased: boolean;
  needs_purchase: boolean;
  assigned_bag: string | null;
  priority: Priority;
  status: "pending" | "packed" | "not_needed";
  deadline: ISODate | null;
  notes: string | null;
}

export interface Alert {
  id: UUID;
  trip_id: UUID;
  type: string;
  severity: AlertSeverity;
  module: string;
  origin_id: UUID | null;
  title: string;
  description: string;
  detected_at: ISODateTime;
  target_date: ISODate | null;
  status: "active" | "acknowledged" | "resolved" | "dismissed";
  suggested_action: string | null;
  deep_link: string | null;
  created_at: ISODateTime;
}

// ─── DERIVED / COMPUTED ───

export interface BudgetSummary {
  total_budget: number;
  contingency: number;
  effective_budget: number;
  total_spent: number;
  total_committed: number;
  available: number;
  percent_used: number;
  forecast_total: number;
  forecast_status: "green" | "yellow" | "orange" | "red";
  categories: CategoryBudget[];
}

export interface CategoryBudget {
  category: string;
  label: string;
  budgeted: number;
  spent: number;
  committed: number;
  remaining: number;
  percent: number;
  status: "green" | "yellow" | "orange" | "red";
}

export interface TripReadiness {
  overall_score: number;
  status: "green" | "yellow" | "orange" | "red";
  critical_tasks_done: number;
  critical_tasks_total: number;
  critical_reservations_done: number;
  critical_reservations_total: number;
  critical_docs_ready: number;
  critical_docs_total: number;
  essential_packing_done: number;
  essential_packing_total: number;
  budget_health_score: number;
  itinerary_completeness: number;
  nights_total: number;
  nights_covered: number;
  nights_uncovered: number;
}

export interface DashboardData {
  trip: Trip;
  readiness: TripReadiness;
  budget: BudgetSummary;
  tasks_summary: {
    total: number;
    done: number;
    pending: number;
    critical_pending: number;
    overdue: number;
    blockers: number;
  };
  reservations_summary: {
    total: number;
    confirmed: number;
    pending: number;
    critical_pending: number;
  };
  alerts: Alert[];
  upcoming_tasks: Task[];
  days_until_trip: number;
  days_until_end: number;
  trip_duration: number;
}

// ─── ATTACHMENTS ───

export interface Attachment {
  id: UUID;
  trip_id: UUID;
  user_id: UUID;
  entity_type: "trip" | "reservation" | "document" | "expense" | "task" | "packing_item" | "other";
  entity_id: UUID | null;
  category: "insurance" | "boarding_pass" | "identity" | "reservation" | "transport" | "health" | "receipt" | "other";
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  is_favorite: boolean;
  is_critical: boolean;
  available_offline: boolean;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ─── NOTIFICATIONS ───

export interface Notification {
  id: UUID;
  user_id: UUID;
  trip_id: UUID | null;
  type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  deep_link: string | null;
  read: boolean;
  created_at: ISODateTime;
}

export interface DeviceSubscription {
  id: UUID;
  user_id: UUID;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: ISODateTime;
}
