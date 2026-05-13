const es = {
  // ─── COMMON ───
  common: {
    appName: "Tampu",
    loading: "Cargando...",
    save: "Guardar",
    cancel: "Cancelar",
    delete: "Eliminar",
    edit: "Editar",
    add: "Agregar",
    close: "Cerrar",
    search: "Buscar...",
    filter: "Filtrar",
    all: "Todos",
    none: "Ninguno",
    yes: "Sí",
    no: "No",
    ok: "OK",
    back: "Volver",
    next: "Siguiente",
    viewAll: "Ver todos",
    noResults: "Sin resultados",
    confirm: "Confirmar",
    reset: "Restablecer",
    go: "Ir",
    start: "Iniciar",
    complete: "Completar",
    acknowledge: "Acusar recibo",
    dismiss: "Descartar",
    markReady: "Marcar listo",
    days: "días",
    day: "día",
    today: "Hoy",
    overdue: "Vencida",
    late: "atrasada",
    left: "restante",
    of: "de",
    used: "usado",
    remaining: "restante",
    onTrack: "En línea",
    overBy: "Excede en",
  },

  // ─── NAV ───
  // Tab bar nueva (mayo 2026): 5 destinos · Hoy · Viaje · Documentos · Dinero · Más.
  // Términos técnicos eliminados ("Cashflow" → "Dinero", "Dashboard/Panel" → solo en código).
  // Las rutas legacy se mantienen como sub-labels accesibles desde dentro de cada tab.
  nav: {
    today: "Hoy",
    trip: "Viaje",
    vault: "Documentos",
    money: "Dinero",
    journal: "Fotos",
    more: "Más",
    // Sub-routes (labels usadas dentro de cada tab)
    assistant: "Asistente",
    import: "Importar",
    trips: "Viajes",
    itinerary: "Itinerario",
    map: "Mapa",
    tasks: "Tareas",
    reservations: "Reservas",
    budget: "Presupuesto",
    expenses: "Gastos",
    split: "Compartido",
    visas: "Visas",
    packing: "Equipaje",
    health: "Salud",
    emergency: "SOS",
    alerts: "Alertas",
    settings: "Ajustes",
    profile: "Perfil",
    notifications: "Notificaciones",
    // Legacy claves mantenidas para back-compat de imports antiguos — no usar en UI nueva.
    dashboard: "Panel",
    cashflow: "Dinero",
    documents: "Documentos",
    decisions: "Decisiones",
    connections: "Conexiones",
    risk: "Riesgos",
    summary: "Resumen",
    book: "Libro",
  },

  // ─── AUTH ───
  auth: {
    signIn: "Iniciar sesión",
    signUp: "Registrarse",
    signOut: "Cerrar sesión",
    email: "Correo electrónico",
    password: "Contraseña",
    noAccount: "¿No tenés cuenta?",
    hasAccount: "¿Ya tenés cuenta?",
    enterDemo: "Entrar en modo demo",
    demoNote: "Demo usa almacenamiento local. No requiere backend.",
    or: "o",
    notConfigured: "No configurado",
    notConfiguredDesc: "Tampu necesita Supabase o modo demo para funcionar.",
    emailRequired: "Email y contraseña requeridos",
    subtitle: "Sistema personal de gestión de viajes",
  },

  // ─── DASHBOARD ───
  dashboard: {
    daysToGo: "Faltan",
    departs: "Sale",
    tripInProgress: "Viaje en curso",
    readiness: "Preparación",
    budgetUsed: "Presupuesto usado",
    available: "Disponible",
    forecast: "Pronóstico",
    spent: "Gastado",
    committed: "Comprometido",
    contingency: "Contingencia",
    tasks: "Tareas",
    reservations: "Reservas",
    completed: "completadas",
    confirmed: "confirmadas",
    critical: "Críticas",
    blockers: "Bloqueantes",
    readinessBreakdown: "Desglose de preparación",
    budgetByCategory: "Presupuesto por categoría",
    activeAlerts: "Alertas activas",
    upcomingTasks: "Próximas tareas",
    noActiveAlerts: "Sin alertas activas",
    nightsCovered: "Noches cubiertas",
    criticalPending: "Críticas pendientes",
    nowBang: "¡Ahora!",
  },

  // ─── TASKS ───
  tasks: {
    title: "Tareas",
    searchPlaceholder: "Buscar tareas...",
    allStatus: "Todos los estados",
    allCategories: "Todas las categorías",
    allPriorities: "Todas las prioridades",
    noTasksFound: "No se encontraron tareas",
    adjustFilters: "Probá ajustando los filtros",
    status: "Estado",
    criticality: "Criticidad",
    due: "Vence",
    stage: "Etapa",
    nextAction: "Siguiente acción",
    notes: "Notas",
    estCost: "Costo est.",
    blocker: "Bloqueante",
  },

  // ─── EXPENSES ───
  expenses: {
    title: "Gastos",
    total: "Total",
    entries: "registros",
    amount: "Monto",
    currency: "Moneda",
    description: "Descripción",
    whatDidYouPay: "¿Qué pagaste?",
    category: "Categoría",
    payment: "Pago",
    date: "Fecha",
    saveExpense: "Guardar gasto",
    noExpenses: "Sin gastos todavía",
    tapToAdd: "Tocá + para agregar",
  },

  // ─── BUDGET ───
  budget: {
    title: "Presupuesto",
    financialHealth: "Salud financiera",
    totalBudget: "Presupuesto total",
    totalSpent: "Total gastado",
    overall: "General",
    byCategory: "Por categoría",
  },

  // ─── RESERVATIONS ───
  reservations: {
    title: "Reservas",
    noReservations: "Sin reservas",
    useDate: "Fecha uso",
    locator: "Localizador",
    cancellation: "Cancelación",
    actionRequired: "Acción requerida",
  },

  // ─── ITINERARY ───
  itinerary: {
    title: "Itinerario",
    planned: "planificados",
    accommodationGaps: "noches sin alojamiento",
    noItinerary: "Sin itinerario",
    unassigned: "Sin asignar",
    checkIn: "Entrada",
    checkOut: "Salida",
    noAccommodation: "Sin alojamiento",
  },

  // ─── DOCUMENTS ───
  documents: {
    title: "Documentos y Requisitos",
    ready: "listos",
    criticalMissing: "críticos faltantes",
    needOffline: "necesitan copia offline",
    noDocuments: "Sin documentos",
    action: "Acción",
    digital: "Digital",
    offline: "Offline",
    validated: "Validado",
  },

  // ─── PACKING ───
  packing: {
    title: "Equipaje",
    packed: "empacado",
    essential: "esenciales",
    needPurchase: "por comprar",
    progress: "Progreso",
    needToBuy: "Por comprar",
  },

  // ─── ALERTS ───
  alerts: {
    title: "Alertas",
    total: "total",
    warnings: "advertencias",
    noAlerts: "Sin alertas",
    allClear: "¡Todo en orden!",
    dynamicNote: "Generadas desde los datos actuales. Resolvé el problema para eliminar la alerta.",
  },

  // ─── SETTINGS ───
  settings: {
    title: "Ajustes",
    configuration: "Configuración",
    dataMode: "Modo de datos",
    onlineMode: "Modo online",
    onlineDesc: "Datos persistidos en Supabase Postgres con RLS.",
    demoMode: "Modo demo",
    demoDesc: "Datos en almacenamiento local del navegador. No persisten entre dispositivos.",
    unconfigured: "No configurado",
    unconfiguredDesc: "Configurá Supabase o habilitá modo demo en .env.local",
    resetDemoData: "Restablecer datos demo",
    connectSupabase: "Conectar Supabase para persistencia real:",
    activeTrip: "Viaje activo",
    name: "Nombre",
    destination: "Destino",
    dates: "Fechas",
    language: "Idioma",
  },

  // ─── PROFILE ───
  profile: {
    title: "Perfil",
    subtitle: "Cuenta y preferencias",
    account: "Cuenta",
    preferences: "Preferencias",
    timezone: "Zona horaria",
    connectedToSupabase: "Modo online (Supabase)",
    demoModeLocal: "Modo demo (localStorage)",
  },

  // ─── TRIPS ───
  trips: {
    title: "Viajes",
    trip: "viaje",
    trips_plural: "viajes",
    noTrips: "Sin viajes todavía",
    createFirst: "Creá tu primer viaje",
    active: "Activo",
  },

  // ─── STATUS LABELS (visual only) ───
  status: {
    pending: "Pendiente",
    in_progress: "En progreso",
    waiting: "Esperando",
    done: "Completada",
    cancelled: "Cancelada",
    confirmed: "Confirmada",
    paid: "Pagada",
    booked: "Reservada",
    expired: "Expirada",
    ready: "Lista",
    packed: "Empacada",
    active: "Activa",
    empty: "Vacío",
    partial: "Parcial",
    planned: "Planificado",
    overdue: "Vencida",
  },

  // ─── PRIORITY LABELS ───
  priority: {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    critical: "Crítica",
  },

  // ─── CRITICALITY LABELS ───
  criticality: {
    nice_to_have: "Opcional",
    important: "Importante",
    essential: "Esencial",
    blocker: "Bloqueante",
  },

  // ─── FORMAT ───
  format: {
    dateLocale: "es-AR",
    currencyLocale: "es-AR",
    numberLocale: "es-AR",
  },

  // ─── VAULT ───
  vault: {
    title: "Documentos",
    subtitle: "Tus pases y documentos del viaje",
    upload: "Subir archivo",
    noFiles: "Sin archivos todavía",
    uploadFirst: "Subí tu primer documento",
    favorites: "Favoritos",
    critical: "Críticos",
    offlineReady: "Disponible offline",
    allFiles: "Todos los archivos",
    categories: {
      insurance: "Seguro",
      boarding_pass: "Boarding Pass",
      identity: "Identidad",
      reservation: "Reserva",
      transport: "Transporte",
      health: "Salud",
      receipt: "Comprobante",
      other: "Otro",
    },
  },

  // ─── JOURNAL ───
  journal: {
    title: "Diario",
    foodie: "Foodie",
    trip: "Viaje",
    attraction: "Atracción",
    stay: "Alojamiento",
    all: "Todo",
    photoMoment: "Momento del viaje",
    addedToDiary: "agregada al diario",
  },

  // ─── BUDGET CATEGORIES (label-only, value → label translation) ───
  // Spread across BUDGET_CATEGORIES constants. Code falls back to cat.label if a value is missing.
  budgetCategories: {
    flights: "Vuelos",
    accommodation: "Alojamiento",
    food: "Comida",
    transport: "Transporte interno",
    connectivity: "Conectividad",
    insurance: "Seguro",
    shopping: "Compras",
    activities: "Actividades y tours",
    photography: "Fotografía/Tech",
    fees: "Comisiones y cambios",
    contingency: "Contingencia",
    other: "Otros",
    visas: "Visas",
    health: "Salud",
  },

  // ─── WEATHER ───
  weather: {
    title: "Clima",
    forecast: "Pronóstico",
    rainExpected: "Lluvia esperada",
    heatWarning: "Calor extremo",
    coldWarning: "Frío extremo",
    rainProb: "Probabilidad de lluvia",
    high: "Máx",
    low: "Mín",
    uv: "UV",
    noData: "Sin datos de clima",
  },

  // ─── CURRENCY ───
  currency: {
    title: "Convertidor",
    convertTo: "Convertir a",
    rate: "Tipo de cambio",
    lastUpdate: "Última actualización",
    offlineRate: "Tasa offline (referencia)",
    blueRate: "Dólar blue",
    officialRate: "Dólar oficial",
  },

  // ─── PDF EXPORT ───
  pdfExport: {
    title: "Resumen en PDF",
    description: "Descargá un PDF con itinerario, reservas, presupuesto y contactos de emergencia.",
    button: "Descargar PDF",
    generating: "Generando…",
    success: "PDF generado",
    error: "No se pudo generar el PDF",
  },

  // ─── NOTIFICATIONS ───
  notifications: {
    title: "Notificaciones",
    noNotifications: "Sin notificaciones",
    markAllRead: "Marcar todas como leídas",
    unread: "sin leer",
    pushEnabled: "Push habilitado",
    pushDisabled: "Push deshabilitado",
    minSeverity: "Severidad mínima",
    quietHours: "Horario silencioso",
  },

  // ─── COMMAND CENTER (new) ───
  command: {
    daysShort: "d",
    lateShort: "tarde",
    tripMode: {
      planning: "Planificando",
      pre_departure: "Pre-salida",
      in_trip: "En viaje",
      return: "Vuelta",
      archived: "Archivado",
    },
    quickAccess: {
      title: "Acceso rápido",
      passport: "Pasaporte",
      insurance: "Seguro",
      nextFlight: "Próximo vuelo",
      bed: "Cama de hoy",
      emergency: "Emergencias",
      offline: "Offline",
      ready: "Listo",
      missing: "Falta",
    },
    today: {
      title: "Hoy",
      day: "Día",
      sleep: "Dormís en",
      activity: "Actividad",
      transport: "Traslado",
      estCost: "Costo estimado",
      dueToday: "vencen hoy",
      alertsToday: "alertas hoy",
      viewDay: "Ver día",
    },
    next7: {
      title: "Próximos 7 días",
      today: "Hoy",
      preTrip: "Pre-viaje",
      tripDay: "Día",
    },
    money: {
      title: "Dinero en vuelo",
      pending: "pendientes",
      next7: "7 días",
      next30: "30 días",
      total: "Total",
      viewAll: "Ver todos",
      noPayments: "Sin pagos próximos",
    },
    risk: {
      title: "Riesgos",
      allClear: "Todo en orden",
      openIssues: "issues abiertos",
      health: "Salud",
      documents: "Documentos",
      money: "Dinero",
      lodging: "Camas",
      transport: "Transporte",
    },
    decisions: {
      title: "Decisiones abiertas",
      subtitle: "Lo que requiere decisión, no operación",
      noDecisions: "Sin decisiones pendientes",
      viewAll: "Ver todas",
    },
    cashflow: {
      title: "Cashflow",
      spent: "Gastado",
      committed: "Comprometido",
      budget: "Presupuesto",
      burn: "Tasa diaria",
      perDay: "/día",
      payments: "Pagos próximos",
      daily: "Por día",
      cumulative: "Acumulado",
      vsBudget: "vs Presupuesto",
    },
    alertsCompact: {
      title: "Alertas",
      viewAll: "Ver todas",
      noAlerts: "Sin alertas",
    },
    sections: {
      readinessBreakdown: "Desglose de preparación",
    },
  },
} as const;

export default es;

// Recursive type that maps all leaf values to string
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type Dictionary = DeepStringify<typeof es>;
