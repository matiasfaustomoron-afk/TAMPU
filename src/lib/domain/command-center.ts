import type {
  Trip, Task, Reservation, BudgetCategory, Expense, Document, PackingItem, TripDay, Alert, DashboardData,
} from "@/lib/types/database";
import { buildDashboardData } from "./dashboard";
import { detectTripMode, type TripModeInfo } from "./trip-mode";
import { buildMoneyInFlight, type MoneyInFlightSummary } from "./money-in-flight";
import { buildCashflow, type CashflowSummary } from "./cashflow";
import { buildRiskRegister, type RiskRegister } from "./risk-register";
import { buildOpenDecisions, type DecisionItem } from "./decisions";
import { buildQuickAccess, type QuickAccessSnapshot } from "./quick-access";
import { daysUntil } from "@/lib/utils/helpers";

export interface Next7Day {
  date: string;
  day_label: string;
  is_today: boolean;
  is_pre_trip: boolean;
  is_in_trip: boolean;
  city: string | null;
  accommodation: string | null;
  next_transport: string | null;
  estimated_cost: number;
  task_count: number;
  top_task: string | null;
  alert_count: number;
}

export interface CommandCenterData {
  trip: Trip;
  mode_info: TripModeInfo;
  dashboard: DashboardData;
  quick_access: QuickAccessSnapshot;
  money_in_flight: MoneyInFlightSummary;
  cashflow: CashflowSummary;
  risk: RiskRegister;
  decisions: DecisionItem[];
  next_7_days: Next7Day[];
  today_card: TodayCard | null;
}

export interface TodayCard {
  date: string;
  trip_day_number: number | null;
  city: string | null;
  accommodation: string | null;
  check_in: boolean;
  check_out: boolean;
  main_activity: string | null;
  next_transport: string | null;
  estimated_cost: number;
  due_today_count: number;
  alerts_today_count: number;
}

const MS_DAY = 1000 * 60 * 60 * 24;

function iso(d: Date): string { return d.toISOString().split("T")[0]; }

function buildNext7Days(
  trip: Trip,
  tasks: Task[],
  tripDays: TripDay[],
  alerts: Alert[],
): Next7Day[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tripStart = new Date(trip.start_date + "T00:00:00");
  const tripEnd = new Date(trip.end_date + "T00:00:00");
  const out: Next7Day[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * MS_DAY);
    const isoStr = iso(d);
    const td = tripDays.find(x => x.date === isoStr);
    const is_in_trip = d >= tripStart && d <= tripEnd;
    const tasksOnDay = tasks.filter(t => t.due_date === isoStr && t.status !== "done" && t.status !== "cancelled");
    const topTask = tasksOnDay.sort((a, b) => {
      const order: Record<string, number> = { blocker: 4, essential: 3, important: 2, nice_to_have: 1 };
      return (order[b.criticality] || 0) - (order[a.criticality] || 0);
    })[0];
    const alertsOnDay = alerts.filter(a => a.target_date === isoStr);
    out.push({
      date: isoStr,
      day_label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
      is_today: i === 0,
      is_pre_trip: d < tripStart,
      is_in_trip,
      city: td?.city_name || null,
      accommodation: td?.accommodation || null,
      next_transport: td?.main_transport || null,
      estimated_cost: td?.estimated_cost || 0,
      task_count: tasksOnDay.length,
      top_task: topTask?.title || null,
      alert_count: alertsOnDay.length,
    });
  }
  return out;
}

function buildTodayCard(
  trip: Trip,
  tripDays: TripDay[],
  tasks: Task[],
  alerts: Alert[],
): TodayCard | null {
  const todayIso = iso(new Date());
  const td = tripDays.find(x => x.date === todayIso);
  // Only show during pre-trip ≤7d or in-trip
  const start = daysUntil(trip.start_date);
  const end = daysUntil(trip.end_date);
  const showByTime = (start <= 7 && start > 0) || (start <= 0 && end >= 0);
  if (!showByTime) return null;

  const dueToday = tasks.filter(t => t.due_date === todayIso && t.status !== "done" && t.status !== "cancelled");
  const alertsToday = alerts.filter(a => a.target_date === todayIso);
  return {
    date: todayIso,
    trip_day_number: td?.day_number ?? null,
    city: td?.city_name ?? null,
    accommodation: td?.accommodation ?? null,
    check_in: td?.check_in ?? false,
    check_out: td?.check_out ?? false,
    main_activity: td?.main_activity ?? null,
    next_transport: td?.main_transport ?? null,
    estimated_cost: td?.estimated_cost ?? 0,
    due_today_count: dueToday.length,
    alerts_today_count: alertsToday.length,
  };
}

export function buildCommandCenter(
  trip: Trip,
  tasks: Task[],
  reservations: Reservation[],
  budgetCategories: BudgetCategory[],
  expenses: Expense[],
  documents: Document[],
  packingItems: PackingItem[],
  tripDays: TripDay[],
): CommandCenterData {
  const dashboard = buildDashboardData(trip, tasks, reservations, budgetCategories, expenses, documents, packingItems, [], tripDays);
  const mode_info = detectTripMode(trip);
  const quick_access = buildQuickAccess(trip, reservations, documents, tripDays);
  const money_in_flight = buildMoneyInFlight(trip, reservations, tasks);
  const cashflow = buildCashflow(trip, expenses, reservations);
  const risk = buildRiskRegister(trip, tasks, reservations, documents, tripDays, dashboard.budget);
  const decisions = buildOpenDecisions(tasks, reservations);
  const next_7_days = buildNext7Days(trip, tasks, tripDays, dashboard.alerts);
  const today_card = buildTodayCard(trip, tripDays, tasks, dashboard.alerts);
  return {
    trip, mode_info, dashboard, quick_access, money_in_flight,
    cashflow, risk, decisions, next_7_days, today_card,
  };
}
