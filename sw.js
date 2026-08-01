// Service Worker de INVENTARY ARB
// Objetivo único: permitir instalar la app en el teléfono y que abra sin
// depender de la red. No toca ni interfiere con la lógica de negocio
// (todo eso vive en localStorage, dentro de app.js).

const CACHE_NAME = "inventary-arb-v20260731b";

const ARCHIVOS_APP = [
    "./",
    "./index.html",
    "./app.js?v=20260731b",
    "./style.css?v=20260731b",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-512-maskable.png",
    "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ARCHIVOS_APP))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (evento) => {
    evento.waitUntil(
        caches.keys().then((nombres) =>
            Promise.all(
                nombres
                    .filter((nombre) => nombre !== CACHE_NAME)
                    .map((nombre) => caches.delete(nombre))
            )
        ).then(() => self.clients.claim())
    );
});

// Estrategia: cache-first para el shell de la app (con actualización en
// segundo plano), network-first con respaldo en caché para todo lo demás
// (incluye las librerías de CDN, para que sigan funcionando sin internet
// una vez que se cargaron al menos una vez).
self.addEventListener("fetch", (evento) => {
    if (evento.request.method !== "GET") return;

    evento.respondWith(
        caches.match(evento.request).then((respuestaCache) => {
            const fetchPromise = fetch(evento.request)
                .then((respuestaRed) => {
                    if (respuestaRed && respuestaRed.status === 200) {
                        const copia = respuestaRed.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
                    }
                    return respuestaRed;
                })
                .catch(() => respuestaCache);

            return respuestaCache || fetchPromise;
        })
    );
});
