// ─── Airport knowledge base ───
// Curated factual data per airport: terminals, gate prefixes, food spots,
// currency exchange, lounges, transport from city. Used by the assistant to
// answer "where do I check in?", "where can I eat?", "where do I change money?".

export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  terminals: { id: string; airlines: string[]; notes?: string }[];
  food: { name: string; terminal?: string; airside: boolean; note: string }[];
  currency_exchange: { name: string; terminal?: string; note: string }[];
  lounges: { name: string; terminal: string; access: string }[];
  transport_to_city: { mode: string; cost_usd: string; duration_min: number; note: string }[];
  tips: string[];
  emergency: string | null;
}

export const AIRPORTS: AirportInfo[] = [
  // ─── DXB Dubai (Emirates hub) ───
  {
    iata: "DXB", name: "Dubai International", city: "Dubai", country: "UAE",
    lat: 25.253, lng: 55.366,
    terminals: [
      { id: "T3", airlines: ["Emirates", "Qantas"], notes: "Hub principal Emirates. Casi 2 km de largo — caminá rápido." },
      { id: "T1", airlines: ["Otras internacionales"] },
      { id: "T2", airlines: ["Flydubai", "regionales"] },
    ],
    food: [
      { name: "Marhaba Lounge food court", terminal: "T3", airside: true, note: "Disponible para Business+. Variedad media oriente + occidental." },
      { name: "Costa Coffee", terminal: "T3", airside: true, note: "En cada concourse, 24h." },
      { name: "Wagamama", terminal: "T3", airside: true, note: "Cerca de Gate B1-B30, comida asiática rápida." },
      { name: "Five Guys", terminal: "T3", airside: true, note: "Burgers, abierto 24h." },
    ],
    currency_exchange: [
      { name: "Travelex T3 (post-security)", terminal: "T3", note: "Mejor tasa post-immigration. Comparar con ATM HSBC/Emirates NBD." },
      { name: "ATM HSBC", terminal: "T3", note: "Sacar AED con DCC OFF (decline dynamic currency conversion)." },
    ],
    lounges: [
      { name: "Emirates Business Lounge", terminal: "T3", access: "Business/First Emirates, Skywards Platinum" },
      { name: "Marhaba Lounge", terminal: "T3", access: "USD 75 walk-in o con Priority Pass" },
      { name: "Plaza Premium Lounge", terminal: "T1/T3", access: "Priority Pass / pago directo" },
    ],
    transport_to_city: [
      { mode: "Metro Red Line", cost_usd: "USD 2", duration_min: 35, note: "5am-12am, lejos del centro pero económico" },
      { mode: "Taxi", cost_usd: "USD 15-25", duration_min: 25, note: "Cream/silver taxis oficiales. Ignorar limousine vendors." },
      { mode: "Uber/Careem", cost_usd: "USD 10-20", duration_min: 25, note: "Pickup zone P3 (T3) o P1 (T1)" },
    ],
    tips: [
      "DXB T3 tiene un duty-free enorme — entrar 2h antes del vuelo es seguro, no antes",
      "Free WiFi sin límite. Conectar con número de pasaporte o pasaje",
      "Si tu layover es >5h: lounge o salir del aeropuerto (visa-free AR 90 días)",
      "Calor extremo jun-sep: el aeropuerto es la única zona donde podés estar afuera tranquilo",
    ],
    emergency: "+971 4 224 5555 (DXB Information)",
  },

  // ─── MNL Manila (PAL hub) ───
  {
    iata: "MNL", name: "Ninoy Aquino International", city: "Manila", country: "Filipinas",
    lat: 14.512, lng: 121.020,
    terminals: [
      { id: "T1", airlines: ["Emirates", "Qatar", "internacionales no-PAL"] },
      { id: "T2", airlines: ["Philippine Airlines (PAL) internacional + doméstico"], notes: "Acá embarcás PAL PR215 a POM." },
      { id: "T3", airlines: ["Cebu Pacific internacional"] },
      { id: "T4", airlines: ["domésticos pequeños"] },
    ],
    food: [
      { name: "Jollibee", terminal: "T2/T3", airside: false, note: "Cadena local — probá chicken joy + halo-halo. Landside." },
      { name: "Bo's Coffee", terminal: "T1/T3", airside: true, note: "Café filipino, mejor que Starbucks acá." },
      { name: "Café Adriatico", terminal: "T3", airside: true, note: "Sándwiches y pasta, 24h." },
    ],
    currency_exchange: [
      { name: "Mabuhay Lounge / Bank counters", terminal: "T2", note: "ATM > exchange counter. BPI/BDO ATMs dan mejor tasa." },
      { name: "Travelex", terminal: "T1", note: "Tasa peor pero abierto 24h." },
    ],
    lounges: [
      { name: "Mabuhay Lounge", terminal: "T2", access: "PAL Business+, Mabuhay Miles Premier Elite" },
      { name: "PAGSS Lounge", terminal: "T1/T3", access: "Priority Pass USD 32 walk-in" },
    ],
    transport_to_city: [
      { mode: "Grab (taxi app)", cost_usd: "USD 8-15", duration_min: 30, note: "Mejor opción. Pickup designado en arrivals." },
      { mode: "Yellow taxi airport", cost_usd: "USD 10-18", duration_min: 30, note: "Tarifa fija. Pedí recibo." },
      { mode: "P2P Bus", cost_usd: "USD 5", duration_min: 60, note: "A Makati o BGC, sale del Terminal 3" },
    ],
    tips: [
      "MNL tiene 4 terminales SEPARADAS sin shuttle interno fácil — 30-45 min entre T1 y T2",
      "Si tu vuelo entrante es T1 (Emirates) y salís T2 (PAL): pedí transfer asistido al confirmar el ticket",
      "WiFi gratis pero pide número de pasaporte. Conexión irregular.",
      "Llegada nocturna: NO uses 'guides' que te ofrecen taxi a la salida. Solo Grab oficial.",
    ],
    emergency: "+63 2 8877-1109 (NAIA Operations)",
  },

  // ─── POM Port Moresby ───
  {
    iata: "POM", name: "Jacksons International", city: "Port Moresby", country: "Papúa Nueva Guinea",
    lat: -9.443, lng: 147.219,
    terminals: [
      { id: "International", airlines: ["PAL", "Air Niugini", "Qantas"], notes: "Un solo edificio. Internacional + doméstico separados por pasillo." },
    ],
    food: [
      { name: "Cafe at departures", airside: true, note: "Pan, sándwich, café. Caro. Llevá snacks." },
    ],
    currency_exchange: [
      { name: "Bank South Pacific (BSP) counter", note: "Mejor cambiar acá USD → PGK. Highlands NO tiene ATM confiable." },
    ],
    lounges: [{ name: "Paga Hill Lounge", terminal: "International", access: "Priority Pass / Business" }],
    transport_to_city: [
      { mode: "Hotel pickup", cost_usd: "incluido", duration_min: 25, note: "ÚNICA opción segura. Hilton/Stanley/Holiday Inn organizan." },
      { mode: "Taxi", cost_usd: "USD 20-40", duration_min: 25, note: "NO recomendado para viajeros sin contacto local." },
    ],
    tips: [
      "POM tiene reputación de seguridad limitada — NO te quedes solo en el lobby. Pickup directo a hotel.",
      "Llevá pasaporte + visa impresa. Migración revisa duro.",
      "Cash USD: aceptan en hoteles, pero AYUDA tener PGK también.",
      "Llamadas internacionales caras desde el aeropuerto. Comprar SIM Digicel afuera, no en arrivals (más cara).",
    ],
    emergency: "112 / +675 7298 0000 (PNG Police HQ)",
  },

  // ─── ICN Seoul Incheon ───
  {
    iata: "ICN", name: "Incheon International", city: "Seúl", country: "Corea del Sur",
    lat: 37.460, lng: 126.440,
    terminals: [
      { id: "T1", airlines: ["Star Alliance + oneworld no-Korean"], notes: "La mayoría de vuelos internacionales." },
      { id: "T2", airlines: ["Korean Air", "SkyTeam"], notes: "Más nuevo, mejor diseño." },
    ],
    food: [
      { name: "Korean Air Catering Center foodcourt", terminal: "T1/T2", airside: true, note: "Bibimbap, bulgogi, kimchi jjigae a precios decentes" },
      { name: "Sulbing", terminal: "T1", airside: true, note: "Bingsu (hielo coreano postre)" },
      { name: "Paris Baguette", terminal: "T1/T2", airside: true, note: "Café + pastelería, 24h" },
      { name: "Burger King", terminal: "T1", airside: true, note: "Para los que necesitan lo familiar" },
    ],
    currency_exchange: [
      { name: "KEB Hana Bank", terminal: "T1/T2", note: "Tasa OK. Mejor cambiar AFUERA en Myeongdong (1-2% mejor)" },
      { name: "ATM Citibank/Standard Chartered", terminal: "T1", note: "Aceptan tarjetas extranjeras. Tasa de mercado." },
    ],
    lounges: [
      { name: "KAL Prestige Class Lounge", terminal: "T2", access: "Korean Air Business+, SkyTeam Elite" },
      { name: "Matina Lounge", terminal: "T1", access: "Priority Pass USD 32 walk-in" },
    ],
    transport_to_city: [
      { mode: "AREX Express Train", cost_usd: "USD 8", duration_min: 43, note: "Directo a Seoul Station. Más rápido y barato." },
      { mode: "AREX All-stop Train", cost_usd: "USD 4", duration_min: 60, note: "Para llegar a estaciones intermedias" },
      { mode: "Airport Limousine Bus", cost_usd: "USD 12", duration_min: 70, note: "A hoteles. Bus 6001 a Jongno." },
      { mode: "Taxi (estándar)", cost_usd: "USD 50-70", duration_min: 60, note: "Caro pero disponible 24h" },
    ],
    tips: [
      "ICN tiene jardín cultural + teatro tradicional GRATIS — buena opción si tu layover es 4h+",
      "T-Money card: comprala en el 7-Eleven del aeropuerto antes de tomar metro o bus",
      "WiFi gratis sin registro",
      "Si llegás de noche tarde: AREX deja de operar ~12am. Tomar bus o esperar al primero (5am)",
    ],
    emergency: "1577-2600 (Incheon Airport Info, multilingüe)",
  },

  // ─── GRU São Paulo Guarulhos ───
  {
    iata: "GRU", name: "Guarulhos International", city: "São Paulo", country: "Brasil",
    lat: -23.434, lng: -46.476,
    terminals: [
      { id: "T3", airlines: ["Emirates", "internacionales largo radio"], notes: "Más moderno. Acá salen y entran tus Emirates." },
      { id: "T2", airlines: ["LATAM internacional"] },
      { id: "T1", airlines: ["domésticos"] },
    ],
    food: [
      { name: "Brasileirinho", terminal: "T3", airside: true, note: "Buffet por kilo — comida real brasileña a precio decente" },
      { name: "Casa do Pão de Queijo", terminal: "T3", airside: true, note: "Pão de queijo + café — clásico" },
      { name: "Spoleto", terminal: "T3", airside: true, note: "Pasta rápida" },
    ],
    currency_exchange: [
      { name: "Cotação", terminal: "T3", note: "Mejor cambiar AFUERA en city center. Acá ~3-5% peor tasa." },
      { name: "ATM Banco do Brasil / Itaú", terminal: "T3", note: "Tarifa fija $10 USD por extracción internacional. Llevá USD cash mejor." },
    ],
    lounges: [
      { name: "GRU Lounge", terminal: "T3", access: "Priority Pass USD 47" },
      { name: "Emirates Lounge", terminal: "T3", access: "Emirates Business+" },
    ],
    transport_to_city: [
      { mode: "Airport Bus Express", cost_usd: "USD 12", duration_min: 60, note: "A Paulista / Tatuapé. Cómodo." },
      { mode: "Uber/99", cost_usd: "USD 20-35", duration_min: 45, note: "Tráfico variable: 60-90 min en hora pico" },
      { mode: "Taxi oficial", cost_usd: "USD 35-50", duration_min: 45, note: "Tarifa fija. Más caro que Uber." },
    ],
    tips: [
      "Migración brasileña en T3 puede tardar 60-90 min en pico. Llegá 3h antes para vuelos internacionales",
      "Tránsito Argentina → SP → Emirates: probablemente cambies de terminal. Verificá.",
      "Si dormís en aeropuerto: T3 tiene áreas con sillones, T2 también. Bastante seguro.",
      "Tomar agua de canilla = NO. Comprar embotellada o llevar.",
    ],
    emergency: "+55 11 2445-2945 (GRU Operations)",
  },
];

export function findAirportByIATA(iata: string): AirportInfo | null {
  return AIRPORTS.find(a => a.iata === iata.toUpperCase()) || null;
}

export function findNearestAirport(lat: number, lng: number, withinKm = 50): AirportInfo | null {
  let best: { airport: AirportInfo; dist: number } | null = null;
  for (const a of AIRPORTS) {
    const dist = haversineKm(lat, lng, a.lat, a.lng);
    if (dist > withinKm) continue;
    if (!best || dist < best.dist) best = { airport: a, dist };
  }
  return best?.airport || null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Common traveler questions answered by airport context
export const TRAVELER_QUESTIONS = [
  "¿Qué tengo que hacer ya?",
  "¿Cuál es el mayor riesgo abierto?",
  "¿Estoy bien de presupuesto?",
  "¿Está todo listo para salir?",
  "¿En qué terminal embarco?",
  "¿Dónde puedo comer en el aeropuerto?",
  "¿Dónde cambio dinero?",
  "¿Cómo llego del aeropuerto al centro?",
  "¿Qué lounge puedo usar?",
  "¿Dame mi próximo boarding pass?",
  "¿Cuáles son mis docs críticos sin copia offline?",
  "¿Qué pago me vence en los próximos 7 días?",
] as const;
