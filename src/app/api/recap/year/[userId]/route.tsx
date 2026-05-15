// ─── GET /api/recap/year/[userId] ─────────────────────────────────────────
//
// Tampu Unpacked YYYY — Spotify-Wrapped style annual recap del user, con
// todos los trips del año en curso. Renderiza un PNG 1200x630 al Edge con
// @vercel/og para preview rico en WhatsApp/Twitter/iMessage al compartir
// el link `/recap/year/[userId]`.
//
// PRIVACY (Iter 5):
//   El endpoint solo genera contenido si el user tiene AL MENOS UN trip con
//   `recap_public = true` (mismo opt-in flag agregado en 00038_recap_public.sql
//   para el recap por-trip). Si todos los trips son privados → 404. Esto evita
//   exponer counts agregados via UUID guessing del user_id sin que el user
//   haya decidido compartir.
//
// Service role bypassa RLS — OK porque solo exponemos metadata agregada
// (counts, top país, mes top) y solo del subset opt-in del año actual.

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";

export const runtime = "edge";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

// UUID v4 (relajado — acepta cualquier versión válida de UUID con guiones).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { userId } = await ctx.params;
  if (!UUID_RE.test(userId)) {
    return new Response("Invalid user id", { status: 400 });
  }

  const supa = createSupabaseService();
  if (!supa) {
    return new Response("Service unavailable", { status: 503 });
  }

  const year = new Date().getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Cargar profile (para nombre) y trips del año del user.
  const [profileRes, tripsRes] = await Promise.all([
    supa
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle(),
    supa
      .from("trips")
      .select("id, name, destination, start_date, end_date, recap_public")
      .eq("user_id", userId)
      // Trip toca el año si start_date <= yearEnd Y end_date >= yearStart.
      .lte("start_date", yearEnd)
      .gte("end_date", yearStart),
  ]);

  const profile = profileRes.data as { full_name?: string | null; email?: string | null } | null;
  const allTrips = (tripsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    destination: string | null;
    start_date: string;
    end_date: string;
    recap_public?: boolean | null;
  }>;

  // Privacy gate — solo agregamos los trips opt-in. Si ninguno está
  // compartido, devolvemos 404 para no leakear counts via UUID guessing.
  const trips = allTrips.filter((t) => t.recap_public === true);
  if (trips.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  // Nombre amigable para el título — full_name → handle del email → "vos".
  const displayName = (() => {
    const fn = profile?.full_name?.trim();
    if (fn) return fn;
    const handle = profile?.email?.split("@")[0]?.trim();
    if (handle) return handle;
    return "vos";
  })();

  // Stats agregados del año.
  const tripsCount = trips.length;
  let totalDaysInYear = 0;
  const monthCounts: Record<number, number> = {};
  const tripIds: string[] = [];

  for (const t of trips) {
    tripIds.push(t.id);
    const tStart = new Date(t.start_date);
    const tEnd = new Date(t.end_date);
    // Recortar a la ventana del año para "días viajando en YYYY".
    const yStart = new Date(`${yearStart}T00:00:00Z`);
    const yEnd = new Date(`${yearEnd}T23:59:59Z`);
    const effStart = tStart < yStart ? yStart : tStart;
    const effEnd = tEnd > yEnd ? yEnd : tEnd;
    const days = Math.max(0, Math.round((effEnd.getTime() - effStart.getTime()) / 86400000));
    totalDaysInYear += days;
    const month = effStart.getUTCMonth();
    monthCounts[month] = (monthCounts[month] ?? 0) + 1;
  }

  // Mes top (más viajes empezados). Si no hay viajes, "—".
  const topMonthIdx = Object.entries(monthCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => Number(m))[0];
  const topMonth = topMonthIdx !== undefined ? MONTH_NAMES[topMonthIdx] : "—";

  // Vuelos + países distintos requieren queries adicionales solo si hay trips.
  let flightsCount = 0;
  let countriesCount = 0;
  let topCountry = "—";

  if (tripIds.length > 0) {
    const [flightsRes, citiesRes] = await Promise.all([
      supa
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .in("trip_id", tripIds)
        .eq("type", "flight"),
      supa
        .from("cities")
        .select("country")
        .in("trip_id", tripIds),
    ]);
    flightsCount = flightsRes.count ?? 0;

    const countrySet = new Set<string>();
    const countryFreq: Record<string, number> = {};
    for (const row of (citiesRes.data ?? []) as Array<{ country?: string | null }>) {
      const c = row.country?.trim();
      if (!c) continue;
      const key = c.toLowerCase();
      countrySet.add(key);
      countryFreq[c] = (countryFreq[c] ?? 0) + 1;
    }
    countriesCount = countrySet.size;
    topCountry =
      Object.entries(countryFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }

  const truncatedName = displayName.length > 22 ? displayName.slice(0, 22) + "..." : displayName;

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
            "linear-gradient(135deg, #2C1408 0%, #6B3018 50%, #B85628 100%)",
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
          TAMPU · UNPACKED {year}
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
          @{truncatedName}
        </div>
        <div style={{ fontSize: 28, opacity: 0.85, marginTop: 10 }}>
          Tu año en viajes
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 40,
            marginTop: 50,
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "Viajes", value: String(tripsCount) },
            { label: "Días viajando", value: String(totalDaysInYear) },
            { label: "Países", value: String(countriesCount) },
            { label: "Vuelos", value: String(flightsCount) },
            { label: "Mes top", value: topMonth },
            { label: "País top", value: topCountry.length > 14 ? topCountry.slice(0, 14) + "…" : topCountry },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ display: "flex", flexDirection: "column", minWidth: 140 }}
            >
              <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 18,
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
        // Cache 24h con SWR de 7d — Annual Recap cambia lento (1 trip/mes a lo
        // sumo), no vale la pena re-renderizar más seguido.
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
