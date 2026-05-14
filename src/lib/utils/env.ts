// Tampu — Environment helpers
//
// `isBrowser` reemplaza el patrón `typeof window !== "undefined"` repetido en
// múltiples lugares (sync/status.ts, hooks, demo-store, etc). Constante
// resuelta al import-time del módulo: webpack/Next.js DCE en server bundle
// la evalúa como false y elimina el dead-code del bundle del cliente
// cuando se usa dentro de un if().

export const isBrowser: boolean = typeof window !== "undefined";

// Guard útil para narrowing de `navigator` además de `window`.
export const hasNavigator: boolean =
  typeof navigator !== "undefined" && typeof window !== "undefined";
