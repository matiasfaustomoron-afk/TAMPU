"use client";

import { generateId } from "@/lib/utils/helpers";
import {
  seedTrip, seedCities, seedBudgetCategories, seedReservations,
  seedTasks, seedDocuments, seedPackingItems, seedExpenses, seedAlerts,
  getTripId,
} from "@/lib/demo/seed-data";
import type {
  Trip, City, Task, Reservation, BudgetCategory, Expense,
  Document, PackingItem, Alert, TripDay,
} from "@/lib/types/database";

const STORAGE_KEY = "travel-os-data";
const DEMO_USER_ID = "demo-user-001";

interface StoreData {
  trips: Trip[];
  cities: City[];
  tasks: Task[];
  reservations: Reservation[];
  budget_categories: BudgetCategory[];
  expenses: Expense[];
  documents: Document[];
  packing_items: PackingItem[];
  alerts: Alert[];
  trip_days: TripDay[];
  initialized: boolean;
}

function addIds<T extends Record<string, unknown>>(items: T[]): (T & { id: string })[] {
  return items.map((item) => ({ ...item, id: generateId() }));
}

function generateTripDays(): TripDay[] {
  const days: TripDay[] = [];
  const start = new Date("2026-08-10");
  const end = new Date("2026-09-02");
  let dayNum = 1;
  const current = new Date(start);

  const citySchedule: Record<number, { city: string; zone?: string; accommodation?: string; activity?: string; transport?: string; status: "empty" | "partial" | "planned" | "confirmed" }> = {
    1: { city: "São Paulo (GRU)", transport: "Emirates GRU→DXB", activity: "Transit", status: "confirmed" },
    2: { city: "Dubai (DXB)", transport: "Emirates DXB→MNL", activity: "Transit", status: "confirmed" },
    3: { city: "Manila (MNL)", accommodation: "pending - airport hotel", activity: "Rest before midnight flight", transport: "PAL PR215 MNL→POM 00:20", status: "partial" },
    4: { city: "Port Moresby (POM)", accommodation: "pending - POM hotel", activity: "Arrive POM, rest and prepare", status: "partial" },
    5: { city: "Port Moresby (POM)", accommodation: "pending - POM hotel", activity: "Prepare for Wander tour", status: "partial" },
    6: { city: "PNG Highlands", accommodation: "Wander Expeditions", activity: "Wander PNG III Tour - Day 1", status: "confirmed" },
    7: { city: "PNG Highlands", accommodation: "Homestay - Asaro Mudmen", activity: "Goroka Cultural Show", status: "confirmed" },
    8: { city: "PNG Highlands", accommodation: "Homestay", activity: "Wander PNG III Tour", status: "confirmed" },
    9: { city: "PNG Highlands", accommodation: "Homestay - Skeleton Tribe", activity: "Wander PNG III Tour", status: "confirmed" },
    10: { city: "PNG Highlands", accommodation: "Homestay - Dust Walkers", activity: "Wander PNG III Tour", status: "confirmed" },
    11: { city: "PNG Highlands", accommodation: "Wander Expeditions", activity: "Wander PNG III Tour - Final day", status: "confirmed" },
    12: { city: "Port Moresby (POM)", accommodation: "pending - POM hotel", activity: "Post-tour rest", transport: "Return from highlands to POM", status: "partial" },
    13: { city: "Manila (MNL)", accommodation: "pending - airport hotel", transport: "Air Niugini PX10 POM→MNL", activity: "Transit", status: "partial" },
    14: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", transport: "pending MNL→ICN flight", activity: "Arrive Seoul, settle in", status: "partial" },
    15: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", activity: "pending - plan Seoul activities", status: "partial" },
    16: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    17: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    18: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    19: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    20: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    21: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    22: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    23: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", status: "empty" },
    24: { city: "Seoul", zone: "Jongno", accommodation: "Airbnb Jongno", transport: "Emirates ICN→DXB→GRU", activity: "Departure day", status: "confirmed" },
  };

  while (current <= end) {
    const schedule = citySchedule[dayNum] || { city: "Seoul", status: "empty" as const };
    days.push({
      id: generateId(),
      trip_id: getTripId(),
      date: current.toISOString().split("T")[0],
      day_number: dayNum,
      city_id: null,
      city_name: schedule.city,
      zone: schedule.zone || null,
      accommodation: schedule.accommodation || null,
      accommodation_reservation_id: null,
      check_in: [3, 4, 6, 12, 13, 14].includes(dayNum),
      check_out: [3, 5, 11, 12, 13, 24].includes(dayNum),
      main_activity: schedule.activity || null,
      secondary_activity: null,
      main_transport: schedule.transport || null,
      estimated_cost: 0,
      actual_cost: 0,
      notes: null,
      status: schedule.status,
    });
    current.setDate(current.getDate() + 1);
    dayNum++;
  }
  return days;
}

// ─── Default init: BLANK store ───
// We no longer seed Papúa+Seúl by default — confused new users.
// User opts in via /welcome → "Cargar viaje de ejemplo" button which calls seedExampleTrip().
function initializeData(): StoreData {
  return {
    trips: [],
    cities: [],
    tasks: [],
    reservations: [],
    budget_categories: [],
    expenses: [],
    documents: [],
    packing_items: [],
    alerts: [],
    trip_days: [],
    initialized: true,
  };
}

/** Explicitly seed the Papúa+Seúl example trip into the store. */
export function seedExampleTrip(): void {
  if (typeof window === "undefined") return;
  const trip: Trip = { ...seedTrip, user_id: DEMO_USER_ID, is_active: true };
  const data: StoreData = {
    trips: [trip],
    cities: addIds(seedCities),
    tasks: addIds(seedTasks),
    reservations: addIds(seedReservations),
    budget_categories: addIds(seedBudgetCategories),
    expenses: addIds(seedExpenses),
    documents: addIds(seedDocuments),
    packing_items: addIds(seedPackingItems),
    alerts: addIds(seedAlerts),
    trip_days: generateTripDays(),
    initialized: true,
  };
  _cache = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("travel-os-vault-change"));
}

let _cache: StoreData | null = null;

function getStore(): StoreData {
  if (_cache) return _cache;
  if (typeof window === "undefined") return initializeData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.initialized) {
        _cache = parsed;
        return parsed;
      }
    }
  } catch { /* ignore */ }
  const data = initializeData();
  _cache = data;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  return data;
}

function saveStore(data: StoreData) {
  _cache = data;
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ─── PUBLIC API ───

export function getActiveTrip(): Trip | null {
  const store = getStore();
  return store.trips.find((t) => t.is_active) || store.trips[0] || null;
}

export function getTrips(): Trip[] { return getStore().trips; }
export function getTrip(id: string): Trip | null { return getStore().trips.find((t) => t.id === id) || null; }
export function getCities(tripId: string): City[] { return getStore().cities.filter((c) => c.trip_id === tripId).sort((a, b) => a.order_index - b.order_index); }
export function getTasks(tripId: string): Task[] { return getStore().tasks.filter((t) => t.trip_id === tripId); }
export function getReservations(tripId: string): Reservation[] { return getStore().reservations.filter((r) => r.trip_id === tripId); }
export function getBudgetCategories(tripId: string): BudgetCategory[] { return getStore().budget_categories.filter((b) => b.trip_id === tripId).sort((a, b) => a.order_index - b.order_index); }
export function getExpenses(tripId: string): Expense[] { return getStore().expenses.filter((e) => e.trip_id === tripId); }
export function getDocuments(tripId: string): Document[] { return getStore().documents.filter((d) => d.trip_id === tripId); }
export function getPackingItems(tripId: string): PackingItem[] { return getStore().packing_items.filter((p) => p.trip_id === tripId); }
export function getAlerts(tripId: string): Alert[] { return getStore().alerts.filter((a) => a.trip_id === tripId); }
export function getTripDays(tripId: string): TripDay[] { return getStore().trip_days.filter((d) => d.trip_id === tripId).sort((a, b) => a.day_number - b.day_number); }

// ─── MUTATIONS ───

/**
 * Upsert de categoría de presupuesto en demo. Si existe la fila (mismo trip_id + category),
 * actualiza monto y label. Si no, crea con order_index del payload.
 */
export function upsertBudgetCategoryDemo(payload: {
  trip_id: string;
  category: string;
  label: string;
  budgeted_amount: number;
  order_index: number;
}): BudgetCategory {
  const store = getStore();
  const idx = store.budget_categories.findIndex(
    (b) => b.trip_id === payload.trip_id && b.category === payload.category
  );
  if (idx !== -1) {
    store.budget_categories[idx] = {
      ...store.budget_categories[idx],
      label: payload.label,
      budgeted_amount: payload.budgeted_amount,
      order_index: payload.order_index,
    };
    saveStore(store);
    return store.budget_categories[idx];
  }
  const row: BudgetCategory = {
    id: crypto.randomUUID(),
    trip_id: payload.trip_id,
    category: payload.category,
    label: payload.label,
    budgeted_amount: payload.budgeted_amount,
    order_index: payload.order_index,
  };
  store.budget_categories.push(row);
  saveStore(store);
  return row;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const store = getStore();
  const idx = store.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  store.tasks[idx] = { ...store.tasks[idx], ...updates, updated_at: new Date().toISOString() };
  saveStore(store);
  return store.tasks[idx];
}

export function addTask(input: Partial<Task> & { trip_id: string; title: string }): Task {
  const store = getStore();
  const now = new Date().toISOString();
  const row: Task = {
    id: generateId(),
    trip_id: input.trip_id,
    title: input.title,
    description: input.description ?? null,
    stage: input.stage ?? null,
    category: input.category ?? "other",
    subcategory: input.subcategory ?? null,
    priority: input.priority ?? "medium",
    criticality: input.criticality ?? "important",
    responsible: input.responsible ?? null,
    created_at: now,
    start_date: input.start_date ?? null,
    due_date: input.due_date ?? null,
    status: input.status ?? "pending",
    progress: input.progress ?? 0,
    is_blocker: input.is_blocker ?? false,
    dependency_id: input.dependency_id ?? null,
    next_action: input.next_action ?? null,
    requires_payment: input.requires_payment ?? false,
    estimated_amount: input.estimated_amount ?? null,
    actual_amount: input.actual_amount ?? null,
    reservation_id: input.reservation_id ?? null,
    document_id: input.document_id ?? null,
    city_id: input.city_id ?? null,
    city_name: input.city_name ?? null,
    notes: input.notes ?? null,
    updated_at: now,
  };
  store.tasks.push(row);
  saveStore(store);
  return row;
}

export function addExpense(expense: Omit<Expense, "id" | "created_at">): Expense {
  const store = getStore();
  const newExpense: Expense = { ...expense, id: generateId(), created_at: new Date().toISOString() };
  store.expenses.push(newExpense);
  saveStore(store);
  return newExpense;
}

export function updateExpense(id: string, updates: Partial<Expense>): Expense | null {
  const store = getStore();
  const idx = store.expenses.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  store.expenses[idx] = { ...store.expenses[idx], ...updates };
  saveStore(store);
  return store.expenses[idx];
}

export function deleteExpense(id: string): boolean {
  const store = getStore();
  const len = store.expenses.length;
  store.expenses = store.expenses.filter((e) => e.id !== id);
  if (store.expenses.length < len) { saveStore(store); return true; }
  return false;
}

export function updateReservation(id: string, updates: Partial<Reservation>): Reservation | null {
  const store = getStore();
  const idx = store.reservations.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  store.reservations[idx] = { ...store.reservations[idx], ...updates, updated_at: new Date().toISOString() };
  saveStore(store);
  return store.reservations[idx];
}

export function addReservation(reservation: Omit<Reservation, "id" | "created_at" | "updated_at">): Reservation {
  const store = getStore();
  const now = new Date().toISOString();
  const newRes: Reservation = { ...reservation, id: generateId(), created_at: now, updated_at: now };
  store.reservations.push(newRes);
  saveStore(store);
  return newRes;
}

export function deleteReservation(id: string): boolean {
  const store = getStore();
  const len = store.reservations.length;
  store.reservations = store.reservations.filter((r) => r.id !== id);
  if (store.reservations.length < len) { saveStore(store); return true; }
  return false;
}

export function updateDocument(id: string, updates: Partial<Document>): Document | null {
  const store = getStore();
  const idx = store.documents.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  store.documents[idx] = { ...store.documents[idx], ...updates, updated_at: new Date().toISOString() };
  saveStore(store);
  return store.documents[idx];
}

export function updatePackingItem(id: string, updates: Partial<PackingItem>): PackingItem | null {
  const store = getStore();
  const idx = store.packing_items.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  store.packing_items[idx] = { ...store.packing_items[idx], ...updates };
  saveStore(store);
  return store.packing_items[idx];
}

export function addPackingItem(item: Omit<PackingItem, "id">): PackingItem {
  const store = getStore();
  const newItem: PackingItem = { ...item, id: generateId() };
  store.packing_items.push(newItem);
  saveStore(store);
  return newItem;
}

/**
 * Upsert de un trip_day en el demo store. Match por (trip_id, date).
 * Devuelve el TripDay resultante con id.
 */
export function upsertTripDay(row: Omit<TripDay, "id">): TripDay {
  const store = getStore();
  const idx = store.trip_days.findIndex(d => d.trip_id === row.trip_id && d.date === row.date);
  if (idx >= 0) {
    store.trip_days[idx] = { ...store.trip_days[idx], ...row };
    saveStore(store);
    return store.trip_days[idx];
  }
  const created: TripDay = { ...row, id: generateId() };
  store.trip_days.push(created);
  saveStore(store);
  return created;
}

export function addTrip(trip: Omit<Trip, "id" | "user_id" | "created_at" | "updated_at" | "is_active">): Trip {
  const store = getStore();
  const now = new Date().toISOString();
  // Deactivate previous trips
  for (const t of store.trips) t.is_active = false;
  const newTrip: Trip = {
    ...trip,
    id: generateId(),
    user_id: DEMO_USER_ID,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  store.trips.push(newTrip);
  // Seed a baseline budget category set so the new trip isn't empty
  const baseCats = ["flights","accommodation","food","transport","activities","insurance","contingency","other"];
  baseCats.forEach((cat, i) => {
    store.budget_categories.push({
      id: generateId(), trip_id: newTrip.id, category: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      budgeted_amount: 0, order_index: i,
    });
  });
  saveStore(store);
  return newTrip;
}

/**
 * Patch parcial de un viaje en demo store. Devuelve el Trip actualizado o null si no existe.
 * Mismo contrato que `patchTrip` (Supabase): solo los campos pasados se actualizan.
 */
export function updateTripFields(
  tripId: string,
  patch: Partial<Omit<Trip, "id" | "user_id" | "created_at" | "is_active">>
): Trip | null {
  const store = getStore();
  const idx = store.trips.findIndex(t => t.id === tripId);
  if (idx === -1) return null;
  store.trips[idx] = {
    ...store.trips[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  saveStore(store);
  return store.trips[idx];
}

export function activateTrip(tripId: string): Trip | null {
  const store = getStore();
  let found: Trip | null = null;
  for (const t of store.trips) {
    t.is_active = t.id === tripId;
    if (t.is_active) found = t;
  }
  saveStore(store);
  return found;
}

export function deleteTrip(tripId: string): boolean {
  const store = getStore();
  const before = store.trips.length;
  store.trips = store.trips.filter(t => t.id !== tripId);
  store.cities = store.cities.filter(c => c.trip_id !== tripId);
  store.tasks = store.tasks.filter(t => t.trip_id !== tripId);
  store.reservations = store.reservations.filter(r => r.trip_id !== tripId);
  store.budget_categories = store.budget_categories.filter(b => b.trip_id !== tripId);
  store.expenses = store.expenses.filter(e => e.trip_id !== tripId);
  store.documents = store.documents.filter(d => d.trip_id !== tripId);
  store.packing_items = store.packing_items.filter(p => p.trip_id !== tripId);
  store.alerts = store.alerts.filter(a => a.trip_id !== tripId);
  store.trip_days = store.trip_days.filter(d => d.trip_id !== tripId);
  // If we removed the active one, activate the first remaining
  const anyActive = store.trips.some(t => t.is_active);
  if (!anyActive && store.trips.length > 0) store.trips[0].is_active = true;
  saveStore(store);
  return store.trips.length < before;
}

export function updateAlert(id: string, updates: Partial<Alert>): Alert | null {
  const store = getStore();
  const idx = store.alerts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  store.alerts[idx] = { ...store.alerts[idx], ...updates };
  saveStore(store);
  return store.alerts[idx];
}

export function resetStore(): void {
  _cache = null;
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
