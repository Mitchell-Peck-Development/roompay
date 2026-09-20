/*
 * RoomPay offline shell. Deliberately small:
 *  - /_next/static/* is content-hashed, so cache-first is safe.
 *  - The app page ("/app") is network-first, falling back to the last copy,
 *    so the installed app opens (with all its local data) without a
 *    connection. The landing page at "/" is left to the network.
 *  - Share pages, calendar feeds and the API are never cached: they must be
 *    live, and a share page belongs to someone else's data.
 */
// v2 moved the app from "/" to "/app". The version bump drops the old cache,
// which still held the app shell under "/" — where the landing page is now.
const VERSION = "roompay-v2"
const APP_PATH = "/app"
const SHELL = [APP_PATH, "/manifest.webmanifest", "/icon.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/r/") || url.pathname.startsWith("/api/")) return

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(VERSION).then((cache) => cache.put(request, copy))
            }
            return response
          })
      )
    )
    return
  }

  if (request.mode === "navigate" && url.pathname === APP_PATH) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(VERSION).then((cache) => cache.put(APP_PATH, copy))
          }
          return response
        })
        .catch(() => caches.match(APP_PATH).then((hit) => hit || Response.error()))
    )
  }
})
