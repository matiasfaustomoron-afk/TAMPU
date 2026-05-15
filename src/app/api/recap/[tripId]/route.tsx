// ─── GET /api/recap/[tripId] ──────────────────────────────────────────────
//
// Tampu Recap MVP — genera un PNG 1200x630 estilo Spotify Wrapped del viaje,
// renderizado en el Edge con @vercel/og. Es público (sin auth) porque se usa
// como `og:image` en `/recap/[tripId]` para preview en WhatsApp/Twitter/etc.
//
// Service role bypassa RLS — OK porque el recap muestra solo metadata
// agregada (nombre, destino, conteos) que el owner ya decidió compartir
// al copiar el link público.

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
    .select("id, name, destination, start_date, end_date, total_budget, base_currency")
    .eq("id", tripId)
    .maybeSingle();

  if (!trip) return new Response("Not found", { status: 404 });

  const [
    { count: flightsCount },
    { count: documentsCount },
    { count: reservationsCount },
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
  ]);

  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86400000)
  );

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
