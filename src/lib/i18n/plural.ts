export type PluralRule = "one" | "other";

/**
 * Plural helper basado en Intl.PluralRules.
 * Uso: plural(locale, count, { one: "día", other: "días" })
 */
export function plural(locale: string, count: number, forms: { one: string; other: string }): string {
  try {
    const rule = new Intl.PluralRules(locale).select(count) as PluralRule;
    return forms[rule] || forms.other;
  } catch {
    return count === 1 ? forms.one : forms.other;
  }
}
