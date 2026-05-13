// Lat/lng for cities used by the map view.
// Source: Wikipedia + OpenStreetMap (rounded to 2 decimals).
// Augment as new destinations appear.

export interface CityCoordinate {
  match: string; // substring to match against city_name (case-insensitive)
  lat: number;
  lng: number;
  country: string;
  iso2: string;
}

export const CITY_COORDINATES: CityCoordinate[] = [
  { match: "buenos aires", lat: -34.61, lng: -58.38, country: "Argentina", iso2: "AR" },
  { match: "são paulo", lat: -23.55, lng: -46.63, country: "Brazil", iso2: "BR" },
  { match: "sao paulo", lat: -23.55, lng: -46.63, country: "Brazil", iso2: "BR" },
  { match: "gru", lat: -23.43, lng: -46.47, country: "Brazil", iso2: "BR" },
  { match: "dubai", lat: 25.27, lng: 55.30, country: "UAE", iso2: "AE" },
  { match: "dxb", lat: 25.25, lng: 55.36, country: "UAE", iso2: "AE" },
  { match: "manila", lat: 14.60, lng: 120.98, country: "Philippines", iso2: "PH" },
  { match: "mnl", lat: 14.51, lng: 121.02, country: "Philippines", iso2: "PH" },
  { match: "port moresby", lat: -9.44, lng: 147.18, country: "Papua New Guinea", iso2: "PG" },
  { match: "pom", lat: -9.44, lng: 147.22, country: "Papua New Guinea", iso2: "PG" },
  { match: "png highlands", lat: -6.08, lng: 145.39, country: "Papua New Guinea", iso2: "PG" },
  { match: "goroka", lat: -6.08, lng: 145.39, country: "Papua New Guinea", iso2: "PG" },
  { match: "seoul", lat: 37.57, lng: 126.98, country: "South Korea", iso2: "KR" },
  { match: "incheon", lat: 37.46, lng: 126.44, country: "South Korea", iso2: "KR" },
  { match: "icn", lat: 37.46, lng: 126.44, country: "South Korea", iso2: "KR" },
  { match: "jongno", lat: 37.59, lng: 126.99, country: "South Korea", iso2: "KR" },
  { match: "london", lat: 51.51, lng: -0.13, country: "UK", iso2: "GB" },
  { match: "tokyo", lat: 35.68, lng: 139.69, country: "Japan", iso2: "JP" },
  { match: "new york", lat: 40.71, lng: -74.01, country: "USA", iso2: "US" },
  { match: "paris", lat: 48.86, lng: 2.35, country: "France", iso2: "FR" },
];

export function findCoordinates(cityName: string | null | undefined): CityCoordinate | null {
  if (!cityName) return null;
  const lower = cityName.toLowerCase();
  for (const c of CITY_COORDINATES) {
    if (lower.includes(c.match)) return c;
  }
  return null;
}

/**
 * Equirectangular projection from (lat, lng) to SVG (x, y) in a viewBox of [0, 0, W, H].
 * Longitude [-180, 180] → x [0, W]
 * Latitude  [-90, 90]   → y [H, 0] (inverted)
 */
export function project(lat: number, lng: number, w: number, h: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}
