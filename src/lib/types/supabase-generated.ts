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
  Relationships: [];
};

// ─── Stubs for tables sin tipo manual en database.ts ─────────────────────
// Derivados de las migraciones 15, 16, 18, 19, 20, 21, 22, 24, 25, 32, 36.
// Estos son tipos MÍNIMOS para que `Database['public']['Tables']['<x>']['Row']`
// resuelva sin error. Cuando se regenere con `supabase gen types`, estos
// stubs quedan obsoletos.

interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: "owner" | "editor" | "viewer";
  status: "pending" | "active" | "revoked";
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string | null;
}

interface EmailInboxRow {
  id: string;
  recipient_email: string;
  source: string;
  sender: string | null;
  sender_name: string | null;
  subject: string | null;
  carrier_hint: string | null;
  languages: string[] | null;
  parsed_payload: Json;
  bookings_count: number;
  status: "pending" | "committed" | "dismissed";
  committed_to_trip_id: string | null;
  committed_at: string | null;
  created_at: string | null;
}

interface EmailInEntryRow {
  id: string;
  trip_id: string;
  user_id: string;
  short_id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  provider: string;
  status: "pending" | "parsed" | "failed" | "committed" | "dismissed";
  bookings_count: number;
  carrier_hint: string | null;
  languages: string[] | null;
  parsed_bookings: Json;
  error_message: string | null;
  committed_reservation_ids: string[] | null;
  committed_at: string | null;
  created_at: string | null;
}

interface PollRow {
  id: string;
  trip_id: string;
  created_by: string;
  question: string;
  options: Json;
  votes: Json;
  voter_names: Json;
  deadline: string | null;
  closed_at: string | null;
  created_at: string;
}

interface WhatsappLinkRow {
  id: string;
  user_id: string;
  phone_e164: string;
  verified_at: string | null;
  verification_code: string | null;
  verification_expires_at: string | null;
  failed_attempts: number;
  created_at: string;
}

interface WhatsappMessageRow {
  id: string;
  user_id: string;
  twilio_message_sid: string;
  direction: "inbound" | "outbound";
  phone_e164: string;
  body: string | null;
  media_count: number;
  media_types: string[] | null;
  status: string;
  trip_id: string | null;
  parsed_json: Json | null;
  parser_provider: string | null;
  parser_model: string | null;
  cost_usd: number | null;
  error_message: string | null;
  metadata: Json | null;
  received_at: string;
  parsed_at: string | null;
}

interface AiProxyUsageRow {
  id: string;
  user_id: string | null;
  device_fingerprint: string;
  endpoint: string;
  provider: string;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  status: string;
  error_message: string | null;
  metadata: Json | null;
  created_at: string;
}

interface CuratedDestinationRow {
  slug: string;
  name: string;
  country: string;
  region: string | null;
  category: string;
  premium_level: string;
  blurb: string;
  long_description: string | null;
  best_season: string[] | null;
  duration_suggested: string | null;
  vibe_tags: string[] | null;
  spots: Json | null;
  arrival_options: string[] | null;
  typical_cost_usd_per_day: number | null;
  partner_hotels: string[] | null;
  partner_activities: string[] | null;
  last_visited_at: string | null;
  author_notes: string | null;
  photo_credit: string | null;
  hero_photo_url: string | null;
  view_count: number | null;
  added_to_trips_count: number | null;
}

interface DestinationPhotoRow {
  slug: string;
  locale: string;
  tier: string;
  photo_url: string | null;
  photo_width: number | null;
  photo_height: number | null;
  attribution: string | null;
  source_page_url: string | null;
  caption: string | null;
  description: string | null;
  fetched_at: string | null;
}

interface PrintBookOrderRow {
  id: string;
  trip_id: string;
  user_id: string;
  binding: string;
  title: string;
  cover_photo_id: string | null;
  estimated_price_eur: number;
  estimated_pages: number;
  final_price_eur: number | null;
  currency: string | null;
  status: string;
  peecho_order_id: string | null;
  pdf_url: string | null;
  tracking_number: string | null;
  shipping_address: Json | null;
  snapshot: Json;
}

interface JournalLikeRow {
  id: string;
  journal_entry_id: string;
  trip_id: string;
  user_id: string;
  created_at: string | null;
}

interface JournalCommentRow {
  id: string;
  journal_entry_id: string;
  trip_id: string;
  user_id: string;
  body: string;
  created_at: string | null;
}

interface AlertDismissalRow {
  id: string;
  user_id: string;
  trip_id: string;
  alert_signature: string;
  dismissed_at: string | null;
}

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
      // Stubs (ver bloque arriba): tipos mínimos hasta que se regenere
      // con `supabase gen types typescript`.
      trip_members: TableRow<TripMemberRow>;
      email_inbox: TableRow<EmailInboxRow>;
      email_in_entries: TableRow<EmailInEntryRow>;
      polls: TableRow<PollRow>;
      whatsapp_links: TableRow<WhatsappLinkRow>;
      whatsapp_messages: TableRow<WhatsappMessageRow>;
      ai_proxy_usage: TableRow<AiProxyUsageRow>;
      curated_destinations: TableRow<CuratedDestinationRow>;
      destination_photos: TableRow<DestinationPhotoRow>;
      print_book_orders: TableRow<PrintBookOrderRow>;
      journal_likes: TableRow<JournalLikeRow>;
      journal_comments: TableRow<JournalCommentRow>;
      alert_dismissals: TableRow<AlertDismissalRow>;
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
