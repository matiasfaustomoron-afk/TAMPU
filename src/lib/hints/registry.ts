"use client";

/**
 * Tampu — Sistema de hints contextuales (coachmarks).
 *
 * Inspirado en Wanderlog (que tiene tips inline que guían al user). Diferencia:
 *  - No usamos tooltips intrusivos. Son cards informativas que aparecen en
 *    contextos específicos (empty states, primer uso de una feature).
 *  - El user puede descartarlos para siempre con tap en X.
 *  - Idempotente: si un hint fue cerrado, NUNCA vuelve a aparecer.
 *  - Si el feature ya fue usada (ej: el user ya importó un email), el hint
 *    relacionado no se muestra.
 *
 * Persistencia: localStorage. Schema versionado para futuro proofing.
 */

const KEY = "tampu-hints-dismissed";
const VERSION = 1;

export interface HintDef {
  id: string;
  /** Selector de cuándo mostrar — el caller decide */
  when: "empty" | "feature-discovery" | "after-first-use";
  /** Microcopy en español (target: viajero LATAM adulto) */
  title: string;
  body: string;
  /** Opcional: link a una sección de ayuda o feature */
  cta?: { label: string; href: string };
  /** Categoría visual del card */
  tone: "tip" | "warn" | "feature";
}

/**
 * Catálogo de hints. Estilo Wanderlog: textos breves, accionables, sin marketing.
 * Cada hint es identificado por un slug único que el componente usa para dismiss.
 */
export const HINTS: Record<string, HintDef> = {
  // ─── Onboarding / Discovery ──────────────────────────────────────────
  "import-first-time": {
    id: "import-first-time",
    when: "empty",
    title: "Reenviá tu primer email",
    body: "Pegá un mail de confirmación de vuelo, hotel o transfer. La IA detecta las reservas y las suma al viaje. No hay que escribir nada a mano.",
    cta: { label: "Probá con el ejemplo →", href: "/import?demo=1" },
    tone: "tip",
  },
  "vault-empty": {
    id: "vault-empty",
    when: "empty",
    title: "Tu cartera vive offline",
    body: "Los documentos que subís acá funcionan en el aeropuerto sin red. Boarding passes, pasaporte, seguro, vouchers — todo accesible aunque tengas el modo avión activo.",
    tone: "feature",
  },
  "journal-first-photo": {
    id: "journal-first-photo",
    when: "empty",
    title: "Tu primer momento",
    body: "Sacá una foto desde la app o subila desde la galería. Si tenés ubicación encendida, Tampu detecta el lugar automáticamente y lo nombra.",
    tone: "tip",
  },
  "expenses-first": {
    id: "expenses-first",
    when: "empty",
    title: "Cargá gastos al toque",
    body: "Sin formularios largos: monto, categoría, moneda. Tampu calcula el equivalente en tu moneda base y te avisa si te estás pasando del presupuesto.",
    tone: "tip",
  },
  "share-trip-tip": {
    id: "share-trip-tip",
    when: "feature-discovery",
    title: "Compartir con tu pareja o grupo",
    body: "Invitá a tus compañeros de ruta con su email. Ellos ven el itinerario en vivo — cuando vos sumás una reserva, les aparece sin recargar.",
    cta: { label: "Compartir viaje →", href: "/members" },
    tone: "feature",
  },
  "whatsapp-forward": {
    id: "whatsapp-forward",
    when: "feature-discovery",
    title: "También funciona por WhatsApp",
    body: "Si tu hostería o el conductor del transfer te confirma por WhatsApp, podés reenviar el mensaje a Tampu y la app lo lee igual que un email. Único en el mercado.",
    tone: "feature",
  },
  "siri-shortcut": {
    id: "siri-shortcut",
    when: "feature-discovery",
    title: "Decile a Siri",
    body: "Configurá el atajo: \"Hey Siri, próximo vuelo en Tampu\". Te responde sin abrir la app, on-device — tus datos no se mandan a ningún servidor.",
    tone: "feature",
  },
  "offline-tip": {
    id: "offline-tip",
    when: "feature-discovery",
    title: "Funciona en modo avión",
    body: "Aterrizaste y todavía no tenés conexión: Tampu te muestra el itinerario, los boarding passes, los hoteles. Después sincroniza cuando vuelve la red.",
    tone: "feature",
  },
  "today-customize": {
    id: "today-customize",
    when: "feature-discovery",
    title: "Personalizá tu pantalla Hoy",
    body: "Desde Más → Personalizar Hoy, fijás los bloques que querés ver primero. Tu mañana en el aeropuerto es distinta a tu sobremesa en Cusco.",
    cta: { label: "Configurar →", href: "/more" },
    tone: "tip",
  },
  "map-cluster": {
    id: "map-cluster",
    when: "feature-discovery",
    title: "Tap en un día del mapa",
    body: "Los pines del mapa están coloreados por día del viaje. Tocá un número para filtrar y ver solo los puntos de ese día. La ruta se redibuja.",
    tone: "tip",
  },
  "optimize-route": {
    id: "optimize-route",
    when: "feature-discovery",
    title: "Optimizar la ruta del día",
    body: "Si tenés varias paradas en un día, Tampu calcula el orden óptimo para no zig-zaguear. Tap en \"Optimizar ruta\" arriba del mapa.",
    tone: "tip",
  },
};

// ─── Persistencia ───────────────────────────────────────────────────────

interface DismissedState {
  v: number;
  ids: string[];
}

function read(): DismissedState {
  if (typeof localStorage === "undefined") return { v: VERSION, ids: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { v: VERSION, ids: [] };
    const parsed = JSON.parse(raw) as DismissedState;
    if (parsed.v !== VERSION) return { v: VERSION, ids: [] };
    return parsed;
  } catch {
    return { v: VERSION, ids: [] };
  }
}

function write(state: DismissedState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new Event("tampu-hints-change"));
  } catch { /* ignore */ }
}

export function isDismissed(id: string): boolean {
  return read().ids.includes(id);
}

export function dismiss(id: string): void {
  const s = read();
  if (s.ids.includes(id)) return;
  s.ids.push(id);
  write(s);
}

/** Reset todos los hints — útil desde Settings para "ver consejos otra vez". */
export function resetHints(): void {
  write({ v: VERSION, ids: [] });
}

export function getDismissedCount(): number {
  return read().ids.length;
}
