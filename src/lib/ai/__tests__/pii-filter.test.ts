import { describe, it, expect } from "vitest";
import { maskPII, containsPII } from "../pii-filter";

// Tests para el filtro PII pre-LLM. Cubre los casos típicos de over-masking
// que vimos en producción (iter 2): order IDs / locators tratados como CC,
// DNI con puntos no detectado, CUIT con prefijo inválido falso-positivo.

describe("maskPII / containsPII", () => {
  it("enmascara tarjeta de crédito con espacios (4-4-4-4)", () => {
    const input = "Mi tarjeta es 1234 5678 9012 3456 y vence en 12/28.";
    const out = maskPII(input);
    expect(out).toContain("[CARD]");
    expect(out).not.toContain("1234 5678 9012 3456");
  });

  it("enmascara tarjeta de crédito con guiones (4-4-4-4)", () => {
    const input = "Card: 1234-5678-9012-3456";
    const out = maskPII(input);
    expect(out).toContain("[CARD]");
    expect(out).not.toContain("1234-5678-9012-3456");
  });

  it("enmascara tarjeta de crédito pelada (16 dígitos) cuando hay label", () => {
    const input = "tarjeta 1234567890123456 expira 11/29";
    const out = maskPII(input);
    expect(out).toContain("[CARD]");
    expect(out).not.toContain("1234567890123456");
  });

  it("NO enmascara order IDs largos sin label de tarjeta (false-positive guard)", () => {
    // Antes el regex \b\d{13,16}\b matcheaba esto como CC y rompía la
    // extracción de números de reserva.
    const input = "Reserva 1234567890123 confirmada para mañana.";
    const out = maskPII(input);
    expect(out).not.toContain("[CARD]");
    expect(out).toContain("1234567890123");
  });

  it("enmascara DNI con puntos y label", () => {
    const input = "DNI 35.123.456 emitido en 2010.";
    const out = maskPII(input);
    expect(out).toContain("[DNI]");
    expect(out).not.toContain("35.123.456");
  });

  it("enmascara DNI sin puntos con label", () => {
    const input = "DNI: 35123456 emitido en 2010.";
    const out = maskPII(input);
    expect(out).toContain("[DNI]");
    expect(out).not.toContain("35123456");
  });

  it("enmascara CUIT con prefijo válido (20)", () => {
    const input = "CUIT 20-12345678-9 facturación";
    const out = maskPII(input);
    expect(out).toContain("[CUIT]");
    expect(out).not.toContain("20-12345678-9");
  });

  it("NO enmascara CUIT con prefijo inválido (99)", () => {
    // Antes el regex \b\d{2}-\d{8}-\d\b matcheaba prefijos inexistentes (99)
    // como CUIT — false positive en números random con shape similar.
    const input = "Código interno 99-12345678-9 sistema legacy.";
    const out = maskPII(input);
    expect(out).not.toContain("[CUIT]");
    expect(out).toContain("99-12345678-9");
  });

  it("NO enmascara PNR / locator sin label (preserva confirmation codes)", () => {
    // Los locators tipo ABC123456 son frecuentes en emails de aerolíneas;
    // sin label "passport"/"documento", el filtro NO debe tocarlos.
    const input = "Tu localizador es ABC123456 — confirmá el vuelo.";
    const out = maskPII(input);
    expect(out).not.toContain("[ID]");
    expect(out).toContain("ABC123456");
  });

  it("enmascara passport con label precedente", () => {
    const input = "passport ABC123456 válido hasta 2030.";
    const out = maskPII(input);
    expect(out).toContain("[ID]");
    expect(out).not.toContain("ABC123456");
  });

  it("containsPII detecta tarjeta con espacios", () => {
    expect(containsPII("pagó con 4111 1111 1111 1111")).toBe(true);
  });

  it("containsPII devuelve false si no hay PII", () => {
    expect(containsPII("Hola, te paso el itinerario del viaje.")).toBe(false);
  });

  it("maskPII es idempotente: aplicar dos veces da el mismo resultado", () => {
    const input = "DNI 35.123.456 y tarjeta 4111-1111-1111-1111";
    const once = maskPII(input);
    const twice = maskPII(once);
    expect(twice).toBe(once);
  });

  it("enmascara CBU argentino (22 dígitos consecutivos)", () => {
    const input = "Transferí a CBU 0170099220000067797370 antes del viernes.";
    const out = maskPII(input);
    expect(out).toContain("[CBU]");
    expect(out).not.toContain("0170099220000067797370");
  });

  it("enmascara IBAN europeo (formato ES + dígitos + alfanumérico)", () => {
    const input = "Mi IBAN es ES9121000418450200051332 para el pago.";
    const out = maskPII(input);
    expect(out).toContain("[IBAN]");
    expect(out).not.toContain("ES9121000418450200051332");
  });
});
