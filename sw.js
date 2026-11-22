// Offline-Unterstützung: App-Dateien zwischenspeichern, beim Öffnen zuerst die neueste Version versuchen.
const CACHE = "hh-app-v4";
const FILES = ["./", "index.html", "styles.css", "config.js", "js/core.js", "js/store.js", "js/finanzen.js", "js/rezepte.js", "js/einkauf.js", "js/essen.js", "js/plan.js", "js/haushalt.js", "js/app.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("hh-app-") && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // nur Dateien dieser App (gleiche Adresse wie Haushaltsbuch und Deko-App, aber eigener Ordner)
  if (!u.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
