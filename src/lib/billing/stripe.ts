// ─── src/lib/billing/stripe.ts ───────────────────────────────────────────
//
// Wrapper server-side para Stripe. Tampu+ lifetime es un único producto
// one-time payment (NO subscription) — USD 29 que desbloquea proxy IA
// gestionado, badge cosmético, themes y crédito futuro de marketplace.
//
// El cliente NUNCA importa este archivo. Vive en route handlers
// (`/api/checkout/create-session`, `/api/webhooks/stripe`) y server actions.
//
// Diseño:
//   - `getStripeServer()` devuelve la instancia singleton (lazy import para
//     que el bundle del cliente no agarre `stripe` por accidente).
//   - `TAMPU_PLUS_LIFETIME_PRICE_USD` viene del env (default 29). Esto es
//     el precio "ancla" para mostrarle al user — el price real lo calcula
//     Stripe al crear la session (price_data inline, sin Product/Price
//     pre-configurados en Stripe Dashboard, para que cambiar el precio
//     sea sólo un env var).
//   - `formatLifetimePriceLocal()` convierte usando una rate fija de env
//     (USD_TO_ARS_RATE default 1200). No llamamos a un FX externo en este
//     sprint — la rate se rota manualmente cuando se desvía mucho.

// Tipo optional: `stripe` se carga vía require dinámico. Si la dep no está
// instalada, usamos `unknown` y los route handlers castean lo que necesiten.
// `@ts-expect-error` se valida si la dep está instalada (entonces el type
// existe) — TypeScript 5+ no se queja si justamente la dep está presente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stripe = any;

// ─── Constantes públicas ────────────────────────────────────────────────

const PRICE_FROM_ENV = Number(process.env.TAMPU_PLUS_PRICE_USD);

export const TAMPU_PLUS_LIFETIME_PRICE_USD: number =
  Number.isFinite(PRICE_FROM_ENV) && PRICE_FROM_ENV > 0 ? PRICE_FROM_ENV : 29;

export const TAMPU_PLUS_PRODUCT_KEY = "plus_lifetime" as const;

// ─── Singleton del SDK ──────────────────────────────────────────────────
//
// Importamos `stripe` con `require` perezoso. Si la dep no está instalada
// (deploy mínimo sin pagos), getStripeServer() devuelve null y los route
// handlers deben responder 503 con setup hint.

let cachedStripe: Stripe | null | undefined;

export function getStripeServer(): Stripe | null {
  if (cachedStripe !== undefined) return cachedStripe;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    cachedStripe = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const StripeMod = require("stripe") as new (key: string, cfg?: unknown) => any;
    // apiVersion: dejamos sin fijar → SDK usa la versión account-pinned.
    cachedStripe = new StripeMod(secret, {
      // Identifica este integration en los logs de Stripe.
      appInfo: { name: "Tampu", version: "0.1.0" },
    }) as Stripe;
    return cachedStripe;
  } catch (err) {
    // dep no instalada o init falla. Loguear y devolver null.
    // eslint-disable-next-line no-console
    console.warn("[billing/stripe] stripe SDK no disponible:", (err as Error).message);
    cachedStripe = null;
    return null;
  }
}

// ─── Formateo del precio en moneda local ────────────────────────────────
//
// Mostramos USD 29 con su equivalente local para que el user argentino/brasilero
// no tenga que abrir una calculadora. Conversión simple: rate fija por env.
// El cobro real es en USD via Stripe — esto es sólo display.

const USD_TO_ARS = (() => {
  const n = Number(process.env.USD_TO_ARS_RATE);
  return Number.isFinite(n) && n > 0 ? n : 1200;
})();

const USD_TO_BRL = (() => {
  const n = Number(process.env.USD_TO_BRL_RATE);
  return Number.isFinite(n) && n > 0 ? n : 5.3;
})();

export function formatLifetimePriceLocal(currency: string): string {
  const usd = TAMPU_PLUS_LIFETIME_PRICE_USD;
  const cur = currency.toUpperCase();

  if (cur === "USD") return `USD ${usd}`;
  if (cur === "ARS") {
    const ars = Math.round(usd * USD_TO_ARS);
    // Separador de miles `.` formato es-AR sin decimales para no marear.
    return `ARS ${ars.toLocaleString("es-AR")}`;
  }
  if (cur === "BRL") {
    const brl = Math.round(usd * USD_TO_BRL);
    return `BRL ${brl.toLocaleString("pt-BR")}`;
  }

  // Fallback: devolvemos USD si no reconocemos la moneda.
  return `USD ${usd}`;
}
