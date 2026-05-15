"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader, EmptyState, Semaphore } from "@/components/shared";
import { useActiveTrip, useCities, useReservations, useTripDays } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { plural } from "@/lib/i18n/plural";
import { findCoordinates } from "@/lib/config/city-coordinates";
import { getPOIsForCities, POI_CATEGORY_LABELS } from "@/lib/config/pois";
import { readTrackPoints, type GeoPoint } from "@/lib/native/platform";
import { MapPin, Plane, Route } from "lucide-react";

// Leaflet needs the window object — load only on client.
// TripMapClustered = mapa con clustering por día + route optimizer (mayo 2026).
// El componente original `trip-map.tsx` se mantiene para fallback.
function MapLoading() {
  // `dynamic`'s loading prop puede ser un componente — usamos el dict por i18n.
  const { t } = useI18n();
  return <div className="h-[480px] rounded-lg border bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">{t.common.loading}</div>;
}
const TripMap = dynamic(() => import("@/components/map/trip-map-clustered"), {
  ssr: false,
  loading: () => <MapLoading />,
});

export default function MapPage() {
  const { t, locale, formatDate } = useI18n();
  const { data: trip } = useActiveTrip();
  const { data: cities, loading: lc } = useCities(trip?.id);
  const { data: reservations } = useReservations(trip?.id);
  const { data: tripDays } = useTripDays(trip?.id);

  const [track, setTrack] = useState<GeoPoint[]>([]);
  useEffect(() => {
    readTrackPoints().then(setTrack).catch(() => {});
  }, []);

  const pois = useMemo(() => (cities ? getPOIsForCities(cities.map(c => c.name)) : []), [cities]);

  const stats = useMemo(() => {
    if (!cities || !tripDays) return null;
    const withCoords = cities.filter(c => findCoordinates(c.name)).length;
    const totalNights = cities.reduce((s, c) => s + c.nights, 0);
    const flightCount = (reservations || []).filter(r => r.type === "flight").length;
    return { totalCities: cities.length, withCoords, totalNights, flightCount };
  }, [cities, tripDays, reservations]);

  if (lc) return <div className="animate-pulse h-[480px] bg-muted rounded-lg" />;
  if (!trip || !cities || cities.length === 0) {
    return <EmptyState title={t.map.noCitiesLoaded} icon={<MapPin className="w-8 h-8" />} action={<Link href="/itinerary"><Button>{t.map.loadCities}</Button></Link>} />;
  }

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">      <SectionHeader
        title={t.map.title}
        subtitle={stats ? `${stats.withCoords}/${stats.totalCities} ciudades · ${stats.totalNights} noches · ${stats.flightCount} vuelos` : ""}
      />

      <Card>
        <CardContent className="p-2">
          <TripMap cities={cities} reservations={reservations || []} tripDays={tripDays || []} track={track} />
        </CardContent>
      </Card>

      {pois.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {t.map.poisCurated} ({pois.length})
            </h3>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {Object.entries(POI_CATEGORY_LABELS).map(([k, v]) => {
                const count = pois.filter(p => p.category === k).length;
                if (count === 0) return null;
                return (
                  <span key={k} className="px-2 py-0.5 rounded-full" style={{ backgroundColor: v.color + "22", color: v.color }}>
                    {v.icon} {v.label} · {count}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {track.length > 1 && (
        <Card className="border-l-4 border-l-info">
          <CardContent className="p-3 text-xs flex items-center gap-2">
            <Route className="w-4 h-4 text-info" />
            <span><strong>{track.length}</strong> {t.map.trackingPointsSaved}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3">{t.map.eyebrowRoute}</h3>
          <ol className="space-y-2">
            {cities.map((c, i) => {
              const coords = findCoordinates(c.name);
              const daysInCity = (tripDays || []).filter(d => d.city_name === c.name);
              const covered = daysInCity.every(d => d.accommodation && !d.accommodation.toLowerCase().startsWith("pending"));
              const someCovered = daysInCity.some(d => d.accommodation && !d.accommodation.toLowerCase().startsWith("pending"));
              const status = covered ? "green" : someCovered ? "orange" : c.nights === 0 ? "gray" : "red";
              return (
                <li key={c.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/20">
                  <div className="w-6 h-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <Semaphore status={status} size={8} />
                      {coords ? null : <span className="text-[9px] text-muted-foreground">{t.map.noCoords}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{c.country} · {c.nights} {plural(locale, c.nights, t.map.nights)}</p>
                    {c.arrival_date && (
                      <p className="text-[10px] text-muted-foreground">{formatDate(c.arrival_date)}{c.departure_date && ` → ${formatDate(c.departure_date)}`}</p>
                    )}
                    {c.notes && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{c.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <Plane className="w-4 h-4" /> {t.map.eyebrowFlights}
          </h3>
          {(reservations || []).filter(r => r.type === "flight").length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.map.noFlights}</p>
          ) : (
            <ul className="space-y-1.5">
              {(reservations || []).filter(r => r.type === "flight").map(r => (
                <li key={r.id} className="text-xs p-2 rounded-md bg-muted/20">
                  <p className="font-medium">{r.description.substring(0, 80)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.provider}{r.locator && ` · ${r.locator}`}{r.use_date && ` · ${formatDate(r.use_date)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
