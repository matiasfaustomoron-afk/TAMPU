// ─── Curated Points of Interest by destination ───
// Pragmatic curation by destination keyword. For real-time POIs use Overpass API
// (OSM) or Foursquare. This static set covers the seed trip + extensions.

export type POICategory = "sight" | "food" | "transit" | "safety" | "shopping" | "neighborhood";

export interface POI {
  name: string;
  category: POICategory;
  lat: number;
  lng: number;
  note: string;
  city_match: string; // substring matched against city.name (lowercased)
}

export const POIS: POI[] = [
  // ─── Seoul / Jongno ───
  { name: "Changgyeonggung Palace", category: "sight", lat: 37.578, lng: 126.994, note: "Palacio Joseon · entrada baja", city_match: "seoul" },
  { name: "Gwangjang Market", category: "food", lat: 37.570, lng: 126.999, note: "Comida callejera tradicional · bindaetteok", city_match: "seoul" },
  { name: "Bukchon Hanok Village", category: "neighborhood", lat: 37.583, lng: 126.985, note: "Casas hanok · respetar residentes", city_match: "seoul" },
  { name: "Insadong", category: "shopping", lat: 37.572, lng: 126.985, note: "Artesanía · té tradicional", city_match: "seoul" },
  { name: "Anguk Station", category: "transit", lat: 37.576, lng: 126.985, note: "Line 3 · acceso Jongno", city_match: "seoul" },
  { name: "Jongno-3-ga Station", category: "transit", lat: 37.571, lng: 126.991, note: "Lines 1/3/5", city_match: "seoul" },
  { name: "Itaewon Station", category: "transit", lat: 37.535, lng: 126.995, note: "Line 6 · barrio internacional", city_match: "seoul" },
  { name: "Comisaría Jongno", category: "safety", lat: 37.571, lng: 126.984, note: "Policía 24h", city_match: "seoul" },
  { name: "Bukhansan trailheads", category: "sight", lat: 37.659, lng: 126.987, note: "Hiking · accesible en metro", city_match: "seoul" },

  // ─── Manila (transit) ───
  { name: "NAIA Terminal 1", category: "transit", lat: 14.512, lng: 121.018, note: "Internacional · PAL/Emirates", city_match: "manila" },
  { name: "NAIA Terminal 3", category: "transit", lat: 14.510, lng: 121.015, note: "Internacional · varios", city_match: "manila" },
  { name: "Belmont Hotel Manila", category: "neighborhood", lat: 14.518, lng: 121.020, note: "Airport hotel típico para tránsito", city_match: "manila" },

  // ─── Port Moresby (POM) ───
  { name: "Jacksons International (POM)", category: "transit", lat: -9.443, lng: 147.219, note: "Único aeropuerto", city_match: "moresby" },
  { name: "Hilton Port Moresby", category: "neighborhood", lat: -9.443, lng: 147.179, note: "Hotel seguro recomendado", city_match: "moresby" },
  { name: "Embajada Australiana (atiende AR)", category: "safety", lat: -9.470, lng: 147.196, note: "Para emergencias consulares", city_match: "moresby" },

  // ─── PNG Highlands ───
  { name: "Goroka Town", category: "neighborhood", lat: -6.082, lng: 145.389, note: "Base del Goroka Show", city_match: "highlands" },
  { name: "Mt Hagen", category: "neighborhood", lat: -5.864, lng: 144.295, note: "Capital de Western Highlands", city_match: "highlands" },

  // ─── Dubai (transit) ───
  { name: "DXB Terminal 3", category: "transit", lat: 25.253, lng: 55.366, note: "Emirates hub", city_match: "dubai" },

  // ─── São Paulo (transit) ───
  { name: "GRU Terminal 3", category: "transit", lat: -23.434, lng: -46.476, note: "Internacional", city_match: "são paulo" },
  { name: "GRU Terminal 3", category: "transit", lat: -23.434, lng: -46.476, note: "Internacional", city_match: "sao paulo" },

  // ─── Common extensions ───
  { name: "Tokyo Station", category: "transit", lat: 35.681, lng: 139.767, note: "Shinkansen + JR + metro", city_match: "tokyo" },
  { name: "Tsukiji Outer Market", category: "food", lat: 35.665, lng: 139.770, note: "Sushi mañanero", city_match: "tokyo" },
  { name: "King's Cross St Pancras", category: "transit", lat: 51.531, lng: -0.124, note: "Eurostar + 6 líneas metro", city_match: "london" },
  { name: "Borough Market", category: "food", lat: 51.505, lng: -0.091, note: "Mercado gastronómico", city_match: "london" },
];

export function getPOIsForCities(cityNames: string[]): POI[] {
  const set: POI[] = [];
  const seen = new Set<string>();
  for (const name of cityNames) {
    const lower = name.toLowerCase();
    for (const poi of POIS) {
      if (!lower.includes(poi.city_match)) continue;
      const k = `${poi.name}@${poi.lat},${poi.lng}`;
      if (seen.has(k)) continue;
      seen.add(k);
      set.push(poi);
    }
  }
  return set;
}

export const POI_CATEGORY_LABELS: Record<POICategory, { label: string; icon: string; color: string }> = {
  sight: { label: "Atracciones", icon: "🏛", color: "#a855f7" },
  food: { label: "Comida", icon: "🍴", color: "#f97316" },
  transit: { label: "Transporte", icon: "🚇", color: "#3b82f6" },
  safety: { label: "Seguridad", icon: "🛟", color: "#ef4444" },
  shopping: { label: "Compras", icon: "🛍", color: "#ec4899" },
  neighborhood: { label: "Barrio", icon: "📍", color: "#10b981" },
};
