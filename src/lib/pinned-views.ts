"use client";

// ─── User-pinned shortcuts on the Today screen ───
// The user can pick which secondary modules surface as quick-access cards
// directly on /today (e.g. Salud, Visas, Packing, SOS).

export type PinnableKey =
  | "health"      // Salud
  | "visas"       // Visas
  | "packing"     // Equipaje
  | "emergency"   // SOS
  | "vault"       // Cartera
  | "tasks"       // Tareas
  | "calendar"    // Calendario
  | "split"       // Compartido
  | "alerts";     // Alertas

const STORAGE_KEY = "travel-os-pinned-views";
const DEFAULTS: PinnableKey[] = []; // user opts in

export function getPinnedViews(): PinnableKey[] {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as PinnableKey[];
    if (!Array.isArray(parsed)) return DEFAULTS;
    return parsed;
  } catch { return DEFAULTS; }
}

export function setPinnedViews(views: PinnableKey[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("travel-os-pinned-change"));
  }
}

export function togglePinnedView(key: PinnableKey): void {
  const current = getPinnedViews();
  if (current.includes(key)) {
    setPinnedViews(current.filter(k => k !== key));
  } else {
    setPinnedViews([...current, key]);
  }
}

export interface PinnableMeta {
  key: PinnableKey;
  label: string;
  href: string;
  description: string;
}

export const PINNABLE: PinnableMeta[] = [
  { key: "health",    label: "Salud",         href: "/health",       description: "Vacunas y certificados médicos" },
  { key: "visas",     label: "Visas",         href: "/visas",        description: "Requisitos por destino" },
  { key: "packing",   label: "Equipaje",      href: "/packing",      description: "Qué llevar" },
  { key: "emergency", label: "SOS",           href: "/emergency",    description: "Modo emergencia con números locales" },
  { key: "vault",     label: "Documentos",    href: "/vault",        description: "Pases y documentos" },
  { key: "tasks",     label: "Tareas",        href: "/tasks",        description: "Pendientes del viaje" },
  { key: "calendar",  label: "Calendario",    href: "/calendar",     description: "Vista 30 días" },
  { key: "split",     label: "Compartido",    href: "/split",        description: "Split entre viajeros" },
  { key: "alerts",    label: "Alertas",       href: "/alerts",       description: "Alertas activas" },
];
