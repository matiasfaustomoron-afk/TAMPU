import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/print-book — solicita un libro físico del viaje al user.
 *
 * Modelo Polarsteps: monetización 100% del print book post-trip. Peecho
 * (print-on-demand global, fulfillment desde Amsterdam) maneja print + ship.
 *
 * Flow:
 *  1. User en /journal → "Hacer libro de este viaje"
 *  2. POST acá con trip_id + opciones (binding, pages, etc)
 *  3. Server arma el PDF del libro desde:
 *     - journal entries (fotos + captions + dates)
 *     - reservations (timeline)
 *     - tripDays (city stretches)
 *  4. Sube el PDF a Peecho API + crea orden
 *  5. Peecho fulfilma y manda
 *  6. User recibe email con tracking
 *
 * Pricing 2026 (anchor de Polarsteps): €36-150 según tier + páginas + tapa.
 * Cobramos via MercadoPago/Stripe — manejo de pago aparte (otro endpoint).
 *
 * Para MVP: este endpoint deja la orden en estado 'draft' en Supabase, NO
 * la dispara a Peecho hasta que confirmemos pago. La integración Peecho
 * real es 2-3 sprints más (requiere API key + cert + testing).
 */

export const runtime = "nodejs";

interface PrintBookRequest {
  trip_id: string;
  binding?: "softcover" | "hardcover" | "lay-flat-premium";
  cover_photo_id?: string;     // attachment.id de la foto de tapa
  title_override?: string;      // si user quiere cambiar el título del libro
}

interface PrintBookOrder {
  trip_id: string;
  binding: string;
  estimated_price_eur: number;
  estimated_pages: number;
  status: "draft";
  cover_photo_id: string | null;
  title: string;
  user_id: string;
  // Snapshot del viaje al momento del request (para que el libro NO cambie
  // si el user después modifica el trip)
  snapshot: unknown;
}

/**
 * Estimación grosera de páginas para el libro:
 *   - 1 página título
 *   - 1 página mapa global del viaje
 *   - 2 páginas por city stretch (intro + grid foto)
 *   - 1 página cada 3 journal entries
 *   - 1 página por reservation importante (vuelos + hoteles)
 *   - 1 página cierre con stats
 */
function estimatePages(snapshot: {
  cities: number;
  journal_entries: number;
  flights: number;
  hotels: number;
}): number {
  const base = 4; // título + mapa + intro + cierre
  const cityPages = snapshot.cities * 2;
  const journalPages = Math.ceil(snapshot.journal_entries / 3);
  const reservationPages = snapshot.flights + Math.ceil(snapshot.hotels / 2);
  const total = base + cityPages + journalPages + reservationPages;
  return Math.max(24, Math.min(120, total));
}

/**
 * Pricing tier basado en pages + binding. Peecho anchor:
 *   - softcover 24p: €36
 *   - hardcover 40p: €55
 *   - lay-flat 50p: €95
 *   - hardcover 80p: €125
 */
function estimatePrice(pages: number, binding: PrintBookRequest["binding"]): number {
  const basePerPage =
    binding === "lay-flat-premium" ? 1.9 :
    binding === "hardcover" ? 1.55 :
    1.10;
  const baseCover =
    binding === "lay-flat-premium" ? 45 :
    binding === "hardcover" ? 25 :
    18;
  const price = baseCover + pages * basePerPage;
  return Math.ceil(price);
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServer();
  if (!sb) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 503 });
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PrintBookRequest;
  try {
    body = (await req.json()) as PrintBookRequest;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!body.trip_id) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  // 1) Cargar trip + relaciones
  const { data: trip, error: tripErr } = await sb
    .from("trips")
    .select("*, cities(*), reservations(*), trip_days(*)")
    .eq("id", body.trip_id)
    .maybeSingle();

  if (tripErr || !trip) {
    return NextResponse.json({ error: "trip-not-found" }, { status: 404 });
  }

  // 2) Contar pieces para estimar páginas
  const t = trip as unknown as {
    id: string;
    name: string;
    destination: string;
    cities?: { name: string }[];
    reservations?: { type: string }[];
    trip_days?: { id: string }[];
  };
  const cities = t.cities?.length ?? 0;
  const flights = (t.reservations || []).filter((r) => r.type === "flight").length;
  const hotels = (t.reservations || []).filter((r) => r.type === "accommodation").length;
  // Journal entries vienen de localStorage del client — no podemos contarlas aquí
  // server-side sin mandarlas en el body. Para MVP asumimos un proxy: 1 entry por trip_day.
  const journalEntries = t.trip_days?.length ?? 0;

  const pages = estimatePages({ cities, journal_entries: journalEntries, flights, hotels });
  const binding = body.binding ?? "hardcover";
  const price = estimatePrice(pages, binding);

  // 3) Crear borrador en Supabase (tabla `print_book_orders`)
  const order: PrintBookOrder = {
    trip_id: body.trip_id,
    binding,
    estimated_price_eur: price,
    estimated_pages: pages,
    status: "draft",
    cover_photo_id: body.cover_photo_id ?? null,
    title: body.title_override ?? t.name,
    user_id: user.id,
    snapshot: {
      destination: t.destination,
      cities,
      flights,
      hotels,
      journal_entries: journalEntries,
      snapshot_at: new Date().toISOString(),
    },
  };

  const { data: created, error: insertErr } = await sb
    .from("print_book_orders")
    .insert(order)
    .select()
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    order: created,
    estimate: {
      pages,
      price_eur: price,
      binding,
    },
    next_step: "El libro está en estado 'draft'. Cuando confirmes el pago, generamos el PDF y lo mandamos a imprimir.",
    fulfillment_partner: "Peecho · Amsterdam · 7-14 días delivery",
  });
}

/**
 * GET /api/print-book?trip_id=XXX — devuelve órdenes existentes para ese trip.
 */
export async function GET(req: NextRequest) {
  const sb = await createSupabaseServer();
  if (!sb) return NextResponse.json({ orders: [] });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tripId = new URL(req.url).searchParams.get("trip_id");
  let query = sb.from("print_book_orders").select("*").eq("user_id", user.id);
  if (tripId) query = query.eq("trip_id", tripId);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [] });
}
