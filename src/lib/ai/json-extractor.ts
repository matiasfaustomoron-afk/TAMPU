/**
 * Extrae el primer objeto JSON de un string que puede tener markdown
 * fences o prosa. Devuelve null si no parsea.
 *
 * Centraliza un patrón que estaba duplicado en 6+ routes/utils (cada uno
 * con leve drift). Un solo lugar para fixear bugs (ej: prefix BOM, fences
 * con whitespace, JSON anidado en prosa).
 */
export function extractJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  // Strip markdown fences si están
  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  // Si no arranca con { ni [, intentar encontrar el primer JSON
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    const start = firstBrace === -1 ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
    if (start === -1) return null;
    const lastBrace = cleaned.lastIndexOf("}");
    const lastBracket = cleaned.lastIndexOf("]");
    const end = Math.max(lastBrace, lastBracket);
    if (end <= start) return null;
    cleaned = cleaned.slice(start, end + 1);
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
