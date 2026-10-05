/* Service worker: rede primeiro, cache só como reserva sem ligação.
   Assim cada abertura com internet traz sempre a versão mais recente;
   sem internet, a app abre com a última cópia guardada. */
const CACHE = "controlo-v1.5.2";
const SHELL = [
  "./", "./index.html", "./app.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  // "reload" ignora a cópia que o próprio navegador guardou (o GitHub Pages
  // deixa-a valer ~10 min), para o cache novo nascer já com ficheiros frescos
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
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
    // "no-cache" obriga o navegador a confirmar com o servidor antes de usar a cópia dele
    fetch(new Request(e.request.url, { cache: "no-cache" }))
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
      )
  );
});
