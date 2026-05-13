"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { City, Reservation, TripDay } from "@/lib/types/database";
import { findCoordinates } from "@/lib/config/city-coordinates";
import { getPOIsForCities, POI_CATEGORY_LABELS } from "@/lib/config/pois";
import type { GeoPoint } from "@/lib/native/platform";
import { MAP_TILES, getStoredMapStyle, type MapStyle } from "@/lib/config/map-tiles";

// Fix default icon paths (Leaflet expects images at /images, we use CDN)
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

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 6);
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function TripMap({ cities, reservations: _reservations, tripDays, track = [] }: {
  cities: City[];
  reservations: Reservation[];
  tripDays: TripDay[];
  track?: GeoPoint[];
}) {
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => getStoredMapStyle());
  useEffect(() => {
    const onChange = () => queueMicrotask(() => setMapStyle(getStoredMapStyle()));
    window.addEventListener("travel-os-map-style-change", onChange);
    return () => window.removeEventListener("travel-os-map-style-change", onChange);
  }, []);
  const tile = MAP_TILES[mapStyle];
  const pins = useMemo(() => {
    const result: { name: string; lat: number; lng: number; country: string; nights: number; arrival: string | null; departure: string | null; notes: string | null; order: number; coverage: "covered" | "partial" | "uncovered" }[] = [];
    for (const c of cities) {
      const coords = findCoordinates(c.name);
      if (!coords) continue;
      const daysInCity = tripDays.filter(d => d.city_name === c.name);
      const covered = daysInCity.every(d => d.accommodation && !d.accommodation.toLowerCase().startsWith("pending"));
      const someCovered = daysInCity.some(d => d.accommodation && !d.accommodation.toLowerCase().startsWith("pending"));
      const coverage = covered ? "covered" : someCovered ? "partial" : "uncovered";
      result.push({
        name: c.name,
        lat: coords.lat,
        lng: coords.lng,
        country: c.country,
        nights: c.nights,
        arrival: c.arrival_date,
        departure: c.departure_date,
        notes: c.notes,
        order: c.order_index,
        coverage,
      });
    }
    result.sort((a, b) => a.order - b.order);
    return result;
  }, [cities, tripDays]);

  const points = pins.map(p => [p.lat, p.lng] as [number, number]);

  const pois = useMemo(() => getPOIsForCities(cities.map(c => c.name)), [cities]);
  const trackPath = useMemo(() => track.map(t => [t.lat, t.lng] as [number, number]), [track]);

  if (pins.length === 0) {
    return <div className="text-xs text-muted-foreground py-8 text-center">Sin ciudades con coordenadas conocidas</div>;
  }

  return (
    <div style={{ width: "100%", height: 480 }} className="rounded-lg overflow-hidden border">
      <MapContainer center={[0, 30]} zoom={2} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          key={tile.id}
          attribution={tile.attribution}
          url={tile.url}
        />
        <FitBounds points={points} />
        <Polyline positions={points} pathOptions={{ color: "#10b981", weight: 2, opacity: 0.7, dashArray: "5,5" }} />
        {trackPath.length > 1 && (
          <Polyline positions={trackPath} pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.6 }} />
        )}
        {pois.map((p, i) => {
          const meta = POI_CATEGORY_LABELS[p.category];
          return (
            <CircleMarker
              key={`poi-${i}`}
              center={[p.lat, p.lng]}
              radius={5}
              pathOptions={{ color: meta.color, fillColor: meta.color, fillOpacity: 0.85, weight: 1 }}
            >
              <Popup>
                <div className="text-xs" style={{ minWidth: 180 }}>
                  <p className="font-semibold">{meta.icon} {p.name}</p>
                  <p className="text-muted-foreground">{meta.label}</p>
                  <p>{p.note}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        {pins.map((p, i) => (
          <Marker key={`${p.name}-${i}`} position={[p.lat, p.lng]}>
            <Popup>
              <div className="text-xs space-y-0.5" style={{ minWidth: 200 }}>
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-muted-foreground">{p.country}</p>
                <p>{p.nights} {p.nights === 1 ? "noche" : "noches"}</p>
                {p.arrival && <p>Llegada: {p.arrival}</p>}
                {p.departure && <p>Salida: {p.departure}</p>}
                <p>
                  Cobertura:{" "}
                  <span style={{ color: p.coverage === "covered" ? "#10b981" : p.coverage === "partial" ? "#f59e0b" : "#ef4444" }}>
                    {p.coverage === "covered" ? "OK" : p.coverage === "partial" ? "parcial" : "sin cubrir"}
                  </span>
                </p>
                {p.notes && <p className="text-muted-foreground italic">{p.notes}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
