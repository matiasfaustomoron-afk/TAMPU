// Travel OS — Service Worker
// Strategy:
//   - Shell + static assets: cache-first with network fallback
//   - HTML pages: network-first with cache fallback (fresh data wins, offline still works)
//   - API calls: network-only (data must be fresh)
//   - Map tiles + leaflet CDN: cache-first (heavy + stable)

const VERSION = "tampu-v19-light-default-tierra";
const SHELL_CACHE = `${VERSION}-shell`;
const PAGES_CACHE = `${VERSION}-pages`;
const ASSETS_CACHE = `${VERSION}-assets`;
const TILES_CACHE = `${VERSION}-tiles`;

const SHELL_URLS = [
  "/",
  "/dashboard",
  "/today",
  "/emergency",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {
        // Best-effort: skip missing entries (e.g. /dashboard if not pre-rendered yet)
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API / auth callbacks
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) {
    return;
  }

  // Map tiles (cross-origin, OSM)
  if (url.hostname.endsWith("tile.openstreetmap.org") || url.hostname === "unpkg.com") {
    event.respondWith(cacheFirst(req, TILES_CACHE));
    return;
  }

  // Next.js static assets (_next/static/*)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, ASSETS_CACHE));
    return;
  }

  // HTML pages — network-first
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(req, PAGES_CACHE));
    return;
  }

  // Default for same-origin assets
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, ASSETS_CACHE));
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== "opaqueredirect") {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    return cached || new Response("offline", { status: 503, statusText: "offline" });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const fallback = await caches.match("/offline.html");
    if (fallback) return fallback;
    return new Response("offline", { status: 503, statusText: "offline" });
  }
}
