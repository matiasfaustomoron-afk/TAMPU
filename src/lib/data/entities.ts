import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense, Reservation, BudgetCategory, Document, PackingItem, TripDay, Alert, City } from "@/lib/types/database";

// ─── CITIES ───
export async function fetchCities(db: SupabaseClient, tripId: string): Promise<City[]> {
  const { data, error } = await db.from("cities").select("*").eq("trip_id", tripId).order("order_index");
  if (error) throw error;
  return data ?? [];
}

// ─── EXPENSES ───
// Columnas explícitas en list view. attachment_url y notes pueden ser largos:
// los traemos igual porque list view los necesita (preview + tooltip), pero
// dejamos la lista clara para fácil pruning futuro.
const EXPENSE_LIST_COLUMNS =
  "id, trip_id, date, city_id, city_name, category, subcategory, description, payment_method, original_currency, original_amount, exchange_rate, base_amount, is_fixed, is_budgeted, reservation_id, attachment_url, notes, created_at";

export async function fetchExpenses(db: SupabaseClient, tripId: string): Promise<Expense[]> {
  const { data, error } = await db.from("expenses").select(EXPENSE_LIST_COLUMNS).eq("trip_id", tripId).order("date", { ascending: false });
  if (error) throw error;
  return (data as Expense[] | null) ?? [];
}
export async function insertExpense(db: SupabaseClient, expense: Omit<Expense, "id" | "created_at">): Promise<Expense | null> {
  const { data, error } = await db.from("expenses").insert(expense).select().maybeSingle();
  if (error) throw error;
  return data;
}
export async function removeExpense(db: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await db.from("expenses").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// ─── RESERVATIONS ───
// Columnas explícitas en list view.
const RESERVATION_LIST_COLUMNS =
  "id, trip_id, type, criticality, provider, city_id, city_name, description, purchase_date, use_date, use_end_date, payment_deadline, original_amount, original_currency, exchange_rate, base_amount, status, confirmation_received, locator, link, contact, cancellation_policy, is_cancellable, notes, created_at, updated_at";

export async function fetchReservations(db: SupabaseClient, tripId: string): Promise<Reservation[]> {
  const { data, error } = await db.from("reservations").select(RESERVATION_LIST_COLUMNS).eq("trip_id", tripId).order("use_date");
  if (error) throw error;
  return (data as Reservation[] | null) ?? [];
}
export async function mutateReservation(db: SupabaseClient, id: string, updates: Partial<Reservation>): Promise<Reservation | null> {
  const { data, error } = await db.from("reservations").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}
export async function insertReservation(db: SupabaseClient, reservation: Omit<Reservation, "id" | "created_at" | "updated_at">): Promise<Reservation | null> {
  const { data, error } = await db.from("reservations").insert(reservation).select().maybeSingle();
  if (error) throw error;
  return data;
}
export async function removeReservation(db: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await db.from("reservations").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// ─── BUDGET ───
export async function fetchBudgetCategories(db: SupabaseClient, tripId: string): Promise<BudgetCategory[]> {
  const { data, error } = await db.from("budget_categories").select("*").eq("trip_id", tripId).order("order_index");
  if (error) throw error;
  return data ?? [];
}

export async function batchUpsertBudgetCategories(
  db: SupabaseClient,
  rows: Array<{ trip_id: string; category: string; label: string; budgeted_amount: number; order_index: number }>
): Promise<BudgetCategory[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db
    .from("budget_categories")
    .upsert(rows, { onConflict: "trip_id,category" })
    .select();
  if (error) throw error;
  return data ?? [];
}

// ─── DOCUMENTS ───
export async function fetchDocuments(db: SupabaseClient, tripId: string): Promise<Document[]> {
  // Order by created_at DESC: documents recientes primero (mejor UX cuando el
  // user acaba de subir un boarding pass o seguro).
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function mutateDocument(db: SupabaseClient, id: string, updates: Partial<Document>): Promise<Document | null> {
  const { data, error } = await db.from("documents").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}

// ─── PACKING ───
export async function fetchPackingItems(db: SupabaseClient, tripId: string): Promise<PackingItem[]> {
  const { data, error } = await db.from("packing_items").select("*").eq("trip_id", tripId);
  if (error) throw error;
  return data ?? [];
}
export async function mutatePackingItem(db: SupabaseClient, id: string, updates: Partial<PackingItem>): Promise<PackingItem | null> {
  const { data, error } = await db.from("packing_items").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}
export async function insertPackingItem(db: SupabaseClient, item: Omit<PackingItem, "id">): Promise<PackingItem | null> {
  const { data, error } = await db.from("packing_items").insert(item).select().maybeSingle();
  if (error) throw error;
  return data;
}

// ─── TRIP DAYS ───
export async function fetchTripDays(db: SupabaseClient, tripId: string): Promise<TripDay[]> {
  const { data, error } = await db.from("trip_days").select("*").eq("trip_id", tripId).order("day_number");
  if (error) throw error;
  return data ?? [];
}

/**
 * Upsert de un trip_day. Si ya existe uno para (trip_id, date), lo actualiza;
 * si no, lo crea. Usado por la AI itinerary generator y por imports masivos.
 *
 * Postgres unique constraint sugerido: `unique(trip_id, date)`. Si no existe,
 * caemos a "select then insert/update" para evitar duplicados.
 */
export async function upsertTripDay(
  db: SupabaseClient,
  row: Omit<TripDay, "id">
): Promise<TripDay | null> {
  // Buscamos existente por (trip_id, date)
  const { data: existing } = await db
    .from("trip_days")
    .select("id")
    .eq("trip_id", row.trip_id)
    .eq("date", row.date)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await db
      .from("trip_days")
      .update(row)
      .eq("id", existing.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("trip_days").insert(row).select().maybeSingle();
  if (error) throw error;
  return data;
}

// ─── ALERTS ───
export async function fetchAlerts(db: SupabaseClient, tripId: string): Promise<Alert[]> {
  const { data, error } = await db.from("alerts").select("*").eq("trip_id", tripId).eq("status", "active");
  if (error) throw error;
  return data ?? [];
}
