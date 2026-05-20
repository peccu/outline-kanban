// Minimal service worker for outline-kanban.
//
// Strategy:
//   - `/api/*` requests are never intercepted (always go to the network).
//   - Navigation requests: network-first, fall back to the cached app shell.
//   - Other same-origin GETs: stale-while-revalidate.
//
// Bump CACHE_VERSION to force clients to drop old caches.

const CACHE_VERSION = "v1";
const RUNTIME_CACHE = `outline-kanban-runtime-${CACHE_VERSION}`;
const SHELL_CACHE = `outline-kanban-shell-${CACHE_VERSION}`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.add(new Request(SHELL_URL, { cache: "reload" }));
      } catch {
        // First install while offline — non-fatal.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== RUNTIME_CACHE && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API traffic — must always be fresh.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/docs")) {
    return;
  }

  // Navigation requests (HTML).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(SHELL_URL, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(SHELL_URL);
          return (
            cached ??
            new Response("offline", {
              status: 503,
              headers: { "content-type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const networkPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => undefined);
      return cached ?? (await networkPromise) ?? Response.error();
    })(),
  );
});
