// ─── Map tile providers ───
// OSM default uses local-language labels (Chinese, Russian, German). For a
// consistent UX we offer CartoCDN tiles that use Latin/transliteration labels.
// User can switch in /settings.

export type MapStyle = "light" | "dark" | "voyager" | "osm-default";

export interface TileConfig {
  id: MapStyle;
  label: string;
  url: string;
  attribution: string;
  preferDark: boolean;
}

export const MAP_TILES: Record<MapStyle, TileConfig> = {
  // CartoCDN Positron — light theme, Latin labels (English/transliterated), neutral
  light: {
    id: "light",
    label: "Claro (etiquetas neutrales)",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    preferDark: false,
  },
  // CartoCDN Dark Matter — dark theme
  dark: {
    id: "dark",
    label: "Oscuro (etiquetas neutrales)",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    preferDark: true,
  },
  // CartoCDN Voyager — colorful, Latin labels
  voyager: {
    id: "voyager",
    label: "Color (etiquetas neutrales)",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    preferDark: false,
  },
  // OSM standard — local-language labels (default behaviour for backwards compat)
  "osm-default": {
    id: "osm-default",
    label: "OSM (idioma local)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap",
    preferDark: false,
  },
};

const STORAGE_KEY = "travel-os-map-style";

export function getStoredMapStyle(): MapStyle {
  if (typeof localStorage === "undefined") return "voyager";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in MAP_TILES) return stored as MapStyle;
  return "voyager";
}

export function setStoredMapStyle(style: MapStyle): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, style);
  window.dispatchEvent(new Event("travel-os-map-style-change"));
}
