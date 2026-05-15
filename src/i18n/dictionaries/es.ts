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
    ok: "Aceptar",
    back: "Volver",
    next: "Siguiente",
    viewAll: "Ver todos",
    noResults: "Sin resultados",
    confirm: {
      // Genéricos para ConfirmSheet (reemplaza window.confirm).
      cancel: "Cancelar",
      default: "Confirmar",
      deleteAction: "Eliminar",
    },
    reset: "Restablecer",
    go: "Ir",
    start: "Iniciar",
    complete: "Completar",
    acknowledge: "Visto",
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
    onTrack: "Al día",
    overBy: "Excede en",
    noActiveTrip: "Sin viaje activo",
    share: "Compartir",
    fabs: {
      more: "Más opciones",
      addExpense: "Agregar gasto",
      assistant: "Abrir asistente",
    },
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
    journal: "Diario",
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
    email: "Email",
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
    daysToGo: "Faltan días",
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
    tapHint: "Tocá para detalle",
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
    eyebrow: "Notificaciones del viaje",
    tripUnderControl: "No hay alertas activas. Tu viaje está bajo control.",
    criticasShort: "Críticas",
    avisos: "Avisos",
    info: "Info",
    viewAll: "Ver todas",
    activeAlerts: { one: "alerta activa", other: "alertas activas" },
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
    edit: {
      back: "Volver",
      title: "Editar viaje",
      sectionDataTitle: "Datos del viaje",
      name: "Nombre",
      destination: "Destino",
      startDate: "Llegada",
      endDate: "Regreso",
      budget: "Presupuesto",
      currency: "Moneda",
      status: "Estado",
      statusPlanning: "Planificando",
      statusActive: "En curso",
      statusCompleted: "Completado",
      statusArchived: "Archivado",
      notes: "Notas",
      save: "Guardar cambios",
      saving: "Guardando…",
      cancel: "Cancelar",
    },
  },

  // ─── VISAS ───
  visas: {
    title: "Visas",
    passport: "Pasaporte",
    destinations: "destinos",
    openActions: "Acciones abiertas",
    totalCost: "Costo total",
    maxLead: "Lead máximo",
    beforeTrip: "antes del viaje",
    maxStay: "Estadía max",
    cost: "Costo",
    lead: "Lead",
    applyOnline: "Aplicar online",
    docLoaded: "doc cargado",
    verified: "Verificado",
    noDataTitle: "No tengo datos de visa para estos países",
    noDataDescription: "Cargá ciudades con country reconocido.",
    emptyTitle: "Cargá ciudades para ver visas",
    sourcesNote:
      'Datos verificados contra Wikipedia "Visa requirements for Argentine citizens" e ICA PNG en mayo 2026. Política migratoria cambia: confirmá con la embajada antes de aplicar.',
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
  // Decisión auditor mayo 2026: "Vault" se mantiene como brand-name interno
  // (component names, vars, routes /vault) pero TODA UI visible al user dice
  // "Documentos". El target premium tradicional (50+, viajero argentino
  // clásico) lee "Vault" como anglicismo opaco; "Documentos" comunica el job
  // sin pérdida de premium-feel.
  //
  // "Boarding pass" se unifica a "Pase de embarque" en UI español. La var-name
  // `boarding_pass` se mantiene (es un enum técnico estable), solo cambia el
  // label visible. En el dict EN se conserva "Boarding Pass" — es el término
  // correcto y reconocible internacionalmente.
  //
  // "Pases destacados" / "pases" como término corto está OK en headers — es
  // español natural y consistente con MARKETING.md ("Tus pases como cards").
  vault: {
    title: "Documentos",
    subtitle: "Tus pases y documentos del viaje",
    upload: "Subir documento",
    uploadFirst: "Subir tu primer documento",
    uploadSheetTitle: "Subir documento",
    ariaLabel: "Documentos del viaje",
    name: "Nombre",
    category: "Categoría",
    notes: "Notas",
    classifyAI: "Clasificar con IA",
    analyzing: "Analizando...",
    autoLinkTo: "Auto-vinculará a",
    retentionFaq: "¿Cuánto duran mis archivos?",
    locationShort: "Ubicación:",
    noFiles: "Sin archivos todavía",
    favorites: "Favoritos",
    critical: "Críticos",
    offlineReady: "Disponible offline",
    allFiles: "Todos los archivos",
    // Label visible para "documentos destacados / pases" — usado en /vault.
    featuredPasses: "Pases destacados",
    tapToOpen: "Tocá un pase para abrirlo",
    uploadHint: "Subí tu pase de embarque, pasaporte o seguro. PDF o imagen.",
    namePlaceholder: "Ej. Pase de embarque GRU→DXB",
    expiresAt: "Fecha de vencimiento",
    expiresAtHint: "Visa, pasaporte, seguro",
    boardingPass: "Pase de embarque",
    boardingPasses: "Pases de embarque",
    orphanBoardings: "Pases sin vincular a reserva",
    attachBoardingPass: "Adjuntar pase de embarque",
    categories: {
      insurance: "Seguro",
      boarding_pass: "Pase de embarque",
      identity: "Identidad",
      reservation: "Reserva",
      transport: "Transporte",
      health: "Salud",
      receipt: "Comprobante",
      other: "Otro",
    },
    attach: {
      savedToVault: "guardado en Cartera",
      deleted: "Documento eliminado",
      attachAnother: "Adjuntar otro",
      attachPdfImage: "Adjuntar PDF / imagen",
      offlineFooter: "Se guarda offline en tu Cartera y queda asociado a este",
      itemReservation: "ítem",
      itemRecord: "registro",
    },
  },

  // ─── MEMBERS (compartir viaje) ───
  members: {
    roles: {
      owner: "Dueño",
      editor: "Editor",
      viewer: "Visor",
    },
  },

  // ─── COMMENTS ───
  comments: {
    commentCount: { one: "comentario", other: "comentarios" },
    commentEmpty: "Comentar",
    hideResolved: "Ocultar resueltos",
    showResolved: { one: "Mostrar {count} resuelto", other: "Mostrar {count} resueltos" },
    placeholder: "Escribí un comentario…",
    addPlaceholder: "Agregar comentario…",
    replyTo: "Responder a {name}…",
    reply: "responder",
    cancel: "cancelar",
    resolvedBy: "Resuelto",
    resolvedByName: "Resuelto por {name}",
    deletePrompt: "¿Eliminar este comentario?",
    aria: {
      react: "Reaccionar",
      reactWith: "Reaccionar {emoji}",
      reopen: "Reabrir",
      resolve: "Resolver",
      delete: "Eliminar",
      send: "Enviar",
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
    printBook: {
      bindings: {
        softcover: "Tapa blanda",
        hardcover: "Tapa dura",
        lay_flat: "Lay-flat premium",
      },
      defaultTitlePrefix: "Mi viaje a",
    },
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
      preTrip: "Antes del viaje",
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
      openIssues: "Asuntos pendientes",
      health: "Salud",
      documents: "Documentos",
      money: "Dinero",
      lodging: "Camas",
      transport: "Transporte",
    },
    decisions: {
      title: "Decisiones abiertas",
      subtitle: "Cosas que tenés que decidir",
      noDecisions: "Sin decisiones pendientes",
      viewAll: "Ver todas",
    },
    cashflow: {
      title: "Flujo de dinero",
      spent: "Gastado",
      committed: "Comprometido",
      budget: "Presupuesto",
      burn: "Gasto por día",
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

  // ─── TODAY (Iter 4) ───
  // Strings para /today: eyebrows, quick-chips, plurales (días/cosas),
  // empty state (NoTripEmpty) y quickStats card.
  today: {
    eyebrows: {
      focus: "Lo que importa ahora",
      attention: "Atención",
      quickAccess: "A un toque",
      nextTransfer: "Próximo traslado",
      whereSleep: "Dónde dormís",
    },
    quickChips: {
      documents: "Documentos",
      import: "Importar",
      expense: "Gasto",
      sos: "SOS",
    },
    daysLeft: { one: "día", other: "días" },
    thingsLeft: { one: "cosa", other: "cosas" },
    empty: {
      eyebrow: "Empezá acá",
      title: "Tu próximo viaje",
      description: "Creá tu primer viaje y desbloqueá todo lo del Command Center.",
      cta: "Crear viaje",
    },
    quickStats: {
      daysToTrip: "Días hasta el viaje",
      flightsRemaining: "Vuelos restantes",
      docsToReview: "Docs por revisar",
      budget: "Presupuesto",
      inProgress: "En curso",
    },
  },

  // ─── CASHFLOW (Iter 4) ───
  // Status chips + chart labels para /cashflow. Complementa command.cashflow.*
  cashflow: {
    status: "Estado",
    pace: "Ritmo",
    ok: "OK",
    careful: "Cuidado",
    excess: "Excede",
    days: "Días",
    payments: "Pagos",
    dailySpend: "Gasto diario",
    cumulativeVsBudget: "Acumulado vs presupuesto",
    actual: "Real",
    budget: "Presupuesto",
    byDestination: "Por destino",
    pctOfTotal: "% del total",
    upcomingPayments: "Pagos próximos",
    byWeek: "Por semana",
    weekOf: "Semana del",
    expenses: "gastos",
    paymentsLower: "pagos",
  },

  // ─── WELCOME ───
  // Reescritura mayo 2026 (auditor red-team): se elimina founder-data del
  // hero/CTA/cards. Antes el welcome forzaba un viaje Papúa+Seúl como
  // ejemplo principal — confundía al nuevo user que no se identificaba con
  // esos destinos. Ahora el welcome es genérico: tagline corto, 3 cards
  // de "qué resuelve" concretas, CTA primario al wizard de viajes, demo
  // como secundario opcional. Voseo argentino, copy natural sin marketing.
  welcome: {
    eyebrow: "Tampu · La cartera de viaje",
    title: "Todo tu viaje,",
    titleItalic: "sin perder nada.",
    subtitle:
      "Tampu junta tus vuelos, hoteles, documentos y gastos en una sola pantalla. Funciona sin internet. Tus datos viven en tu dispositivo.",
    cards: {
      passes: {
        title: "Tus pases en una vista",
        body: "Reenviás el email de la aerolínea y aparece como pase en la app. Listo para Apple Wallet.",
      },
      vault: {
        title: "Bóveda cifrada",
        body: "Pasaporte, visas y seguros guardados en tu dispositivo, accesibles offline.",
      },
      money: {
        title: "Gastos sin cuentas raras",
        body: "Cargás un gasto en ARS, USD o BRL y la app hace la conversión. Sin sincronización por la nube.",
      },
    },
    primaryCta: "Cargar mi primer viaje",
    secondaryCta: "Ver demo (viaje de ejemplo)",
    pasteEmail: "o pegá un email para empezar",
    pills: {
      offline: "Offline",
      noAccounts: "Sin cuentas",
      noTracking: "Sin tracking",
      wallet: "Apple Wallet",
      languages: "Español",
    },
    demoConfirm: {
      title: "Ya tenés un viaje cargado",
      body: "Si entrás al demo, vamos a reemplazar el viaje actual con el de ejemplo. Tu viaje real no se borra del dispositivo si lo creaste con Supabase; en modo demo (localStorage) sí se sobrescribe. ¿Continuar?",
      accept: "Sí, entrar al demo",
      cancel: "No, quedarme en el mío",
    },
    demoToast: "Demo cargada · Papúa + Seúl 2026",
  },

  // ─── WHATSAPP (mayo 2026) ───
  // Diferenciador competitivo: ningún competidor LatAm tiene WhatsApp
  // ingestion. Strings en voseo argentino.
  whatsapp: {
    title: "WhatsApp",
    subtitle: "Reenviá confirmaciones a Tampu",
    description: "Reenviá confirmaciones (vuelos, hoteles, reservas, mensajes del host de Airbnb, vouchers de tour) por WhatsApp a Tampu y las agrego automáticamente a tu viaje. Funciona también con mensajes en portugués brasileño.",
    linkCTA: "Vincular WhatsApp",
    linkHint: "Te mandamos un código por WhatsApp. Respondé con el código en el mismo chat para confirmar.",
    pending: "Esperando que mandes el código por WhatsApp",
    pendingHint: "Te enviamos un mensaje por WhatsApp con un código de 6 dígitos. Respondé con el código en el mismo chat para terminar la vinculación. Vence en 10 minutos.",
    linked: "Vinculado",
    unlink: "Desvincular",
    unlinkConfirm: "¿Desvincular tu WhatsApp? Los mensajes que ya recibimos se mantienen, pero mensajes nuevos no se asocian a tu cuenta.",
    inboxTitle: "Mensajes WhatsApp",
    inboxEmpty: "Todavía no recibí mensajes. Mandá una confirmación de viaje al número Tampu para empezar.",
    inboxNoLink: "Vinculá tu WhatsApp con Tampu para empezar a recibir confirmaciones.",
    statusParsed: "Parseado",
    statusReceived: "Pendiente",
    statusFailed: "Error",
    statusIgnored: "Ignorado",
    filterAll: "Todos",
    filterParsed: "Parseados",
    filterReceived: "Pendientes",
    filterIgnored: "Ignorados",
    seeMessages: "Ver mensajes",
    phoneLabel: "Tu número (con código de país)",
    phonePlaceholder: "+54 9 11 4040 4040",
    refresh: "Refrescar",
    originalMessage: "Mensaje original",
    parsedData: "Datos parseados",
  },

  // ─── DEMO BANNER ───
  // Chip global superior visible mientras `tampu_demo_mode=true`. Se monta
  // en app-layout y se auto-oculta en /welcome + /passcode.
  demoBanner: {
    eyebrow: "Modo demo",
    message: "Estos datos son de demostración.",
    exit: "Salir del demo",
  },

  // ─── POLLS ───
  polls: {
    title: "Encuestas",
    subtitle: "Decidí con el grupo",
    emptyAllInactive: "Sin encuestas. ¿Hotel A o B? ¿Cena temprano o tarde? Decidí con el grupo.",
    emptyClosed: "Sin encuestas cerradas todavía.",
    emptyActive: "Sin encuestas activas.",
    emptyAll: "Sin encuestas todavía.",
    create: "Crear encuesta",
    closed: "Cerrada",
    deleted: "Encuesta eliminada",
    deletePrompt: "¿Eliminar la encuesta \"{question}\"?",
    voteCount: { one: "voto", other: "votos" },
    ariaDelete: "Eliminar encuesta",
    activity: {
      voted: "votó \"{option}\" en \"{question}\"",
    },
  },

  // ─── INBOX (per-trip email alias) ───
  inbox: {
    title: "Bandeja",
    subtitle: "Reenviá emails al alias del viaje",
    forwardHeader: "Tu dirección del viaje",
    forwardInstruction: "Reenviá emails de Booking, Aerolíneas, hoteles a la dirección de abajo",
    howTo: "Cómo reenviar",
    howToStep1: "Tocá los tres puntos del email en tu cliente de mail",
    howToStep2: "Elegí 'Reenviar'",
    howToStep3: "Pegá la dirección de abajo",
    copyAddress: "Copiar dirección",
    copied: "Dirección copiada al portapapeles",
    noClipboard: "Tu navegador no soporta copiar al portapapeles",
    emptyState: "Mandá tu primer email al alias de arriba",
    mailtoBody: "Reenviá tus emails de reservas acá",
    status: {
      imported: "Importado",
      failed: "Falló",
      discarded: "Descartado",
      pending: "Pendiente",
    },
  },

  // ─── PASSCODE ───
  passcode: {
    setup: {
      title: "Activar cifrado at-rest",
      description: "Tu vault de documentos quedará cifrado con un passcode. Si lo olvidás, perdés acceso permanente.",
      inputLabel: "Passcode (4+ palabras o 12+ caracteres)",
      confirmLabel: "Repetí passcode",
      activateButton: "Activar cifrado",
      activating: "Activando...",
      confirmDialog: "Si olvidás el passcode, no podemos recuperar tus documentos cifrados. ¿Continuar?",
      errorMismatch: "Los passcodes no coinciden",
      errorWeak: "Passcode muy débil. Usá 4+ palabras o 12+ chars (letras+números+símbolos).",
    },
    unlock: {
      title: "Desbloqueá tus documentos",
      description: "Ingresá tu passcode para acceder al vault.",
      unlockButton: "Desbloquear",
      unlocking: "Desbloqueando...",
      lockoutWait: "Esperá {seconds} antes de reintentar",
      errorWrong: "Passcode incorrecto",
    },
    manage: {
      title: "Cifrado activo",
      description: "Tu vault está cifrado. Podés cambiar el passcode o desactivar el cifrado.",
      changeButton: "Cambiar passcode",
      deactivateButton: "Desactivar cifrado",
      deactivating: "Desactivando...",
      lockButton: "Bloquear ahora",
    },
    wiped: {
      title: "Vault borrado",
      description: "Se borraron tus documentos cifrados por demasiados intentos fallidos.",
      startOverButton: "Empezar de nuevo",
    },
    strength: {
      label: "Fuerza del passcode",
      veryWeak: "Está muy débil",
      weak: "Débil",
      acceptable: "Aceptable",
      strong: "Fuerte",
      crackTime: "Te crackean en {time}",
      suggestion: "Sugerencia: {hint}",
    },
    time: {
      second: "segundo",
      seconds: "segundos",
      minute: "minuto",
      minutes: "minutos",
      hour: "hora",
      hours: "horas",
      day: "día",
      days: "días",
    },
  },

  // ─── HEALTH ───
  health: {
    title: "Salud y vacunas",
    subtitle: "Vacunas y profilaxis recomendadas según tus destinos",
    levels: { routine: "Rutina", recommended: "Recomendada", required: "Obligatoria", high_risk: "Alto riesgo" },
    statuses: { not_started: "Sin empezar", in_progress: "En curso", completed: "Completada", expired: "Vencida" },
    kpi: {
      pendingVaccines: "Vacunas pendientes",
      leadTime: "Lead time recomendado",
      malariaCountries: "Profilaxis malaria",
      countries: "Países",
    },
    malariaInfo: {
      title: "Profilaxis antimalárica",
      intro: "Países en tu viaje con riesgo:",
      bullet1: "Consultá con infectólogo antes del viaje (6-8 semanas)",
      bullet2: "Doxiciclina: USD 10-30, toma diaria, contraindicada embarazadas",
      bullet3: "Malarone: USD 100-200, mejor tolerada",
      bullet4: "Mefloquina: USD 30-60, semanal, no recomendada con depresión",
    },
    disclaimer: "Información orientativa. Consultá con tu médico/centro de vacunación antes de viajar.",
    emptyTitle: "No tengo perfiles de salud",
    emptyDescription: "Cargá ciudades a tu viaje para ver vacunas y profilaxis recomendadas.",
  },

  // ─── WALLET (Apple Wallet button) ───
  wallet: {
    button: "Agregar a Wallet",
    loading: "Generando...",
    certMissing: "Apple Wallet requiere certificado Apple Developer. Próximamente.",
    errorPrefix: "No se pudo generar el pase",
    downloadedToast: "Pase descargado — abrilo desde tus archivos para agregarlo a Wallet",
    ariaLabel: "Agregar reserva a Apple Wallet",
  },

  // ─── MORE (page) ───
  // Página /more — hub de navegación con todas las herramientas. Agrupado por
  // sección. Mantener paridad EN/ES para que el <IOSRow> renderice sin gaps.
  more: {
    title: "Más",
    subtitle: "Todas las herramientas",
    personalizeToday: "Personalizar Hoy",
    yourData: "Tus datos",
    theme: "Tema",
    appearance: "Apariencia",
    activity: "Actividad",
    versionTagline: "Tampu · v1.0 · La posta del viajero",
    sections: {
      asistente: "Asistente",
      diario: "Diario",
      viaje: "Viaje",
      colaborar: "Colaborar",
      dinero: "Dinero",
      documentos: "Documentos",
      antesDurante: "Antes y durante",
      canales: "Canales de ingesta",
      cuenta: "Cuenta",
    },
    items: {
      asistenteIA: "Asistente IA",
      asistenteIASub: "Preguntale lo que sea sobre tu viaje",
      fotos: "Fotos del viaje",
      fotosSub: "Capturá momentos · offline · con geotag",
      cambiarViaje: "Cambiar de viaje",
      cambiarViajeSub: "Ver todos / crear nuevo",
      compartirViaje: "Compartir viaje",
      compartirViajeSub: "Invitar compañeros · roles",
      mapa: "Mapa",
      mapaSub: "Ruta y POIs",
      reservas: "Reservas",
      reservasSub: "Tours, seguros, traslados",
      tareas: "Tareas",
      tareasSub: "Pendientes del viaje",
      encuestas: "Encuestas",
      encuestasSub: "Decidí con el grupo · A vs B vs C",
      actividad: "Actividad reciente",
      actividadSub: "Qué cambió en el viaje",
      presupuesto: "Presupuesto",
      presupuestoSub: "Plan vs real",
      movimiento: "Movimiento",
      movimientoSub: "Cuándo gastás",
      compartido: "Compartido",
      compartidoSub: "Quién paga qué",
      visas: "Visas",
      visasSub: "Requisitos por destino",
      salud: "Salud",
      saludSub: "Vacunas y certificados",
      equipaje: "Equipaje",
      equipajeSub: "Qué llevar",
      importar: "Importar",
      importarSub: "Pegá emails de confirmación",
      sos: "SOS",
      sosSub: "Emergencia por país",
      alertas: "Alertas",
      alertasSub: "Activas hoy",
      whatsapp: "WhatsApp",
      whatsappSub: "Mensajes parseados · vincular número",
      inbox: "Inbox",
      inboxSub: "Reenviá emails a Tampu",
      passcode: "Passcode",
      passcodeSub: "Cifrado at-rest de tus Documentos",
      perfil: "Perfil",
      ajustes: "Ajustes",
      ajustesSub: "Idioma, API key, mapa, ubicación",
    },
  },

  // ─── SPLIT (gastos compartidos) ───
  split: {
    title: "Compartido entre viajeros",
    sharedExpenses: "Compartidos",
    settlements: "Settlements",
    balanceByPerson: "Balance por persona",
    noTrip: "Sin viaje",
    createOrPickTrip: "Crear o elegir viaje",
    owes: "debe",
    owesTo: "le deben",
    algorithm: "Algoritmo: cada gasto compartido se reparte por igual. Calculamos balance neto por persona y emitimos el conjunto MÍNIMO de transferencias para que todos queden a cero (greedy creditor/debtor matching).",
    allSettled: "Todo cuadrado.",
    eyebrowShared: "Compartidos",
    eyebrowSettlements: "Settlements mínimos",
    people: "Personas",
    noSharedYet: "No hay gastos compartidos todavía",
    howTo: "Marcá un gasto como compartido en /expenses añadiendo en notas:",
    subtitleCount: "gastos compartidos",
    subtitleEmpty: "Sin gastos compartidos cargados",
  },

  // ─── MAP (page) ───
  map: {
    title: "Mapa del viaje",
    noCitiesLoaded: "No hay ciudades cargadas",
    loadCities: "Cargar ciudades",
    eyebrowRoute: "Ruta",
    eyebrowFlights: "Vuelos del viaje",
    noFlights: "Sin vuelos cargados",
    noCoords: "(sin coords)",
    nights: { one: "noche", other: "noches" },
    poisCurated: "POIs curados",
    trackingPointsSaved: "puntos de tracking GPS guardados localmente",
  },

  // ─── EMERGENCY extras ───
  emergency: {
    mentalReview: "Repaso mental",
  },

  // ─── SETTINGS extras ───
  settingsExtras: {
    locationGpsTitle: "Ubicación GPS (opcional)",
    locationOn: "Ubicación activada",
    locationOff: "Ubicación desactivada",
  },

  // ─── ADDRESS (display) ───
  address: {
    shareAriaLabel: "Compartir dirección",
    copyAriaLabel: "Copiar dirección",
    copied: "Copiado",
    copy: "Copiar",
    shareTitle: "Mi dirección Tampu",
  },

  // ─── SYNC INDICATOR ───
  sync: {
    synced: "Sincronizado",
    syncing: "Sincronizando…",
    offline: "Sin conexión",
    local: "Local",
    tooltips: {
      synced: "Tus datos están sincronizados con la nube",
      syncing: "Refrescando datos de la nube",
      offline: "Sin red — los cambios se guardan local y suben cuando vuelva conexión",
      local: "Tus datos viven solo en este dispositivo (modo demo)",
    },
    ariaLabel: "Estado de sincronización",
  },

  // ─── POLLS.CREATE (sheet) ───
  pollsCreate: {
    title: "Nueva encuesta",
    question: "Pregunta",
    questionPlaceholder: "¿Hotel A o B? ¿Vamos al museo o al parque?",
    options: "Opciones",
    addOption: "+ agregar",
    optionPlaceholder: "Opción",
    detailOptional: "Detalle (opcional)",
    removeAria: "Quitar opción",
    deadlineOptional: "Deadline (opcional)",
    deadlineHint: "Después del deadline la encuesta se cierra automáticamente.",
    submit: "Crear encuesta",
    createTrigger: "Crear encuesta",
    createCompact: "Encuesta",
    validationMinTwo: "Pregunta y al menos 2 opciones",
    successToast: "Encuesta creada",
  },

  // ─── COMMAND.quickExpense (fab) ───
  commandQuickExpense: {
    title: "Gasto rápido",
    optional: "(opcional)",
    ariaLabel: "Agregar gasto",
    ctaShort: "Agregar gasto rápido",
    defaultDescription: "Gasto rápido",
    hint: "Fecha = hoy · TC = 1.00 (editá en /expenses si necesitás precisión)",
  },

  // ─── IMPORT (paste-email flow) ───
  import: {
    bandejaPerTripTitle: "Bandeja del viaje",
    bandejaPerTripBody: "Reenviá confirmaciones a la dirección única del viaje y aparecen acá.",
    openInbox: "Abrir →",
    pasteHelper: "Pegá un email de confirmación (LATAM, Despegar, Booking, Airbnb…)",
    detectReservas: "Detectar reservas",
    importedTitle: "¡Listo!",
    importedBody: "Tu reserva ya está en el viaje.",
    importAnother: "Importar otra",
    viewMyTrip: "Ver mi viaje",
    pasteEmailPlaceholder: "Pegá acá un email de confirmación. Funciona con:\n· LATAM, Aerolineas, Gol, Avianca, Copa, JetSmart, Sky\n· Despegar / Decolar / Almundo (paquetes completos)\n· Airbnb, Booking, hoteles\n· Seguros, transfers, eSIM, tours\n· En español, portugués, inglés, francés, italiano",
  },
} as const;

export default es;

// Recursive type that maps all leaf values to string
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type Dictionary = DeepStringify<typeof es>;
