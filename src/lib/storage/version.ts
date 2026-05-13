/**
 * Tampu — versioned localStorage wrapper.
 *
 * Problema que resuelve: hasta hoy todo `JSON.parse(localStorage.getItem(...))` se hacía
 * sin try/catch real y sin schema version. Cualquier cambio en el shape de un blob
 * rompía silenciosamente a usuarios existentes. Para datos críticos de viaje
 * (vault, expenses, trips) eso es inaceptable.
 *
 * Diseño:
 *  - Cada clave en localStorage que use este wrapper se guarda como
 *      { v: number, data: T }
 *  - `readVersioned(key, currentVersion, migrate)` lee, valida, y aplica migraciones
 *    si encuentra una versión anterior. Devuelve `null` si no hay nada o si la data
 *    está corrupta (con un warning en consola).
 *  - `writeVersioned(key, currentVersion, data)` siempre persiste con el wrapper.
 *  - `unwrapLegacy(raw, currentVersion)` adopta data legacy que NO tiene wrapper
 *    todavía (ej. el primer release de Tampu donde el vault se guardaba como
 *    array directo). El primer read tras esta release "upgradeará" los datos.
 *
 * NO usar este wrapper para:
 *  - blobs binarios (IndexedDB tiene su propio versioning)
 *  - claves que solo guardan strings simples (theme, locale, api-key) — overhead innecesario
 */

export interface Versioned<T> {
  v: number;
  data: T;
}

type MigrateFn<T> = (data: unknown, fromVersion: number) => T | null;

/**
 * Lee una clave de localStorage con shape `{ v, data }`. Si la versión guardada es
 * menor a `currentVersion` y se pasó `migrate`, se aplica. Si la data está
 * corrupta, está vacía, o la migración falla, devuelve `null` sin lanzar.
 *
 * @param key             clave de localStorage
 * @param currentVersion  versión actual del schema (sube de a 1)
 * @param migrate         función opcional que recibe data + fromVersion y devuelve
 *                        la data en el shape actual, o null si no se puede migrar
 */
export function readVersioned<T>(
  key: string,
  currentVersion: number,
  migrate?: MigrateFn<T>
): T | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch (err) {
    console.warn(`[storage] read failed for ${key}:`, err);
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] JSON parse failed for ${key} — leaving as-is, no destructive cleanup:`, err);
    return null;
  }

  // Legacy: data sin wrapper. Si parece array u objeto del shape esperado,
  // adoptarla como v0 y migrar.
  if (parsed && typeof parsed === "object" && !("v" in parsed && "data" in parsed)) {
    if (migrate) {
      const migrated = migrate(parsed, 0);
      if (migrated !== null) {
        // Persistir bajo nuevo wrapper (silent upgrade)
        try {
          writeVersioned(key, currentVersion, migrated);
        } catch { /* ignore */ }
        return migrated;
      }
    }
    // No migrate function — devolver tal cual (caller asume responsabilidad de shape)
    return parsed as T;
  }

  const v = (parsed as Versioned<T>).v;
  const data = (parsed as Versioned<T>).data;

  if (v === currentVersion) return data;
  if (v < currentVersion && migrate) {
    const migrated = migrate(data, v);
    if (migrated !== null) {
      try {
        writeVersioned(key, currentVersion, migrated);
      } catch { /* ignore */ }
      return migrated;
    }
    console.warn(`[storage] migration ${v} → ${currentVersion} failed for ${key}`);
    return null;
  }
  if (v > currentVersion) {
    console.warn(
      `[storage] ${key} has v${v} but app only knows v${currentVersion}. ` +
      `Returning as-is — newer app version may have downgraded.`
    );
    return data;
  }
  return null;
}

/**
 * Persiste una clave con shape `{ v, data }`. Falla silenciosamente si localStorage
 * no está disponible o está lleno (cuota excedida) — no queremos crashes en runtime.
 */
export function writeVersioned<T>(key: string, version: number, data: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify({ v: version, data }));
    return true;
  } catch (err) {
    // Cuota excedida o privacy mode. No reventamos la UI; el caller decide qué hacer.
    console.warn(`[storage] write failed for ${key}:`, err);
    return false;
  }
}

/**
 * Borra una clave. Util para "limpiar todo" en el panel de Ajustes.
 */
export function clearKey(key: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/**
 * Inspecciona el storage y reporta tamaño aproximado por clave. Solo para diagnóstico
 * (panel de Ajustes → "Datos en este dispositivo").
 */
export function inspectStorage(): { key: string; size: number; version: number | null }[] {
  if (typeof window === "undefined") return [];
  const out: { key: string; size: number; version: number | null }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) || "";
      let version: number | null = null;
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object" && "v" in parsed) {
          version = (parsed as Versioned<unknown>).v;
        }
      } catch { /* not JSON */ }
      out.push({ key: k, size: v.length, version });
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.size - a.size);
}
