/* Service worker: shell em cache, atualiza em segundo plano. */
const CACHE = "controlo-v1.3.0";
const SHELL = [
  "./", "./index.html", "./app.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // pedidos de sincronização e outros domínios passam direto
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const rede = fetch(e.request)
        .then((r) => {
          if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => hit);
      return hit || rede;
    })
  );
});
