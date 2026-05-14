// ────────────────────────────────────────────────────────────────────────────
// Tampu — Service Worker (offline-first PWA, zero-dep, Workbox-style)
// ────────────────────────────────────────────────────────────────────────────
//
// PROMESA CORE: el Vault funciona aunque no haya net. Las rutas principales
// están precacheadas en `install` y servidas desde cache antes de tocar la red.
//
// ESTRATEGIAS (alineadas con AGENTS.md de Agente PWA, mayo 2026):
//
//   ┌─────────────────────────────┬─────────────────────────────────┬─────────────┐
//   │ Asset                       │ Estrategia                      │ TTL         │
//   ├─────────────────────────────┼─────────────────────────────────┼─────────────┤
//   │ App shell (HTML rutas core) │ cache-first + SWR background    │ 7 días SWR  │
//   │ /_next/static/* (JS/CSS)    │ cache-first (immutable hashes)  │ ∞           │
//   │ /icons/*, /icon*, fonts     │ cache-first                     │ ∞           │
//   │ /api/* GET (photo/forecast) │ network-first → cache 7d        │ 7 días      │
//   │ /api/* POST/PUT/DELETE      │ network-only (no cache)         │ -           │
//   │ Map tiles (OSM, unpkg)      │ cache-first                     │ ∞           │
//   │ Navegación sin cache        │ → /offline.html                 │ -           │
//   └─────────────────────────────┴─────────────────────────────────┴─────────────┘
//
// QUÉ NO CACHEA EL SW (y por qué):
//   - Blobs del Vault (PDFs, fotos boarding pass): ya viven en IndexedDB/SQLite
//     bajo `src/lib/vault/storage.ts`. Duplicarlos en Cache Storage gastaría
//     cuota dos veces y se desincronizaría con la fuente de verdad.
//   - Fotos del journal: idem — blob:// URLs desde IndexedDB.
//   - /api/* mutaciones (POST/PUT/DELETE): la cola de retry vive en la app
//     (sync layer). Cachear mutaciones es semánticamente incorrecto.
//   - /_next/data/*: server-rendered JSON volátil; servirlo stale rompe la UI.
//   - Supabase auth callbacks: nunca interceptamos.
//
// VERSIONADO:
//   - VERSION cambia por release. Cualquier cache cuyo nombre no empiece con
//     el VERSION actual se borra en `activate`.
//   - skipWaiting + clients.claim → update instantáneo post-deploy, sin
//     esperar a que todas las pestañas cierren.
//
// CAPACITOR iOS:
//   - El SW vive dentro del WKWebView; la persistencia de Cache Storage es
//     por bundle (sandboxed). El Vault crítico usa SQLite nativo (no Cache
//     Storage), así que la eviction LRU de WebKit no toca los blobs.
//   - El SW sigue siendo útil en mobile build para offline navigation entre
//     rutas y cache de `_next/static/*` (que en mobile son file:// + cache HTTP).
// ────────────────────────────────────────────────────────────────────────────

// IMPORTANTE: bumpear esta version en CADA deploy con cambios en bundles client
// (chunks, server actions inlineadas, etc.). El SW usa skipWaiting + clients.claim
// (líneas ~97 y activate handler) así que el bump invalida cache y trae el bundle
// nuevo en el primer hit. Sin bump, los users con SW instalado siguen con cache stale.
const VERSION = "tampu-v22-trips-rpc-2026-05-14";
const SHELL_CACHE  = `${VERSION}-shell`;
const PAGES_CACHE  = `${VERSION}-pages`;
const ASSETS_CACHE = `${VERSION}-assets`;
const API_CACHE    = `${VERSION}-api`;
const TILES_CACHE  = `${VERSION}-tiles`;

// Rutas pre-cacheadas en install. Son las pantallas que un viajero DEBE poder
// abrir offline. /vault es la promesa core; el resto son las tabs primarias
// + welcome (primer arranque sin net) + offline fallback.
const SHELL_URLS = [
  "/",
  "/today",
  "/itinerary",
  "/vault",
  "/expenses",
  "/journal",
  "/alerts",
  "/settings",
  "/welcome",
  "/emergency",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/icon-180.png",
];

// TTL del cache de /api/* GET (7 días). Si la respuesta cacheada supera este
// umbral y estamos offline, igual la devolvemos (stale es mejor que nada),
// pero marcamos con un header para que la app pueda mostrar "datos viejos".
const API_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const API_CACHED_HEADER = "x-tampu-cached-at";

// ─── install: precache shell + skipWaiting ───────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll falla atómicamente si CUALQUIER URL falla. Hacemos add() por URL
      // para no perder todo el precache si una ruta no está pre-renderizada
      // (ej. /welcome puede no existir en mobile build con output:'export').
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch(() => {
            // best-effort — log silencioso, no rompe install
          })
        )
      );
    })()
  );
  self.skipWaiting();
});

// ─── activate: limpia caches viejos + claim ──────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // Notificar a clients de que hay update activo — la UI puede mostrar toast.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) c.postMessage({ type: "tampu-sw-activated", version: VERSION });
    })()
  );
});

// ─── message: skipWaiting on demand desde la UI (update flow) ────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ─── fetch router ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo cacheamos GET. POST/PUT/DELETE pasan directo a la red (la app maneja
  // el queue de retry en su sync layer si falla offline).
  if (req.method !== "GET") return;

  // Supabase auth, Next.js RSC payloads volátiles — nunca interceptar.
  if (url.pathname.startsWith("/auth/")) return;
  if (url.pathname.startsWith("/_next/data/")) return;
  if (url.hostname.endsWith(".supabase.co")) return;

  // /api/* GET → network-first con cache de 7 días.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(apiNetworkFirst(req));
    return;
  }

  // Map tiles + leaflet CDN → cache-first permanente (heavy + immutable).
  if (
    url.hostname.endsWith("tile.openstreetmap.org") ||
    url.hostname.endsWith("basemaps.cartocdn.com") ||
    url.hostname === "unpkg.com"
  ) {
    event.respondWith(cacheFirst(req, TILES_CACHE));
    return;
  }

  // Next.js static assets — content-hashed, cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, ASSETS_CACHE));
    return;
  }

  // Iconos, fonts, manifest — assets estables.
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff")
  ) {
    event.respondWith(cacheFirst(req, ASSETS_CACHE));
    return;
  }

  // Navegación HTML → stale-while-revalidate sobre el shell, con offline.html
  // como ultimate fallback. El usuario VE algo (shell viejo) mientras el SW
  // refresca en background.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(shellStaleWhileRevalidate(req));
    return;
  }

  // Default same-origin: cache-first (imágenes, blobs estáticos de /public).
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, ASSETS_CACHE));
  }
});

// ─── Strategies ──────────────────────────────────────────────────────────────

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (isCacheable(res)) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    // No cached + no network = 503. Para HTML el wrapper de navegación
    // captura esto y sirve offline.html.
    return new Response("offline", { status: 503, statusText: "offline" });
  }
}

/**
 * Shell strategy para navegación: si el shell está cacheado, lo devolvemos
 * INSTANT y refrescamos en background (SWR). Si no, intentamos red; si red
 * falla, servimos offline.html como fallback friendly.
 */
async function shellStaleWhileRevalidate(req) {
  const cache = await caches.open(PAGES_CACHE);
  const shellCache = await caches.open(SHELL_CACHE);
  const cached = (await cache.match(req)) || (await shellCache.match(req));

  const networkPromise = fetch(req)
    .then((res) => {
      if (isCacheable(res)) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Devolvemos cache inmediato, network actualiza en background.
    networkPromise.catch(() => {});
    return cached;
  }

  // Sin cache → esperamos red; si falla, offline.html.
  const fresh = await networkPromise;
  if (fresh) return fresh;
  const fallback = await caches.match("/offline.html");
  if (fallback) return fallback;
  return new Response("offline", { status: 503, statusText: "offline" });
}

/**
 * /api/* GET: network-first con fallback a cache. Cacheamos respuestas
 * exitosas con timestamp para poder detectar "datos viejos" (>7 días).
 * Offline: si la respuesta cacheada existe, la servimos (incluso si es vieja —
 * "stale data" es mejor que un error en Vault/itinerary).
 */
async function apiNetworkFirst(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(req);
    if (isCacheable(res)) {
      // Marcamos timestamp para que la app pueda mostrar "actualizado hace X".
      const stamped = await stampResponse(res.clone());
      cache.put(req, stamped).catch(() => {});
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) {
      // Servimos cache aunque haya expirado el TTL — offline > error.
      return cached;
    }
    return new Response(
      JSON.stringify({ error: "offline", message: "Sin conexión y sin cache para esta consulta" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isCacheable(res) {
  if (!res) return false;
  if (res.status !== 200) return false;
  if (res.type === "opaqueredirect") return false;
  // Opaque responses (CORS sin credentials) son cacheables pero ocupan cuota
  // completa sin que sepamos el tamaño. Las dejamos pasar para tiles/OSM.
  return true;
}

async function stampResponse(res) {
  // Cloneamos headers para agregar el timestamp sin romper la response original.
  const headers = new Headers(res.headers);
  headers.set(API_CACHED_HEADER, String(Date.now()));
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

// eslint-disable-next-line no-unused-vars
function isExpired(res) {
  // Helper exportable conceptualmente — la app puede leer el header para UI.
  const cachedAt = Number(res.headers.get(API_CACHED_HEADER) || 0);
  if (!cachedAt) return false;
  return Date.now() - cachedAt > API_CACHE_MAX_AGE_MS;
}
