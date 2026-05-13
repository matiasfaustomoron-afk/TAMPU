// ─── TRAVEL OS CONFIGURATION ───
// All configurable values live here. Nothing hardcoded in components.

export const APP_CONFIG = {
  name: "Tampu",
  version: "1.0.0",
  defaultCurrency: "USD",
  defaultTimezone: "America/Argentina/Buenos_Aires",
  alertDaysWarning: 7,
  alertDaysCritical: 3,
  budgetWarningThreshold: 80,
  budgetDangerThreshold: 95,
  contingencyMinPercent: 10,
} as const;

export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "KRW", symbol: "₩", name: "Korean Won" },
  { code: "PGK", symbol: "K", name: "Papua New Guinean Kina" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "ARS", symbol: "$", name: "Argentine Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "UYU", symbol: "$U", name: "Peso Uruguayo" },
  { code: "PYG", symbol: "₲", name: "Guaraní Paraguayo" },
  { code: "BOB", symbol: "Bs", name: "Boliviano" },
  { code: "VES", symbol: "Bs.S", name: "Bolívar Soberano" },
] as const;

export const TASK_STATUSES = [
  { value: "pending", label: "Pendiente", color: "gray" },
  { value: "in_progress", label: "En curso", color: "blue" },
  { value: "waiting", label: "Esperando", color: "yellow" },
  { value: "done", label: "Hecho", color: "green" },
  { value: "cancelled", label: "Cancelado", color: "red" },
] as const;

export const PRIORITIES = [
  { value: "low", label: "Baja", color: "gray", weight: 1 },
  { value: "medium", label: "Media", color: "blue", weight: 2 },
  { value: "high", label: "Alta", color: "orange", weight: 3 },
  { value: "critical", label: "Crítica", color: "red", weight: 4 },
] as const;

export const CRITICALITIES = [
  { value: "nice_to_have", label: "Lindo de tener", weight: 1 },
  { value: "important", label: "Importante", weight: 2 },
  { value: "essential", label: "Esencial", weight: 3 },
  { value: "blocker", label: "Bloqueante", weight: 4 },
] as const;

export const TASK_CATEGORIES = [
  { value: "flights", label: "Vuelos", icon: "Plane" },
  { value: "accommodation", label: "Alojamiento", icon: "Home" },
  { value: "transport", label: "Transporte", icon: "Train" },
  { value: "documentation", label: "Documentación", icon: "FileText" },
  { value: "health", label: "Salud", icon: "Heart" },
  { value: "insurance", label: "Seguro", icon: "Shield" },
  { value: "finance", label: "Finanzas", icon: "CreditCard" },
  { value: "connectivity", label: "Conectividad", icon: "Wifi" },
  { value: "packing", label: "Equipaje", icon: "Package" },
  { value: "activities", label: "Actividades", icon: "MapPin" },
  { value: "food", label: "Comida", icon: "UtensilsCrossed" },
  { value: "shopping", label: "Compras", icon: "ShoppingBag" },
  { value: "logistics", label: "Logística", icon: "Truck" },
  { value: "admin", label: "Admin", icon: "Settings" },
  { value: "other", label: "Otros", icon: "MoreHorizontal" },
] as const;

export const BUDGET_CATEGORIES = [
  { value: "flights", label: "Vuelos", icon: "Plane" },
  { value: "accommodation", label: "Alojamiento", icon: "Home" },
  { value: "food", label: "Comida", icon: "UtensilsCrossed" },
  { value: "transport", label: "Transporte interno", icon: "Train" },
  { value: "connectivity", label: "Conectividad", icon: "Wifi" },
  { value: "insurance", label: "Seguro", icon: "Shield" },
  { value: "shopping", label: "Compras", icon: "ShoppingBag" },
  { value: "activities", label: "Actividades y tours", icon: "MapPin" },
  { value: "photography", label: "Fotografía/Tech", icon: "Camera" },
  { value: "fees", label: "Comisiones y cambios", icon: "ArrowLeftRight" },
  { value: "contingency", label: "Contingencia", icon: "AlertTriangle" },
  { value: "other", label: "Otros", icon: "MoreHorizontal" },
] as const;

export const RESERVATION_TYPES = [
  { value: "flight", label: "Vuelo", icon: "Plane" },
  { value: "accommodation", label: "Alojamiento", icon: "Home" },
  { value: "train", label: "Tren", icon: "Train" },
  { value: "bus", label: "Bus", icon: "Bus" },
  { value: "tour", label: "Tour / Experiencia", icon: "MapPin" },
  { value: "insurance", label: "Seguro", icon: "Shield" },
  { value: "connectivity", label: "Conectividad", icon: "Wifi" },
  { value: "other", label: "Otros", icon: "MoreHorizontal" },
] as const;

export const RESERVATION_STATUSES = [
  { value: "pending", label: "Pendiente", color: "gray" },
  { value: "booked", label: "Reservado", color: "blue" },
  { value: "confirmed", label: "Confirmado", color: "green" },
  { value: "paid", label: "Pagado", color: "green" },
  { value: "cancelled", label: "Cancelado", color: "red" },
  { value: "expired", label: "Vencido", color: "red" },
] as const;

export const DOCUMENT_TYPES = [
  { value: "passport", label: "Pasaporte" },
  { value: "visa", label: "Visa" },
  { value: "insurance", label: "Seguro" },
  { value: "ticket", label: "Pasaje" },
  { value: "reservation", label: "Reserva" },
  { value: "receipt", label: "Recibo" },
  { value: "payment_method", label: "Método de pago" },
  { value: "medical", label: "Médico" },
  { value: "emergency_contact", label: "Contacto de emergencia" },
  { value: "address", label: "Dirección" },
  { value: "other", label: "Otros" },
] as const;

export const PAYMENT_METHODS = [
  { value: "credit_card_black", label: "Tarjeta de crédito (Black)" },
  { value: "credit_card_other", label: "Tarjeta de crédito (otra)" },
  { value: "debit_card", label: "Tarjeta de débito" },
  { value: "cash_usd", label: "Efectivo USD" },
  { value: "cash_local", label: "Efectivo local" },
  { value: "bank_transfer", label: "Transferencia" },
  { value: "points", label: "Puntos/Millas" },
  { value: "other", label: "Otros" },
] as const;

export const PACKING_CATEGORIES = [
  { value: "clothing", label: "Ropa" },
  { value: "toiletries", label: "Higiene" },
  { value: "electronics", label: "Electrónica" },
  { value: "documents", label: "Documentos" },
  { value: "health", label: "Salud y meds" },
  { value: "gear", label: "Equipo de viaje" },
  { value: "photography", label: "Fotografía" },
  { value: "misc", label: "Varios" },
] as const;

export const TRIP_STAGES = [
  { value: "planning", label: "Planeando" },
  { value: "pre_departure", label: "Pre-salida" },
  { value: "transit", label: "En tránsito" },
  { value: "destination", label: "En destino" },
  { value: "return", label: "Regreso" },
  { value: "post_trip", label: "Post-viaje" },
] as const;

export const ALERT_TYPES = [
  { value: "task_overdue", label: "Task Overdue", severity: "red" },
  { value: "task_due_soon", label: "Task Due Soon", severity: "orange" },
  { value: "task_critical_not_started", label: "Critical Task Not Started", severity: "red" },
  { value: "task_blocker_pending", label: "Blocker Pending", severity: "red" },
  { value: "doc_expiring", label: "Document Expiring", severity: "orange" },
  { value: "doc_critical_missing", label: "Critical Doc Missing", severity: "red" },
  { value: "doc_no_offline", label: "Doc No Offline Copy", severity: "yellow" },
  { value: "night_uncovered", label: "Night Uncovered", severity: "red" },
  { value: "no_transport", label: "No Transport Defined", severity: "orange" },
  { value: "reservation_critical_pending", label: "Critical Reservation Pending", severity: "red" },
  { value: "reservation_unconfirmed", label: "Paid But Unconfirmed", severity: "orange" },
  { value: "payment_due_soon", label: "Payment Due Soon", severity: "orange" },
  { value: "budget_over_category", label: "Category Over Budget", severity: "orange" },
  { value: "forecast_exceeded", label: "Forecast Exceeded", severity: "red" },
  { value: "packing_essential_missing", label: "Essential Item Missing", severity: "red" },
  { value: "packing_not_purchased", label: "Item Not Purchased", severity: "orange" },
  { value: "itinerary_incomplete", label: "Itinerary Day Incomplete", severity: "yellow" },
  { value: "contingency_low", label: "Contingency Low", severity: "orange" },
  { value: "weather_warning", label: "Weather Warning", severity: "orange" },
  { value: "weather_storm", label: "Severe Weather", severity: "red" },
  { value: "weather_uv_extreme", label: "UV Extremo", severity: "orange" },
  { value: "weather_aqi_poor", label: "Calidad de aire pobre", severity: "orange" },
  { value: "weather_tropical_storm", label: "Tormenta tropical", severity: "red" },
] as const;

// Legacy export — la navegación real vive en `src/components/layout/app-layout.tsx` (5 tabs).
// Este array no se consume en runtime (verificado con Grep, mayo 2026); se mantiene como
// referencia histórica de rutas que existieron. Si una herramienta auto-genera links,
// debe leer de TABS en app-layout, no de acá.
export const NAV_ITEMS = [
  { href: "/today",        label: "Hoy",        icon: "Sun" },
  { href: "/itinerary",    label: "Viaje",      icon: "Plane" },
  { href: "/vault",        label: "Documentos", icon: "FolderClosed" },
  { href: "/expenses",     label: "Dinero",     icon: "Wallet" },
  { href: "/journal",      label: "Fotos",      icon: "Camera" },
] as const;

// Readiness weights live in src/lib/domain/readiness-score.ts
