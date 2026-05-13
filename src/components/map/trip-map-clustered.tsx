"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { City, Reservation, TripDay } from "@/lib/types/database";
import { findCoordinates } from "@/lib/config/city-coordinates";
import { getPOIsForCities, POI_CATEGORY_LABELS } from "@/lib/config/pois";
import type { GeoPoint } from "@/lib/native/platform";
import { MAP_TILES, getStoredMapStyle, type MapStyle } from "@/lib/config/map-tiles";
import { optimizeRouteFull, type RoutePoint } from "@/lib/domain/route-optimizer";

/**
 * TripMapClustered — mapa avanzado con:
 *  1. Clustering de POIs cuando hay muchos puntos cerca (leaflet.markercluster).
 *  2. Color-coding por día del viaje (cities con ese día asignado).
 *  3. Ruta optimizada por día (nearest-neighbor + 2-opt) cuando el user
 *     prende "Optimizar ruta" — calculamos el orden óptimo y dibujamos
 *     la polyline en ese orden.
 *  4. Toggle de filtro: ver TODOS los puntos o solo un día específico.
 *
 * Este componente sucede al `trip-map.tsx` original (que se mantuvo para
 * tests/legacy). En `/map` mostramos este por default.
 */

// Default icon fix (Leaflet CSS expects /images path which Next no respeta)
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Per-day palette (matches Tampu Andean tokens approximated to hex).
// 10 colores únicos repetidos cíclicamente para viajes largos.
const DAY_COLORS = [
  "#c75b2f", // terracota
  "#b97c4a", // cobre
  "#4a8a5e", // cardón
  "#d6a13a", // mostaza
  "#5a6fa8", // índigo
  "#a13d4e", // carmín
  "#8c6b3a", // canela
  "#6f655a", // piedra
  "#3a8aa1", // azul guarda
  "#9b6f3a", // marrón
];

function colorForDay(dayNumber: number | null | undefined): string {
  if (dayNumber == null) return "#6f655a";
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 8);
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [points, map]);
  return null;
}

interface CityMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  nights: number;
  order: number;
  dayNumber: number | null;
  coverage: "covered" | "partial" | "uncovered";
}

/**
 * MarkerCluster layer — usa leaflet.markercluster imperativamente desde useMap.
 * react-leaflet 5.x no expone hook oficial para clustering, así que armamos el
 * layer manualmente y lo enganchamos al mapa.
 */
function ClusterLayer({
  cities,
  pois,
  filterDay,
  optimizedRoute,
}: {
  cities: CityMarker[];
  pois: Array<{ name: string; lat: number; lng: number; category: keyof typeof POI_CATEGORY_LABELS; note: string }>;
  filterDay: number | null;
  optimizedRoute: [number, number][] | null;
}) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    // ─── Build cluster group ───
    const cluster: L.MarkerClusterGroup = (L as unknown as { markerClusterGroup: (opts?: Record<string, unknown>) => L.MarkerClusterGroup }).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 60,
      iconCreateFunction: (c: L.MarkerCluster) => {
        const n = c.getChildCount();
        const tone =
          n >= 50 ? "#9b3d3d" :
          n >= 20 ? "#c75b2f" :
          n >= 10 ? "#d6a13a" :
          "#4a8a5e";
        return L.divIcon({
          html: `<div style="background:${tone};color:white;font-weight:700;font-size:12px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid white;">${n}</div>`,
          className: "tampu-cluster-icon",
          iconSize: L.point(36, 36),
        });
      },
    });

    // ─── City markers (colored by day) ───
    for (const c of cities) {
      if (filterDay !== null && c.dayNumber !== filterDay) continue;
      const color = colorForDay(c.dayNumber);
      const numberLabel = c.dayNumber ?? c.order;
      const cityIcon = L.divIcon({
        html: `<div style="background:${color};color:white;font-weight:700;font-size:13px;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;"><span style="transform:rotate(45deg);">${numberLabel}</span></div>`,
        className: "tampu-city-icon",
        iconSize: L.point(32, 32),
        iconAnchor: L.point(16, 32),
      });
      const marker = L.marker([c.lat, c.lng], { icon: cityIcon }).bindPopup(
        `<div style="min-width:200px;font-size:12px;line-height:1.4;">
          <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${c.name}</div>
          <div style="color:#666;">${c.country}</div>
          ${c.dayNumber ? `<div>Día <strong>${c.dayNumber}</strong> del viaje</div>` : ""}
          <div>${c.nights} ${c.nights === 1 ? "noche" : "noches"}</div>
          <div style="margin-top:4px;color:${c.coverage === "covered" ? "#10b981" : c.coverage === "partial" ? "#f59e0b" : "#ef4444"};">
            ${c.coverage === "covered" ? "Cobertura OK" : c.coverage === "partial" ? "Cobertura parcial" : "Sin cubrir"}
          </div>
        </div>`,
      );
      cluster.addLayer(marker);
    }

    // ─── POI markers (clustered) ───
    for (const p of pois) {
      const meta = POI_CATEGORY_LABELS[p.category];
      const poiIcon = L.divIcon({
        html: `<div style="background:${meta.color};color:white;font-size:11px;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:1.5px solid white;">${meta.icon}</div>`,
        className: "tampu-poi-icon",
        iconSize: L.point(22, 22),
      });
      const marker = L.marker([p.lat, p.lng], { icon: poiIcon }).bindPopup(
        `<div style="min-width:180px;font-size:12px;line-height:1.4;">
          <div style="font-weight:700;font-size:13px;">${meta.icon} ${p.name}</div>
          <div style="color:#666;">${meta.label}</div>
          <div style="margin-top:4px;">${p.note}</div>
        </div>`,
      );
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    clusterRef.current = cluster;

    // ─── Optimized route polyline ───
    if (optimizedRoute && optimizedRoute.length > 1) {
      const poly = L.polyline(optimizedRoute, {
        color: "#c75b2f",
        weight: 3,
        opacity: 0.85,
        dashArray: "8,4",
      });
      map.addLayer(poly);
      polylineRef.current = poly;
    }

    return () => {
      if (clusterRef.current) map.removeLayer(clusterRef.current);
      if (polylineRef.current) map.removeLayer(polylineRef.current);
    };
  }, [map, cities, pois, filterDay, optimizedRoute]);

  return null;
}

export default function TripMapClustered({
  cities,
  reservations: _reservations,
  tripDays,
  track = [],
}: {
  cities: City[];
  reservations: Reservation[];
  tripDays: TripDay[];
  track?: GeoPoint[];
}) {
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => getStoredMapStyle());
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [optimize, setOptimize] = useState(false);

  useEffect(() => {
    const onChange = () => queueMicrotask(() => setMapStyle(getStoredMapStyle()));
    window.addEventListener("travel-os-map-style-change", onChange);
    return () => window.removeEventListener("travel-os-map-style-change", onChange);
  }, []);

  const tile = MAP_TILES[mapStyle];

  // City pins with day number derived from tripDays
  const cityMarkers = useMemo<CityMarker[]>(() => {
    const out: CityMarker[] = [];
    for (const c of cities) {
      const coords = findCoordinates(c.name);
      if (!coords) continue;
      const daysInCity = tripDays.filter((d) => d.city_name === c.name);
      const firstDay = daysInCity.length > 0 ? Math.min(...daysInCity.map((d) => d.day_number ?? 0)) || null : null;
      const covered = daysInCity.length > 0 && daysInCity.every((d) => d.accommodation && !d.accommodation.toLowerCase().startsWith("pending"));
      const someCovered = daysInCity.some((d) => d.accommodation && !d.accommodation.toLowerCase().startsWith("pending"));
      const coverage: CityMarker["coverage"] = covered ? "covered" : someCovered ? "partial" : "uncovered";
      out.push({
        id: c.id,
        name: c.name,
        lat: coords.lat,
        lng: coords.lng,
        country: c.country,
        nights: c.nights,
        order: c.order_index,
        dayNumber: firstDay,
        coverage,
      });
    }
    out.sort((a, b) => a.order - b.order);
    return out;
  }, [cities, tripDays]);

  const pois = useMemo(() => getPOIsForCities(cities.map((c) => c.name)), [cities]);

  // Route optimization: when optimize is on, reorder cityMarkers using TSP.
  const optimizedRoute = useMemo<[number, number][] | null>(() => {
    if (!optimize || cityMarkers.length < 2) return null;
    const points: RoutePoint[] = cityMarkers.map((c, i) => ({ id: c.id, lat: c.lat, lng: c.lng, pinned: i === 0 }));
    const { ordered } = optimizeRouteFull(points);
    return ordered.map((p) => [p.lat, p.lng]);
  }, [optimize, cityMarkers]);

  // Default route (chronological order from city.order_index)
  const defaultRoute = useMemo<[number, number][]>(
    () => cityMarkers.map((c) => [c.lat, c.lng] as [number, number]),
    [cityMarkers],
  );

  const allDayNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const d of tripDays) if (d.day_number) set.add(d.day_number);
    return Array.from(set).sort((a, b) => a - b);
  }, [tripDays]);

  const fitPoints = useMemo<[number, number][]>(
    () => (filterDay !== null ? cityMarkers.filter((c) => c.dayNumber === filterDay) : cityMarkers).map((c) => [c.lat, c.lng]),
    [cityMarkers, filterDay],
  );

  if (cityMarkers.length === 0) {
    return <div className="text-xs text-muted-foreground py-8 text-center">Sin ciudades con coordenadas conocidas</div>;
  }

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOptimize((o) => !o)}
          className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
            optimize ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
          aria-pressed={optimize}
        >
          {optimize ? "✓ Ruta optimizada" : "Optimizar ruta"}
        </button>
        <button
          onClick={() => setFilterDay(null)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
            filterDay === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Todos
        </button>
        {allDayNumbers.slice(0, 12).map((d) => (
          <button
            key={d}
            onClick={() => setFilterDay(d)}
            className={`w-7 h-7 rounded-full text-[11px] font-bold transition-all border-2 ${
              filterDay === d ? "border-foreground" : "border-transparent opacity-70"
            }`}
            style={{ background: colorForDay(d), color: "white" }}
            aria-label={`Día ${d}`}
            aria-pressed={filterDay === d}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Map */}
      <div style={{ width: "100%", height: 480 }} className="rounded-lg overflow-hidden border">
        <MapContainer center={[0, 30]} zoom={2} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer key={tile.id} attribution={tile.attribution} url={tile.url} />
          <FitBounds points={fitPoints} />
          {!optimize && defaultRoute.length > 1 && (
            <Polyline positions={defaultRoute} pathOptions={{ color: "#10b981", weight: 2, opacity: 0.6, dashArray: "5,5" }} />
          )}
          {track.length > 1 && (
            <Polyline
              positions={track.map((t) => [t.lat, t.lng] as [number, number])}
              pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.6 }}
            />
          )}
          <ClusterLayer cities={cityMarkers} pois={pois} filterDay={filterDay} optimizedRoute={optimizedRoute} />
        </MapContainer>
      </div>
    </div>
  );
}
