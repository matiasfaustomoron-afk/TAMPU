// ─── GET /api/recap/[tripId] ──────────────────────────────────────────────
//
// Tampu Recap MVP — genera un PNG 1200x630 estilo Spotify Wrapped del viaje,
// renderizado en el Edge con @vercel/og. Se sirve como `og:image` en
// `/recap/[tripId]` para preview en WhatsApp/Twitter/etc.
//
// PERMISSION (Iter 5):
//   Antes era público sin filtro: cualquier UUID guessable exponía nombre,
//   destino, fechas y counts via service_role bypassing RLS. Ahora el owner
//   tiene que activar `trips.recap_public = true` explícitamente (default
//   false — privacy by default). Si está en false → 404. Esto preserva la
//   ergonomía de servir el PNG sin auth (necesario para `og:image`) pero
//   solo cuando el owner decidió compartir.
//
// TODO Iter 6+: signed token alternative al `recap_public` flag — permitiría
// "compartí este link hasta el 1ro de junio" sin togglear un flag persistente.

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";

export const runtime = "edge";

interface RouteContext {
  params: Promise<{ tripId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { tripId } = await ctx.params;
  const supa = createSupabaseService();
  if (!supa) {
    return new Response("Service unavailable", { status: 503 });
  }

  const { data: trip } = await supa
    .from("trips")
    .select("id, name, destination, start_date, end_date, total_budget, base_currency, recap_public")
    .eq("id", tripId)
    .maybeSingle();

  if (!trip) return new Response("Not found", { status: 404 });

  // Permission check — el recap solo es visible si el owner hizo opt-in
  // explícito. Devolvemos 404 (no 403) para no confirmar la existencia del
  // trip a alguien que adivinó el UUID.
  // TODO Iter 6+: signed token alternative to recap_public flag.
  if ((trip as { recap_public?: boolean }).recap_public !== true) {
    return new Response("Not found", { status: 404 });
  }

  const [
    { count: flightsCount },
    { count: documentsCount },
    { count: reservationsCount },
    { data: cityRows },
  ] = await Promise.all([
    supa
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .eq("type", "flight"),
    supa
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", tripId),
    supa
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .eq("status", "confirmed"),
    // Cities visited — usamos esta tabla para derivar países distintos.
    // No tenemos lat/lng en `cities` ni en `reservations` (ver migrations
    // 00004 y 00005), así que `total_distance_km` queda como TODO para
    // cuando agreguemos geocoding al schema.
    supa
      .from("cities")
      .select("country")
      .eq("trip_id", tripId),
  ]);

  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86400000)
  );

  // Countries distintos a partir de cities.country (case-insensitive trim).
  // Si no hay cities seedeadas, fallback a 1 (el destino del trip cuenta como uno).
  const countriesSet = new Set<string>();
  for (const row of cityRows ?? []) {
    const c = (row as { country?: string | null }).country;
    if (c && c.trim()) countriesSet.add(c.trim().toLowerCase());
  }
  const countriesCount = countriesSet.size > 0 ? countriesSet.size : 1;

  // TODO: journal_entries vive en localStorage del cliente — sin tabla server-side
  // no podemos contar. Cuando exista `journal_entries` table, agregar count acá.
  // TODO: total_distance_km — requiere lat/lng en cities o reservations. Skip por ahora.

  const tripName = trip.name ?? "";
  const tripDestination = trip.destination ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          padding: "60px",
          background:
            "linear-gradient(135deg, #B85628 0%, #6B3018 60%, #2C1408 100%)",
          color: "#FBE9D0",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          TAMPU · MI VIAJE
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            lineHeight: 1.05,
            marginTop: 20,
            maxWidth: "1080px",
          }}
        >
          {tripName.length > 40 ? tripName.slice(0, 40) + "..." : tripName}
        </div>
        <div style={{ fontSize: 32, opacity: 0.85, marginTop: 10 }}>
          {tripDestination.length > 50
            ? tripDestination.slice(0, 50) + "..."
            : tripDestination}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 40,
            marginTop: 60,
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "Días", value: String(days) },
            { label: "Países", value: String(countriesCount) },
            { label: "Vuelos", value: String(flightsCount ?? 0) },
            { label: "Documentos", value: String(documentsCount ?? 0) },
            { label: "Reservas", value: String(reservationsCount ?? 0) },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ display: "flex", flexDirection: "column" }}
            >
              <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 20,
                  opacity: 0.7,
                  marginTop: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 60,
            fontSize: 22,
            opacity: 0.6,
            letterSpacing: "0.16em",
          }}
        >
          tampu.app
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
