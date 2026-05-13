import type { PackingItem, Trip } from "@/lib/types/database";

export interface PackingSuggestion {
  category: string;
  subcategory: string | null;
  item: string;
  quantity: number;
  is_essential: boolean;
  reason: string;
  trigger: string;
}

interface DestinationProfile {
  match: string;
  triggers: string[];
  weather: ("hot" | "humid" | "rainy" | "cold" | "tropical" | "dry")[];
  cultural: string[];
  health_risk: ("malaria" | "altitude" | "water" | "insects" | "sun")[];
  connectivity: "good" | "poor" | "none";
  electricity: "stable" | "unstable" | "none";
}

const PROFILES: DestinationProfile[] = [
  { match: "png", triggers: ["png", "papua", "highlands", "goroka", "moresby"], weather: ["humid", "rainy", "tropical"], cultural: ["modest_clothing", "gift_giving"], health_risk: ["malaria", "water", "insects"], connectivity: "poor", electricity: "unstable" },
  { match: "seoul", triggers: ["seoul", "korea", "incheon", "jongno"], weather: ["humid", "hot", "rainy"], cultural: ["modest_temple"], health_risk: ["sun"], connectivity: "good", electricity: "stable" },
  { match: "manila", triggers: ["manila", "philippin"], weather: ["humid", "hot", "rainy"], cultural: [], health_risk: ["sun", "insects"], connectivity: "good", electricity: "stable" },
  { match: "dubai", triggers: ["dubai", "uae", "abu dhabi"], weather: ["hot", "dry"], cultural: ["modest_clothing"], health_risk: ["sun"], connectivity: "good", electricity: "stable" },
  { match: "tokyo", triggers: ["tokyo", "japan"], weather: ["humid", "rainy"], cultural: [], health_risk: [], connectivity: "good", electricity: "stable" },
  { match: "london", triggers: ["london", "uk", "england"], weather: ["rainy", "cold"], cultural: [], health_risk: [], connectivity: "good", electricity: "stable" },
  // ─── New profiles ───
  { match: "cold", triggers: ["iceland", "norway", "finland", "alaska", "patagonia", "ushuaia", "antartida", "antarctica"], weather: ["cold"], cultural: [], health_risk: ["sun"], connectivity: "good", electricity: "stable" },
  { match: "beach", triggers: ["cancun", "bali", "phuket", "maldives", "caribbean", "punta cana", "rio de janeiro", "miami", "ibiza"], weather: ["hot", "humid", "tropical"], cultural: [], health_risk: ["sun", "insects"], connectivity: "good", electricity: "stable" },
  { match: "business", triggers: ["business", "conference", "trade show", "summit", "ces", "wwdc"], weather: [], cultural: [], health_risk: [], connectivity: "good", electricity: "stable" },
  { match: "festival", triggers: ["coachella", "tomorrowland", "burning man", "primavera sound", "festival", "lollapalooza"], weather: ["hot", "dry"], cultural: [], health_risk: ["sun"], connectivity: "poor", electricity: "unstable" },
  { match: "altitude", triggers: ["cusco", "la paz", "puno", "machu picchu", "everest", "nepal", "tibet", "altiplano"], weather: ["cold"], cultural: [], health_risk: ["altitude", "sun"], connectivity: "good", electricity: "stable" },
];

function buildBase(): PackingSuggestion[] {
  return [
    { category: "documents", subcategory: "travel", item: "Pasaporte", quantity: 1, is_essential: true, reason: "Documento esencial", trigger: "base" },
    { category: "documents", subcategory: "travel", item: "Copias impresas de bookings", quantity: 1, is_essential: true, reason: "Backup físico ante problemas digitales", trigger: "base" },
    { category: "documents", subcategory: "finance", item: "2 tarjetas (principal + backup)", quantity: 2, is_essential: true, reason: "Si una falla", trigger: "base" },
    { category: "electronics", subcategory: "power", item: "Cargador USB", quantity: 1, is_essential: true, reason: "Base", trigger: "base" },
    { category: "electronics", subcategory: "devices", item: "Teléfono", quantity: 1, is_essential: true, reason: "Base", trigger: "base" },
    { category: "toiletries", subcategory: "basics", item: "Cepillo + pasta dental", quantity: 1, is_essential: true, reason: "Higiene básica", trigger: "base" },
    { category: "health", subcategory: "first-aid", item: "Botiquín de primeros auxilios", quantity: 1, is_essential: true, reason: "Cualquier viaje", trigger: "base" },
  ];
}

function matchesProfile(text: string, p: DestinationProfile): boolean {
  const lower = text.toLowerCase();
  return p.triggers.some(t => lower.includes(t));
}

export function suggestPackingItems(trip: Trip, existing: PackingItem[], cityNames: string[]): PackingSuggestion[] {
  const haystack = [trip.destination, trip.name, ...cityNames].join(" | ").toLowerCase();
  const matched = PROFILES.filter(p => matchesProfile(haystack, p));

  const items: PackingSuggestion[] = buildBase();

  for (const p of matched) {
    // Weather
    if (p.weather.includes("rainy")) {
      items.push({ category: "clothing", subcategory: "outerwear", item: "Campera impermeable / poncho", quantity: 1, is_essential: true, reason: "Lluvia frecuente", trigger: p.match });
      items.push({ category: "gear", subcategory: "rain", item: "Bolsas estancas para electrónica", quantity: 2, is_essential: true, reason: "Lluvia + electrónica", trigger: p.match });
    }
    if (p.weather.includes("hot") || p.weather.includes("humid") || p.weather.includes("tropical")) {
      items.push({ category: "clothing", subcategory: "tops", item: "Remeras quick-dry", quantity: 5, is_essential: true, reason: "Calor + humedad", trigger: p.match });
      items.push({ category: "health", subcategory: "protection", item: "Protector solar SPF 50+", quantity: 1, is_essential: true, reason: "Exposición solar alta", trigger: p.match });
    }
    if (p.weather.includes("cold")) {
      items.push({ category: "clothing", subcategory: "outerwear", item: "Capa térmica", quantity: 1, is_essential: true, reason: "Frío", trigger: p.match });
    }
    if (p.weather.includes("dry")) {
      items.push({ category: "health", subcategory: "skincare", item: "Crema hidratante / labial", quantity: 1, is_essential: false, reason: "Clima seco", trigger: p.match });
    }

    // Health risks
    if (p.health_risk.includes("malaria")) {
      items.push({ category: "health", subcategory: "medication", item: "Profilaxis antimalárica (con receta)", quantity: 1, is_essential: true, reason: "Zona de malaria", trigger: p.match });
      items.push({ category: "health", subcategory: "protection", item: "Repelente DEET 30%+", quantity: 2, is_essential: true, reason: "Mosquitos vectores", trigger: p.match });
      items.push({ category: "clothing", subcategory: "tops", item: "Manga larga liviana", quantity: 2, is_essential: true, reason: "Protección de picaduras", trigger: p.match });
    }
    if (p.health_risk.includes("water")) {
      items.push({ category: "health", subcategory: "water", item: "Pastillas potabilizadoras / filtro", quantity: 1, is_essential: true, reason: "Agua no potable", trigger: p.match });
    }
    if (p.health_risk.includes("insects")) {
      items.push({ category: "gear", subcategory: "sleep", item: "Mosquitero para cama", quantity: 1, is_essential: false, reason: "Insectos en alojamientos rurales", trigger: p.match });
    }
    if (p.health_risk.includes("sun")) {
      items.push({ category: "clothing", subcategory: "accessories", item: "Gorra / sombrero", quantity: 1, is_essential: false, reason: "Sol fuerte", trigger: p.match });
      items.push({ category: "clothing", subcategory: "accessories", item: "Anteojos de sol", quantity: 1, is_essential: false, reason: "Sol fuerte", trigger: p.match });
    }
    if (p.health_risk.includes("altitude")) {
      items.push({ category: "health", subcategory: "medication", item: "Sorochi pills / coca", quantity: 1, is_essential: false, reason: "Altura", trigger: p.match });
    }

    // Connectivity / electricity
    if (p.connectivity === "poor" || p.connectivity === "none") {
      items.push({ category: "electronics", subcategory: "power", item: "Power bank 20000mAh+", quantity: 1, is_essential: true, reason: "Carga limitada en destino", trigger: p.match });
      items.push({ category: "electronics", subcategory: "navigation", item: "Mapas offline pre-descargados", quantity: 1, is_essential: true, reason: "Sin red en zonas", trigger: p.match });
    }
    if (p.electricity === "unstable" || p.electricity === "none") {
      items.push({ category: "gear", subcategory: "light", item: "Linterna frontal", quantity: 1, is_essential: true, reason: "Electricidad inestable", trigger: p.match });
    }

    // Cultural
    if (p.cultural.includes("modest_clothing")) {
      items.push({ category: "clothing", subcategory: "tops", item: "Ropa modesta (cubre hombros y rodillas)", quantity: 2, is_essential: false, reason: "Requerimiento cultural", trigger: p.match });
    }
    if (p.cultural.includes("gift_giving")) {
      items.push({ category: "misc", subcategory: "gifts", item: "Regalos pequeños para anfitriones", quantity: 1, is_essential: false, reason: "Costumbre local", trigger: p.match });
    }
  }

  // Duration-based
  const duration = Math.max(1, Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / (1000 * 60 * 60 * 24)));
  if (duration > 14) {
    items.push({ category: "clothing", subcategory: "underwear", item: `Ropa interior x ${Math.min(10, duration / 2)}`, quantity: Math.min(10, Math.ceil(duration / 2)), is_essential: true, reason: `Viaje largo (${duration} días)`, trigger: "duration" });
  }

  // Dedupe by item name (case-insensitive) — keep existing items in DB, only suggest new ones
  const existingLower = new Set(existing.map(e => e.item.toLowerCase()));
  return items.filter(s => !existingLower.has(s.item.toLowerCase()));
}
