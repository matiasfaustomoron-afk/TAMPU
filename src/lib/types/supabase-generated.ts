// ─────────────────────────────────────────────────────────────────────────
// Tampu — Tipos generados desde Supabase schema.
//
// TODO: regenerar con:
//   npx supabase gen types typescript --project-id cwlujkrfyucrifhintre \
//     > src/lib/types/supabase-generated.ts
//
// Esto requiere `supabase login` + el project linked. Mientras tanto este
// archivo expone un Database type con shape compatible que re-mapea desde
// los tipos manuales en database.ts. Cuando se ejecute el gen real, los
// tipos manuales pueden pasar a fallback comentado.
//
// El objetivo del re-export es que cualquier nuevo código pueda hacer:
//   import type { Database } from "@/lib/types/supabase-generated";
//   type Trip = Database['public']['Tables']['trips']['Row'];
// sin acoplarse a los tipos manuales (que pueden desincronizarse con la DB).
// ─────────────────────────────────────────────────────────────────────────

import type {
  Profile,
  Trip,
  City,
  TripDay,
  Task,
  Reservation,
  BudgetCategory,
  Expense,
  Document,
  PackingItem,
  Alert,
  Attachment,
  Notification,
  DeviceSubscription,
} from "./database";

// Json type used by Supabase for jsonb columns.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableRow<TRow> = {
  Row: TRow;
  Insert: Partial<TRow>;
  Update: Partial<TRow>;
};

export interface Database {
  public: {
    Tables: {
      profiles: TableRow<Profile>;
      trips: TableRow<Trip>;
      cities: TableRow<City>;
      trip_days: TableRow<TripDay>;
      tasks: TableRow<Task>;
      reservations: TableRow<Reservation>;
      budget_categories: TableRow<BudgetCategory>;
      expenses: TableRow<Expense>;
      documents: TableRow<Document>;
      packing_items: TableRow<PackingItem>;
      alerts: TableRow<Alert>;
      attachments: TableRow<Attachment>;
      notifications: TableRow<Notification>;
      device_subscriptions: TableRow<DeviceSubscription>;
    };
    Views: Record<string, never>;
    Functions: {
      create_trip: {
        Args: { trip_data: Json };
        Returns: Trip;
      };
      set_active_trip: {
        Args: { p_trip_id: string };
        Returns: Trip;
      };
    };
    Enums: Record<string, never>;
  };
}
