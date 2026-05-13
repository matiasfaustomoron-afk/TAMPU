/**
 * Tampu — corpus de prueba de emails de confirmación reales (anonimizados).
 *
 * Cada fixture es un email plausible de un proveedor LatAm o global. Se usan en
 * los tests unitarios (`email-parser.test.ts`) para validar que la heurística
 * detecta al menos: carrier, type, idioma, y (cuando aplique) locator + fecha.
 *
 * IMPORTANTE: todos los datos (PNRs, números de vuelo, nombres) son inventados.
 * No copiar emails reales con PII al fixture.
 */

export interface EmailFixture {
  id: string;
  carrier: string;
  language: "es" | "pt" | "en" | "fr" | "it";
  expectedType: "flight" | "accommodation" | "train" | "bus" | "tour" | "insurance" | "connectivity" | "transfer" | "other";
  expectedMinBookings: number;
  raw: string;
}

export const SAMPLES: EmailFixture[] = [
  // ── 1. LATAM Airlines (es-AR, ARG → CHL ida y vuelta) ──
  {
    id: "latam-ar-roundtrip",
    carrier: "LATAM Airlines",
    language: "es",
    expectedType: "flight",
    expectedMinBookings: 2,
    raw: `LATAM Airlines
Confirmación de reserva

Código de reserva: QWERTY
Pasajero: Juan Perez

Vuelo 1
LATAM LA8064
Buenos Aires (EZE) → Santiago (SCL)
Salida: 12/08/2026 21:35
Llegada: 13/08/2026 00:05
Cabina: Economy

Vuelo 2
LATAM LA8033
Santiago (SCL) → Buenos Aires (EZE)
Salida: 22/08/2026 07:15
Llegada: 22/08/2026 09:30
Cabina: Economy

Total: USD 412.80
Estado: Confirmado
Política de cancelación: Tarifa no reembolsable, cambios con costo.`,
  },

  // ── 2. Gol Linhas Aéreas (pt-BR) ──
  {
    id: "gol-pt-br-single",
    carrier: "Gol",
    language: "pt",
    expectedType: "flight",
    expectedMinBookings: 1,
    raw: `Gol Linhas Aéreas

Confirmação de reserva — Código: ABC123

Passageiro: Maria Silva

Voo G3 1532
São Paulo (GRU) → Rio de Janeiro (GIG)
Saída: 15/09/2026 07:30
Chegada: 15/09/2026 08:35

Total: R$ 487,50
Status: Confirmado
Embarque até 30 minutos antes da saída.`,
  },

  // ── 3. Despegar (es-AR, multibooking: vuelo + hotel + seguro) ──
  {
    id: "despegar-multi",
    carrier: "Despegar",
    language: "es",
    expectedType: "flight",
    expectedMinBookings: 2, // al menos 2; vuelo + alojamiento
    raw: `Despegar.com
Tu paquete a Cancún está confirmado

Reserva #: DSP-9881
Email de contacto: ayuda@despegar.com

Vuelo 1
Aeroméxico AM 0696
Buenos Aires (EZE) → Cancún (CUN)
Salida: 03/11/2026 19:40
Llegada: 04/11/2026 04:15
Confirmado

Vuelo 2
Aeroméxico AM 0697
Cancún (CUN) → Buenos Aires (EZE)
Salida: 12/11/2026 23:55
Llegada: 13/11/2026 10:40
Confirmado

Hotel
Riu Caribe (Cancún Hotel Zone)
Check-in: 04/11/2026
Check-out: 12/11/2026
Total: USD 1,840.00`,
  },

  // ── 4. Airbnb (es genérico, accommodation) ──
  {
    id: "airbnb-es",
    carrier: "Airbnb",
    language: "es",
    expectedType: "accommodation",
    expectedMinBookings: 1,
    raw: `Airbnb
Tu reserva está confirmada

Código de confirmación: HMTREK29
Anfitrión: Carolina

Casa entera · Palermo Soho, Buenos Aires
Check-in: 2026-12-20 15:00
Check-out: 2026-12-27 11:00
Huéspedes: 2

Total: ARS 295.000,00
Política de cancelación: Moderada — reembolso completo hasta 5 días antes.`,
  },

  // ── 5. Booking.com (en, hotel) ──
  {
    id: "booking-en",
    carrier: "Booking.com",
    language: "en",
    expectedType: "accommodation",
    expectedMinBookings: 1,
    raw: `Booking.com
Your booking is confirmed

Confirmation number: 4523891
PIN: 3471

Hotel Pulitzer Buenos Aires
Maipú 907, Buenos Aires
Check-in: Aug 10, 2026
Check-out: Aug 14, 2026
Room: Deluxe Queen
Guests: 2

Total: USD 612.40
Free cancellation until Aug 6, 2026.`,
  },

  // ── 6. Heymondo (insurance, es) ──
  {
    id: "heymondo-insurance",
    carrier: "Other",
    language: "es",
    expectedType: "insurance",
    expectedMinBookings: 1,
    raw: `Heymondo
Tu póliza de viaje está activa

Número de póliza: HMD-AR-77231
Cobertura: Top
Países: Chile, Argentina

Inicio: 12/08/2026
Fin: 22/08/2026
Asistencia 24/7: +54 11 5984 0011

Total: USD 47.20
Estado: Pagado`,
  },

  // ── 7. Transfer voucher por WhatsApp (es, formato raro) ──
  {
    id: "transfer-whatsapp",
    carrier: "Other",
    language: "es",
    expectedType: "transfer",
    expectedMinBookings: 1,
    raw: `Hola Juan, te confirmo el traslado.

Aeropuerto SCL → Hotel Pulitzer
Fecha: 13/08/2026
Hora: 01:00 AM (después de tu vuelo LA8064)

Chofer: Sergio · WhatsApp +56 9 5512 3344
Patente: AB-CD-12

Costo: CLP 35.000 (pagás al final)

Saludos!`,
  },

  // ── 8. Avianca (es-CO, vuelo Bogotá-Lima) ──
  {
    id: "avianca-co-single",
    carrier: "Avianca",
    language: "es",
    expectedType: "flight",
    expectedMinBookings: 1,
    raw: `Avianca
Tu reserva ha sido confirmada

Código de reserva: ZXC123
Pasajero: Carlos Rodríguez

Vuelo AV 245
Bogotá (BOG) → Lima (LIM)
Salida: 14/10/2026 06:15
Llegada: 14/10/2026 09:25

Total: COP 850.000
Estado: Confirmado
Tarifa promocional · no reembolsable.`,
  },

  // ── 9. Copa Airlines (es genérico, conexión Panamá) ──
  {
    id: "copa-pa-connection",
    carrier: "Copa Airlines",
    language: "es",
    expectedType: "flight",
    expectedMinBookings: 2,
    raw: `Copa Airlines
Confirmación de reserva — Localizador: VBNM45

Pasajero: Ana Gomez

Vuelo 1
Copa CM 387
Buenos Aires (EZE) → Panamá (PTY)
Salida: 22/09/2026 23:55
Llegada: 23/09/2026 04:50

Vuelo 2
Copa CM 226
Panamá (PTY) → Ciudad de México (MEX)
Salida: 23/09/2026 09:35
Llegada: 23/09/2026 12:00

Total: USD 798.40
Estado: Confirmado`,
  },

  // ── 10. JetSmart (es-CL, low-cost) ──
  {
    id: "jetsmart-cl",
    carrier: "JetSmart",
    language: "es",
    expectedType: "flight",
    expectedMinBookings: 1,
    raw: `JetSmart Airlines
Confirmación de reserva

Código: JSM7890
Pasajero: Roberto Silva

Vuelo JA 401
Santiago (SCL) → Lima (LIM)
Salida: 05/12/2026 16:45
Llegada: 05/12/2026 19:20

Total: CLP 89.990
Estado: Pagado
Recordá: equipaje de mano hasta 7kg incluido. Bodega con costo aparte.`,
  },

  // ── 11. Almundo paquete (es-AR, multibooking: vuelo + hotel) ──
  {
    id: "almundo-paquete",
    carrier: "Almundo",
    language: "es",
    expectedType: "flight",
    expectedMinBookings: 2,
    raw: `Almundo.com
Confirmación de paquete vacacional

Reserva: ALM-2026-44219
Cliente: Laura Martínez

Vuelo 1
Aerolineas Argentinas AR 1306
Buenos Aires (AEP) → Bariloche (BRC)
Salida: 18/07/2026 08:20
Llegada: 18/07/2026 10:40

Vuelo 2
Aerolineas Argentinas AR 1311
Bariloche (BRC) → Buenos Aires (AEP)
Salida: 25/07/2026 19:00
Llegada: 25/07/2026 21:15

Hotel
Llao Llao Resort & Spa
Check-in: 18/07/2026
Check-out: 25/07/2026
Régimen: Media pensión

Total: ARS 1.450.000
Estado: Confirmado`,
  },

  // ── 12. Marriott (en, US chain) ──
  {
    id: "marriott-en",
    carrier: "Other",
    language: "en",
    expectedType: "accommodation",
    expectedMinBookings: 1,
    raw: `Marriott Bonvoy
Reservation Confirmation

Confirmation Number: 88491623
Member: Diana Tan

JW Marriott Marquis Miami
255 Biscayne Blvd Way
Miami, FL 33131

Check-in: October 12, 2026
Check-out: October 15, 2026
Room: King Deluxe
Guests: 2

Total: USD 1,247.85
Status: Confirmed
Cancel free until October 5.`,
  },

  // ── 13. Airalo eSIM (en, connectivity) ──
  {
    id: "airalo-esim",
    carrier: "Other",
    language: "en",
    expectedType: "connectivity",
    expectedMinBookings: 1,
    raw: `Airalo
Your eSIM is ready

Order: ARL-9821-LATAM
Plan: South America 5GB / 30 days
Activation code: LM89345-XYZ

Coverage: Argentina, Brazil, Chile, Peru, Colombia, Mexico
Validity: 2026-08-12 → 2026-09-11

Total: USD 28.00
Status: Paid
Install via Airalo app or scan QR.`,
  },

  // ── 14. AssistCard (es-AR, insurance) ──
  {
    id: "assistcard-ar",
    carrier: "Other",
    language: "es",
    expectedType: "insurance",
    expectedMinBookings: 1,
    raw: `Assist Card
Tu cobertura de viaje está activa

Número de póliza: AC-AR-998877
Plan: AC 250

Países cubiertos: Mundial excepto USA/Canadá
Inicio: 12/08/2026
Fin: 22/08/2026
Asistencia 24/7: 0800-555-1100 (Argentina)
Asistencia internacional: +54 11 4126 6666

Total: USD 89.50
Estado: Pagado`,
  },

  // ── 15. Iberia (es-ES, vuelo Madrid-BUE) ──
  {
    id: "iberia-es-es",
    carrier: "Iberia",
    language: "es",
    expectedType: "flight",
    expectedMinBookings: 1,
    raw: `Iberia
Confirmación de reserva — Localizador: KLMN77

Pasajero: Javier López

Vuelo IB 6845
Madrid (MAD) → Buenos Aires (EZE)
Salida: 28/11/2026 23:55
Llegada: 29/11/2026 08:30
Clase: Turista Plus

Total: EUR 845.00
Estado: Confirmado
Equipaje en bodega: 1 pieza 23 kg incluida.`,
  },
];
