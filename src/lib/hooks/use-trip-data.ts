"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useHydrated } from "./use-hydrated";

// Online data layer (Supabase)
import { fetchActiveTrip, fetchTrips, insertTrip, setActiveTrip, removeTrip, patchTrip } from "@/lib/data/trips";
import { prefetchDestinationGuide } from "@/lib/wikivoyage-client";
import { track, EVENTS } from "@/lib/analytics";
import { recordSyncSuccess, recordSyncError } from "@/lib/sync/status";

// Wrap a Supabase mutation with sync-status tracking. Records success on resolve,
// error on reject, while still throwing the error so callers can show toasts.
async function withSync<T>(p: Promise<T>): Promise<T> {
  try {
    const r = await p;
    recordSyncSuccess();
    return r;
  } catch (e) {
    recordSyncError(e);
    throw e;
  }
}
import { fetchTasks, mutateTask } from "@/lib/data/tasks";
import {
  fetchExpenses, insertExpense, removeExpense,
  fetchReservations, mutateReservation, insertReservation, removeReservation,
  fetchBudgetCategories, batchUpsertBudgetCategories,
  fetchDocuments, mutateDocument,
  fetchPackingItems, mutatePackingItem, insertPackingItem,
  fetchTripDays, fetchCities, upsertTripDay,
} from "@/lib/data/entities";

// Demo data layer (localStorage, isolated)
import * as demo from "@/lib/demo/demo-store";

// Domain
import { buildDashboardData } from "@/lib/domain/dashboard";
import { calculateBudgetSummary } from "@/lib/domain/forecast";
import { generateAlerts } from "@/lib/domain/alert-engine";
import { buildCommandCenter, type CommandCenterData } from "@/lib/domain/command-center";

import type {
  Trip, Task, Expense, Reservation, BudgetCategory,
  Document, PackingItem, TripDay, City,
  DashboardData, BudgetSummary, Alert,
} from "@/lib/types/database";

// ─── Generic async hook ───

function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher().then(r => { if (!cancelled) { setData(r); setLoading(false); } })
             .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, refetch };
}

// ─── Entity hooks ───

export function useActiveTrip() {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<Trip | null>(() => {
    if (!h) return Promise.resolve(null);
    if (mode === "online" && client) return fetchActiveTrip(client);
    if (mode === "demo") return Promise.resolve(demo.getActiveTrip());
    return Promise.resolve(null);
  }, [client, mode, h]);
}

export function useAllTrips() {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<Trip[]>(() => {
    if (!h) return Promise.resolve([]);
    if (mode === "online" && client) return fetchTrips(client);
    if (mode === "demo") return Promise.resolve(demo.getTrips());
    return Promise.resolve([]);
  }, [client, mode, h]);
}

export function useTasks(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<Task[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchTasks(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getTasks(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

export function useExpenses(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<Expense[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchExpenses(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getExpenses(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

export function useReservations(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<Reservation[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchReservations(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getReservations(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

export function useBudgetCategories(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<BudgetCategory[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchBudgetCategories(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getBudgetCategories(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

export function useDocuments(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<Document[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchDocuments(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getDocuments(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

export function usePackingItems(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<PackingItem[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchPackingItems(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getPackingItems(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

export function useTripDays(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<TripDay[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchTripDays(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getTripDays(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

export function useCities(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  return useQuery<City[]>(() => {
    if (!h || !tripId) return Promise.resolve([]);
    if (mode === "online" && client) return fetchCities(client, tripId);
    if (mode === "demo") return Promise.resolve(demo.getCities(tripId));
    return Promise.resolve([]);
  }, [client, mode, h, tripId]);
}

// ─── Composite hooks ───

export function useDashboard(): { data: DashboardData | null; loading: boolean } {
  const { data: trip, loading: lt } = useActiveTrip();
  const id = trip?.id;
  const { data: tasks, loading: l1 } = useTasks(id);
  const { data: reservations, loading: l2 } = useReservations(id);
  const { data: cats, loading: l3 } = useBudgetCategories(id);
  const { data: expenses, loading: l4 } = useExpenses(id);
  const { data: docs, loading: l5 } = useDocuments(id);
  const { data: packing, loading: l6 } = usePackingItems(id);
  const { data: days, loading: l7 } = useTripDays(id);
  const loading = lt || l1 || l2 || l3 || l4 || l5 || l6 || l7;
  const dash = useMemo(() => {
    if (!trip || !tasks || !reservations || !cats || !expenses || !docs || !packing || !days) return null;
    return buildDashboardData(trip, tasks, reservations, cats, expenses, docs, packing, [], days);
  }, [trip, tasks, reservations, cats, expenses, docs, packing, days]);
  return { data: dash, loading };
}

export function useCommandCenter(): { data: CommandCenterData | null; loading: boolean } {
  const { data: trip, loading: lt } = useActiveTrip();
  const id = trip?.id;
  const { data: tasks, loading: l1 } = useTasks(id);
  const { data: reservations, loading: l2 } = useReservations(id);
  const { data: cats, loading: l3 } = useBudgetCategories(id);
  const { data: expenses, loading: l4 } = useExpenses(id);
  const { data: docs, loading: l5 } = useDocuments(id);
  const { data: packing, loading: l6 } = usePackingItems(id);
  const { data: days, loading: l7 } = useTripDays(id);
  const loading = lt || l1 || l2 || l3 || l4 || l5 || l6 || l7;
  const cc = useMemo(() => {
    if (!trip || !tasks || !reservations || !cats || !expenses || !docs || !packing || !days) return null;
    return buildCommandCenter(trip, tasks, reservations, cats, expenses, docs, packing, days);
  }, [trip, tasks, reservations, cats, expenses, docs, packing, days]);
  return { data: cc, loading };
}

export function useBudgetSummary(): { data: BudgetSummary | null; loading: boolean } {
  const { data: trip, loading: lt } = useActiveTrip();
  const id = trip?.id;
  const { data: cats, loading: l1 } = useBudgetCategories(id);
  const { data: exp, loading: l2 } = useExpenses(id);
  const { data: res, loading: l3 } = useReservations(id);
  const b = useMemo(() => {
    if (!trip || !cats || !exp || !res) return null;
    return calculateBudgetSummary(trip, cats, exp, res);
  }, [trip, cats, exp, res]);
  return { data: b, loading: lt || l1 || l2 || l3 };
}

export function useDynamicAlerts(): { data: Alert[]; loading: boolean } {
  const { data: trip, loading: lt } = useActiveTrip();
  const id = trip?.id;
  const { data: tasks, loading: l1 } = useTasks(id);
  const { data: res, loading: l2 } = useReservations(id);
  const { data: docs, loading: l3 } = useDocuments(id);
  const { data: pack, loading: l4 } = usePackingItems(id);
  const { data: days, loading: l5 } = useTripDays(id);
  const { data: budget } = useBudgetSummary();
  const a = useMemo(() => {
    if (!trip || !tasks || !res || !docs || !pack || !days || !budget) return [];
    return generateAlerts(trip, tasks, res, docs, pack, days, budget);
  }, [trip, tasks, res, docs, pack, days, budget]);
  return { data: a, loading: lt || l1 || l2 || l3 || l4 || l5 };
}

// ─── Mutations ───

export function useMutations() {
  const { client, mode } = useSupabase();

  return useMemo(() => ({
    updateTask: async (id: string, u: Partial<Task>) => {
      if (mode === "online" && client) return withSync(mutateTask(client, id, u));
      if (mode === "demo") return demo.updateTask(id, u);
      return null;
    },
    addExpense: async (e: Omit<Expense, "id" | "created_at">) => {
      track(EVENTS.EXPENSE_ADDED, { category: e.category, currency: e.original_currency });
      if (mode === "online" && client) return withSync(insertExpense(client, e));
      if (mode === "demo") return demo.addExpense(e);
      return null;
    },
    deleteExpense: async (id: string) => {
      if (mode === "online" && client) return withSync(removeExpense(client, id));
      if (mode === "demo") return demo.deleteExpense(id);
      return false;
    },
    updateDocument: async (id: string, u: Partial<Document>) => {
      if (mode === "online" && client) return withSync(mutateDocument(client, id, u));
      if (mode === "demo") return demo.updateDocument(id, u);
      return null;
    },
    updatePackingItem: async (id: string, u: Partial<PackingItem>) => {
      if (mode === "online" && client) return withSync(mutatePackingItem(client, id, u));
      if (mode === "demo") return demo.updatePackingItem(id, u);
      return null;
    },
    addPackingItem: async (item: Omit<PackingItem, "id">) => {
      if (mode === "online" && client) return withSync(insertPackingItem(client, item));
      if (mode === "demo") return demo.addPackingItem(item);
      return null;
    },
    updateReservation: async (id: string, u: Partial<Reservation>) => {
      if (mode === "online" && client) return withSync(mutateReservation(client, id, u));
      if (mode === "demo") return demo.updateReservation(id, u);
      return null;
    },
    addReservation: async (r: Omit<Reservation, "id" | "created_at" | "updated_at">) => {
      track(EVENTS.RESERVATION_ADDED, { type: r.type });
      if (mode === "online" && client) return withSync(insertReservation(client, r));
      if (mode === "demo") return demo.addReservation(r);
      return null;
    },
    deleteReservation: async (id: string) => {
      if (mode === "online" && client) return withSync(removeReservation(client, id));
      if (mode === "demo") return demo.deleteReservation(id);
      return false;
    },
    addTrip: async (trip: Omit<Trip, "id" | "user_id" | "created_at" | "updated_at" | "is_active">) => {
      let result: Trip | null = null;
      if (mode === "online" && client) result = await withSync(insertTrip(client, trip));
      else if (mode === "demo") result = demo.addTrip(trip);
      if (result?.destination) prefetchDestinationGuide(result.destination);
      track(EVENTS.TRIP_CREATED, { destination: result?.destination });
      return result;
    },
    activateTrip: async (tripId: string) => {
      const result =
        mode === "online" && client ? await withSync(setActiveTrip(client, tripId)) :
        mode === "demo" ? demo.activateTrip(tripId) : null;
      if (result?.destination) prefetchDestinationGuide(result.destination);
      track(EVENTS.TRIP_OPENED, { trip_id: tripId });
      return result;
    },
    deleteTrip: async (tripId: string) => {
      if (mode === "online" && client) return withSync(removeTrip(client, tripId));
      if (mode === "demo") return demo.deleteTrip(tripId);
      return false;
    },
    /**
     * Upsert de un trip_day. Útil para AI itinerary generator + manual edit.
     * Match en DB por (trip_id, date); reemplaza si existe, crea si no.
     */
    upsertDay: async (row: Omit<TripDay, "id">): Promise<TripDay | null> => {
      if (mode === "online" && client) return withSync(upsertTripDay(client, row));
      if (mode === "demo") return demo.upsertTripDay(row);
      return null;
    },
    /**
     * Patch parcial de un viaje. Solo los campos pasados se actualizan.
     */
    updateTrip: async (
      tripId: string,
      patch: Partial<Omit<Trip, "id" | "user_id" | "created_at" | "is_active">>
    ): Promise<Trip | null> => {
      if (mode === "online" && client) return withSync(patchTrip(client, tripId, patch));
      if (mode === "demo") return demo.updateTripFields(tripId, patch);
      return null;
    },
    /**
     * Guarda el presupuesto por categorías.
     */
    saveBudgetByCategories: async (
      tripId: string,
      rows: Array<{ category: string; label: string; budgeted_amount: number; order_index: number }>
    ): Promise<BudgetCategory[]> => {
      const payload = rows.map(r => ({ trip_id: tripId, ...r }));
      track(EVENTS.BUDGET_EDITED, { categories_count: rows.length });
      if (mode === "online" && client) return withSync(batchUpsertBudgetCategories(client, payload));
      if (mode === "demo") return payload.map(p => demo.upsertBudgetCategoryDemo(p));
      return [];
    },
  }), [client, mode]);
}
