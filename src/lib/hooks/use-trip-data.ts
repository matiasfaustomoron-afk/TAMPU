"use client";

import { useMemo } from "react";
import {
  useQuery as useReactQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useHydrated } from "./use-hydrated";

// Online data layer (Supabase)
import { fetchActiveTrip, fetchTrips, insertTrip, setActiveTrip, removeTrip, patchTrip } from "@/lib/data/trips";
import { prefetchDestinationGuide } from "@/lib/wikivoyage-client";
import { track, EVENTS } from "@/lib/analytics";
import { recordSyncSuccess, recordSyncError } from "@/lib/sync/status";

// Wrap a Supabase mutation con sync-status tracking. Records success on resolve,
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
import { fetchAttachments, insertAttachment, deleteAttachment } from "@/lib/data/attachments";

// Demo data layer (localStorage, isolated)
import * as demo from "@/lib/demo/demo-store";

// Domain
import { buildDashboardData } from "@/lib/domain/dashboard";
import { calculateBudgetSummary } from "@/lib/domain/forecast";
import { generateAlerts } from "@/lib/domain/alert-engine";
import { buildCommandCenter, type CommandCenterData } from "@/lib/domain/command-center";

import type {
  Trip, Task, Expense, Reservation, BudgetCategory,
  Document, PackingItem, TripDay, City, Attachment,
  DashboardData, BudgetSummary, Alert,
} from "@/lib/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Query keys registry ────────────────────────────────────────────────
//
// Centralizado en un objeto factory para que las invalidaciones sean
// type-safe y consistentes. Cada key empieza con el mode ('online'|'demo')
// para evitar leak entre modos cuando un user cambia.

const qk = {
  trips: (mode: string) => ["trips", mode] as const,
  activeTrip: (mode: string) => ["activeTrip", mode] as const,
  tasks: (mode: string, tripId: string | undefined) => ["tasks", mode, tripId ?? null] as const,
  expenses: (mode: string, tripId: string | undefined) => ["expenses", mode, tripId ?? null] as const,
  reservations: (mode: string, tripId: string | undefined) => ["reservations", mode, tripId ?? null] as const,
  budgetCategories: (mode: string, tripId: string | undefined) => ["budgetCategories", mode, tripId ?? null] as const,
  documents: (mode: string, tripId: string | undefined) => ["documents", mode, tripId ?? null] as const,
  packingItems: (mode: string, tripId: string | undefined) => ["packingItems", mode, tripId ?? null] as const,
  tripDays: (mode: string, tripId: string | undefined) => ["tripDays", mode, tripId ?? null] as const,
  cities: (mode: string, tripId: string | undefined) => ["cities", mode, tripId ?? null] as const,
  attachments: (mode: string, tripId: string | undefined) => ["attachments", mode, tripId ?? null] as const,
} as const;

// ─── Demo store helpers: attachments live in localStorage (`travel-os-vault-<tripId>`) ────
//
// El demo path no usa `demo-store.ts` (que no expone APIs de attachments). En
// modo demo, vault/boarding-passes serializan attachments en localStorage. Acá
// replicamos esa lectura para que el hook tenga UNA fuente de verdad consistente.
function readDemoAttachments(tripId: string): Attachment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`travel-os-vault-${tripId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Soporta tanto v1 wrapper `{ v, data }` como v0 array directo.
    if (Array.isArray(parsed)) return parsed as Attachment[];
    if (parsed && Array.isArray(parsed.data)) return parsed.data as Attachment[];
    return [];
  } catch {
    return [];
  }
}

// ─── Generic async hook ─────────────────────────────────────────────────
//
// Wrapper sobre TanStack `useQuery` que conserva el shape público histórico:
//   { data: T | null, loading: boolean, refetch: () => void }
// para no romper los ~30 callers que ya consumen los entity hooks.

interface QueryShape<T> {
  data: T | null;
  loading: boolean;
  refetch: () => void;
}

// TODO: split into useQueryList<T[]> + useQueryOne<T>
// Currently this wrapper collapses arrays into `T | null`, which forces callers
// to handle null on what are effectively always [] for list queries. Splitting
// preserves the empty-array invariant for lists and keeps `T | null` for the
// single-entity queries (activeTrip), but requires touching ~10 caller hooks.
function useQuery<T>(
  key: readonly unknown[],
  fn: () => Promise<T>,
  enabled: boolean,
  fallback: T | null = null,
): QueryShape<T> {
  const q = useReactQuery<T>({
    queryKey: key as unknown[],
    queryFn: fn,
    enabled,
  });
  // Mapear el shape de TanStack al shape histórico de la app:
  //   - loading: isLoading SOLO cuando enabled y todavía sin data. Si enabled=false
  //     (SSR no hidrate, no tripId, modo unconfigured) loading=false para no
  //     trabar UI eternamente.
  return {
    data: (q.data ?? fallback) as T | null,
    loading: enabled && q.isLoading,
    refetch: () => { void q.refetch(); },
  };
}

// ─── Entity hooks ───────────────────────────────────────────────────────

export function useActiveTrip() {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && (mode === "online" ? !!client : true);
  return useQuery<Trip | null>(
    qk.activeTrip(mode),
    () => {
      if (mode === "online" && client) return fetchActiveTrip(client);
      if (mode === "demo") return Promise.resolve(demo.getActiveTrip());
      return Promise.resolve(null);
    },
    enabled,
  );
}

export function useAllTrips() {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && (mode === "online" ? !!client : true);
  return useQuery<Trip[]>(
    qk.trips(mode),
    () => {
      if (mode === "online" && client) return fetchTrips(client);
      if (mode === "demo") return Promise.resolve(demo.getTrips());
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useTasks(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<Task[]>(
    qk.tasks(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchTasks(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getTasks(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useExpenses(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<Expense[]>(
    qk.expenses(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchExpenses(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getExpenses(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useReservations(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<Reservation[]>(
    qk.reservations(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchReservations(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getReservations(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useBudgetCategories(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<BudgetCategory[]>(
    qk.budgetCategories(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchBudgetCategories(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getBudgetCategories(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useDocuments(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<Document[]>(
    qk.documents(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchDocuments(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getDocuments(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function usePackingItems(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<PackingItem[]>(
    qk.packingItems(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchPackingItems(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getPackingItems(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useTripDays(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<TripDay[]>(
    qk.tripDays(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchTripDays(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getTripDays(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useCities(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<City[]>(
    qk.cities(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchCities(client, tripId);
      if (mode === "demo") return Promise.resolve(demo.getCities(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

export function useAttachments(tripId: string | undefined) {
  const { client, mode } = useSupabase();
  const h = useHydrated();
  const enabled = h && !!tripId && (mode === "online" ? !!client : true);
  return useQuery<Attachment[]>(
    qk.attachments(mode, tripId),
    () => {
      if (!tripId) return Promise.resolve([]);
      if (mode === "online" && client) return fetchAttachments(client, tripId);
      if (mode === "demo") return Promise.resolve(readDemoAttachments(tripId));
      return Promise.resolve([]);
    },
    enabled,
    [],
  );
}

// ─── Composite hooks ────────────────────────────────────────────────────
//
// `useTripFullDataset` consolida la fetch logic compartida entre dashboard
// y command center. Ambos hooks consumen el mismo set de entities, solo
// difieren en cómo lo derivan después (buildDashboardData vs buildCommandCenter).
// Antes había dos hooks idénticos hasta los queries.

interface TripFullDataset {
  trip: Trip | null;
  tasks: Task[] | null;
  reservations: Reservation[] | null;
  cats: BudgetCategory[] | null;
  expenses: Expense[] | null;
  docs: Document[] | null;
  packing: PackingItem[] | null;
  days: TripDay[] | null;
  loading: boolean;
  /** True cuando todos los entities están resueltos (no-null). Usar como guard antes de derivar. */
  ready: boolean;
}

export function useTripFullDataset(): TripFullDataset {
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
  const ready = !!trip && !!tasks && !!reservations && !!cats && !!expenses && !!docs && !!packing && !!days;
  return { trip, tasks, reservations, cats, expenses, docs, packing, days, loading, ready };
}

export function useDashboard(): { data: DashboardData | null; loading: boolean } {
  const ds = useTripFullDataset();
  const dash = useMemo(() => {
    if (!ds.ready) return null;
    return buildDashboardData(ds.trip!, ds.tasks!, ds.reservations!, ds.cats!, ds.expenses!, ds.docs!, ds.packing!, [], ds.days!);
  }, [ds.ready, ds.trip, ds.tasks, ds.reservations, ds.cats, ds.expenses, ds.docs, ds.packing, ds.days]);
  return { data: dash, loading: ds.loading };
}

export function useCommandCenter(): { data: CommandCenterData | null; loading: boolean } {
  const ds = useTripFullDataset();
  const cc = useMemo(() => {
    if (!ds.ready) return null;
    return buildCommandCenter(ds.trip!, ds.tasks!, ds.reservations!, ds.cats!, ds.expenses!, ds.docs!, ds.packing!, ds.days!);
  }, [ds.ready, ds.trip, ds.tasks, ds.reservations, ds.cats, ds.expenses, ds.docs, ds.packing, ds.days]);
  return { data: cc, loading: ds.loading };
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

// ─── Mutations ──────────────────────────────────────────────────────────
//
// Cada mutation usa `useMutation` + `onSuccess: invalidateQueries` para que
// el cache se mantenga sincronizado automáticamente. La api pública del hook
// se mantiene (cada método sigue siendo `async (args) => result`) para que
// los callers (~20 componentes) no se rompan.

/** Invalida todas las queries del trip-id dado (atom-level invalidation). */
function invalidateTrip(qc: QueryClient, mode: string, tripId: string | undefined) {
  if (!tripId) return;
  qc.invalidateQueries({ queryKey: ["tasks", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["expenses", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["reservations", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["budgetCategories", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["documents", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["packingItems", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["tripDays", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["cities", mode, tripId] });
  qc.invalidateQueries({ queryKey: ["attachments", mode, tripId] });
}

function invalidateAllTrips(qc: QueryClient, mode: string) {
  qc.invalidateQueries({ queryKey: ["trips", mode] });
  qc.invalidateQueries({ queryKey: ["activeTrip", mode] });
}

export function useMutations() {
  const { client, mode } = useSupabase();
  const qc = useQueryClient();

  // Helper para entity-level mutations (task, expense, reservation, etc).
  // mode='online' usa client; 'demo' usa demo store. Después de cualquier
  // mutación, invalida la query key correspondiente.
  const mTask = useMutation({
    mutationFn: async (args: { id: string; updates: Partial<Task> }) => {
      if (mode === "online" && client) return withSync(mutateTask(client, args.id, args.updates));
      if (mode === "demo") return demo.updateTask(args.id, args.updates);
      return null;
    },
    onSuccess: (data) => {
      const tripId = data?.trip_id;
      qc.invalidateQueries({ queryKey: ["tasks", mode, tripId ?? null] });
    },
  });

  const mAddExpense = useMutation({
    mutationFn: async (e: Omit<Expense, "id" | "created_at">) => {
      track(EVENTS.EXPENSE_ADDED, { category: e.category, currency: e.original_currency });
      if (mode === "online" && client) return withSync(insertExpense(client, e));
      if (mode === "demo") return demo.addExpense(e);
      return null;
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses", mode, vars.trip_id] });
      qc.invalidateQueries({ queryKey: ["budgetCategories", mode, vars.trip_id] });
    },
  });

  const mDeleteExpense = useMutation({
    mutationFn: async (id: string) => {
      if (mode === "online" && client) return withSync(removeExpense(client, id));
      if (mode === "demo") return demo.deleteExpense(id);
      return false;
    },
    // No sabemos trip_id desde el id solo → invalidate todas las expenses queries del mode
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", mode] });
      qc.invalidateQueries({ queryKey: ["budgetCategories", mode] });
    },
  });

  const mDocument = useMutation({
    mutationFn: async (args: { id: string; updates: Partial<Document> }) => {
      if (mode === "online" && client) return withSync(mutateDocument(client, args.id, args.updates));
      if (mode === "demo") return demo.updateDocument(args.id, args.updates);
      return null;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["documents", mode, data?.trip_id ?? null] });
    },
  });

  const mPackingItem = useMutation({
    mutationFn: async (args: { id: string; updates: Partial<PackingItem> }) => {
      if (mode === "online" && client) return withSync(mutatePackingItem(client, args.id, args.updates));
      if (mode === "demo") return demo.updatePackingItem(args.id, args.updates);
      return null;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["packingItems", mode, data?.trip_id ?? null] });
    },
  });

  const mAddPackingItem = useMutation({
    mutationFn: async (item: Omit<PackingItem, "id">) => {
      if (mode === "online" && client) return withSync(insertPackingItem(client, item));
      if (mode === "demo") return demo.addPackingItem(item);
      return null;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["packingItems", mode, vars.trip_id] });
    },
  });

  const mReservation = useMutation({
    mutationFn: async (args: { id: string; updates: Partial<Reservation> }) => {
      if (mode === "online" && client) return withSync(mutateReservation(client, args.id, args.updates));
      if (mode === "demo") return demo.updateReservation(args.id, args.updates);
      return null;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["reservations", mode, data?.trip_id ?? null] });
    },
  });

  const mAddReservation = useMutation({
    mutationFn: async (r: Omit<Reservation, "id" | "created_at" | "updated_at">) => {
      track(EVENTS.RESERVATION_ADDED, { type: r.type });
      if (mode === "online" && client) return withSync(insertReservation(client, r));
      if (mode === "demo") return demo.addReservation(r);
      return null;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["reservations", mode, vars.trip_id] });
    },
  });

  const mDeleteReservation = useMutation({
    mutationFn: async (id: string) => {
      if (mode === "online" && client) return withSync(removeReservation(client, id));
      if (mode === "demo") return demo.deleteReservation(id);
      return false;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations", mode] });
    },
  });

  // ─── Attachments ───
  // Demo mode escribe a localStorage directamente desde los call sites (vault page);
  // las mutations online pasan por el data layer. Después de cualquier mutación,
  // invalidamos ['attachments', tripId] para refrescar listas en vault + boarding
  // passes simultáneamente.
  const mAddAttachment = useMutation({
    mutationFn: async (a: Omit<Attachment, "id" | "created_at" | "updated_at">) => {
      if (mode === "online" && client) return withSync(insertAttachment(client, a));
      return null;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["attachments", mode, vars.trip_id] });
      // TODO: si en el futuro las reservations renderizan derivadamente
      // attachments (e.g. boarding-passes inline en la lista), invalidar
      // también ["reservations", mode, vars.trip_id] acá. Hoy los call
      // sites (vault, boarding-passes) consumen `useAttachments` directo,
      // así que no hay derivación cruzada que invalidar.
    },
  });

  const mDeleteAttachment = useMutation({
    mutationFn: async (id: string) => {
      if (mode === "online" && client) return withSync(deleteAttachment(client, id));
      return false;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", mode] });
    },
  });

  const mAddTrip = useMutation({
    mutationFn: async (trip: Omit<Trip, "id" | "user_id" | "created_at" | "updated_at" | "is_active">) => {
      let result: Trip | null = null;
      if (mode === "online" && client) result = await withSync(insertTrip(client, trip));
      else if (mode === "demo") result = demo.addTrip(trip);
      if (result?.destination) prefetchDestinationGuide(result.destination);
      track(EVENTS.TRIP_CREATED, { destination: result?.destination });
      return result;
    },
    onSuccess: () => {
      invalidateAllTrips(qc, mode);
    },
  });

  const mActivateTrip = useMutation({
    mutationFn: async (tripId: string) => {
      const result =
        mode === "online" && client ? await withSync(setActiveTrip(client as SupabaseClient, tripId)) :
        mode === "demo" ? demo.activateTrip(tripId) : null;
      if (result?.destination) prefetchDestinationGuide(result.destination);
      track(EVENTS.TRIP_OPENED, { trip_id: tripId });
      return result;
    },
    onSuccess: () => {
      invalidateAllTrips(qc, mode);
      // Activar un trip impacta el dataset del trip activo. invalidateAllTrips
      // ya invalida ["trips", mode] y ["activeTrip", mode]; este invalidate
      // explícito scope-by-mode evita leak entre demo/online si en algún
      // momento se separan los stores. Las antiguas keys ["commandCenter"] /
      // ["dashboard"] eran dead — esos datasets son derivados (useMemo sobre
      // useTripFullDataset), no queries cacheadas, así que invalidarlas era
      // no-op silencioso.
      qc.invalidateQueries({ queryKey: ["activeTrip", mode] });
    },
  });

  const mDeleteTrip = useMutation({
    mutationFn: async (tripId: string) => {
      if (mode === "online" && client) return withSync(removeTrip(client, tripId));
      if (mode === "demo") return demo.deleteTrip(tripId);
      return false;
    },
    onSuccess: (_d, tripId) => {
      invalidateAllTrips(qc, mode);
      invalidateTrip(qc, mode, tripId);
    },
  });

  const mUpsertDay = useMutation({
    mutationFn: async (row: Omit<TripDay, "id">): Promise<TripDay | null> => {
      if (mode === "online" && client) return withSync(upsertTripDay(client, row));
      if (mode === "demo") return demo.upsertTripDay(row);
      return null;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tripDays", mode, vars.trip_id] });
    },
  });

  const mUpdateTrip = useMutation({
    mutationFn: async (args: {
      tripId: string;
      patch: Partial<Omit<Trip, "id" | "user_id" | "created_at" | "is_active">>;
    }): Promise<Trip | null> => {
      if (mode === "online" && client) return withSync(patchTrip(client, args.tripId, args.patch));
      if (mode === "demo") return demo.updateTripFields(args.tripId, args.patch);
      return null;
    },
    onSuccess: () => {
      invalidateAllTrips(qc, mode);
    },
  });

  const mSaveBudget = useMutation({
    mutationFn: async (args: {
      tripId: string;
      rows: Array<{ category: string; label: string; budgeted_amount: number; order_index: number }>;
    }): Promise<BudgetCategory[]> => {
      const payload = args.rows.map((r) => ({ trip_id: args.tripId, ...r }));
      track(EVENTS.BUDGET_EDITED, { categories_count: args.rows.length });
      if (mode === "online" && client) return withSync(batchUpsertBudgetCategories(client, payload));
      if (mode === "demo") return payload.map((p) => demo.upsertBudgetCategoryDemo(p));
      return [];
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["budgetCategories", mode, vars.tripId] });
    },
  });

  // Public API — preserva las firmas históricas exactas para no romper callers.
  // Cada wrapper retorna una Promise<T> (no la mutation entera). Errores siguen
  // bubbling up via throw para que UIs muestren toast.
  return useMemo(
    () => ({
      updateTask: (id: string, u: Partial<Task>) => mTask.mutateAsync({ id, updates: u }),
      addExpense: (e: Omit<Expense, "id" | "created_at">) => mAddExpense.mutateAsync(e),
      deleteExpense: (id: string) => mDeleteExpense.mutateAsync(id),
      updateDocument: (id: string, u: Partial<Document>) => mDocument.mutateAsync({ id, updates: u }),
      updatePackingItem: (id: string, u: Partial<PackingItem>) => mPackingItem.mutateAsync({ id, updates: u }),
      addPackingItem: (item: Omit<PackingItem, "id">) => mAddPackingItem.mutateAsync(item),
      updateReservation: (id: string, u: Partial<Reservation>) => mReservation.mutateAsync({ id, updates: u }),
      addReservation: (r: Omit<Reservation, "id" | "created_at" | "updated_at">) => mAddReservation.mutateAsync(r),
      deleteReservation: (id: string) => mDeleteReservation.mutateAsync(id),
      addTrip: (trip: Omit<Trip, "id" | "user_id" | "created_at" | "updated_at" | "is_active">) =>
        mAddTrip.mutateAsync(trip),
      activateTrip: (tripId: string) => mActivateTrip.mutateAsync(tripId),
      deleteTrip: (tripId: string) => mDeleteTrip.mutateAsync(tripId),
      upsertDay: (row: Omit<TripDay, "id">) => mUpsertDay.mutateAsync(row),
      updateTrip: (
        tripId: string,
        patch: Partial<Omit<Trip, "id" | "user_id" | "created_at" | "is_active">>,
      ) => mUpdateTrip.mutateAsync({ tripId, patch }),
      saveBudgetByCategories: (
        tripId: string,
        rows: Array<{ category: string; label: string; budgeted_amount: number; order_index: number }>,
      ) => mSaveBudget.mutateAsync({ tripId, rows }),
      addAttachment: (a: Omit<Attachment, "id" | "created_at" | "updated_at">) =>
        mAddAttachment.mutateAsync(a),
      deleteAttachment: (id: string) => mDeleteAttachment.mutateAsync(id),
    }),
    // Las mutations son ref-stable durante el lifecycle del hook (useMutation
    // hooks devuelven la misma fn ref entre renders); este memo + las refs
    // estables previene re-renders innecesarios en callers que pasan estos
    // métodos como deps de effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, mode],
  );
}
