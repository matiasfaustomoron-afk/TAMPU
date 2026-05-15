// Tampu — Registry de keys de localStorage / sessionStorage.
//
// Documenta TODO el inventario de keys usados en el browser. Sirve para:
//   - Auditar conflictos (dos features escribiendo en la misma key)
//   - Limpiar al hacer logout (loop sobre LS_KEYS)
//   - Migrar prefijos (ej travel-os-* → tampu-*) sin grep manual
//
// NOTA: los call sites todavía escriben strings literales. La migración a
// usar LS_KEYS.foo en cada sitio se hace gradual (separately).

export const LS_KEYS = {
  /** Theme preference (light/dark). Leído por <Script> inline en layout pre-hydrate. */
  theme: "tampu-theme",
  /** Legacy alias (pre-rebrand). Mantener hasta el sweep completo. */
  themeLegacy: "travel-os-theme",
  /** Bandera demo mode. */
  demoMode: "tampu_demo_mode",
  /** Contador de fallos del poller de WhatsApp/Cobrowse. */
  pollerFailures: "tampu_pc_failures",
  /** Cifrado del master password (vault). */
  masterCipher: "tampu_master_cipher",
  /** Timestamp ISO del último sync Supabase exitoso. */
  lastSync: "tampu-last-sync-at",
  /** Snapshot del onboarding completion state. */
  onboardingDone: "tampu_onboarding_done",
  /** Cache local de viajes para offline-first read. */
  tripsCache: "tampu_trips_cache",
  // ─── Legacy `travel-os-*` keys ───
  // Registradas para auditoría y limpieza-en-logout, pero los call sites
  // todavía hardcodean el string. TODO: migration deferred a `tampu_*`
  // namespace. Mantener los nombres viejos hasta que un sweep dedicado:
  //   - vault page + boarding-passes widget lean `vaultDemo(tripId)`
  //   - journal demo storage use `journalDemo(tripId)`
  //   - AI key flows (settings) use `aiKey` / `aiKeyEncrypted`
  //   - pinned views (saved-views provider) use `pinnedViews`
  /** Demo vault attachments por trip (writeVersioned). TODO migrate. */
  vaultDemo: (tripId: string) => `travel-os-vault-${tripId}`,
  /** Demo journal entries por trip. TODO migrate. */
  journalDemo: (tripId: string) => `travel-os-journal-${tripId}`,
  /** Anthropic API key (plain, sin cifrar — legacy). TODO migrate al cifrado. */
  aiKey: "travel-os-ai-key",
  /** Anthropic API key cifrada con master password. TODO migrate. */
  aiKeyEncrypted: "travel-os-ai-key-encrypted",
  /** Saved-views / pinned dashboards. TODO migrate. */
  pinnedViews: "travel-os-pinned-views",
} as const;

export type LSKey = (typeof LS_KEYS)[keyof typeof LS_KEYS];
