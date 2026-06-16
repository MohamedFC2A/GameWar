const CACHE_NAME = "gamewar-cache-v14";
const ASSETS = [
    "./",
    "./index.html",
    "./style.css?v=15",
    "./game.js?v=12",
    "./manifest.json",
    "./Assets/upgrade_banner.png",
    "./Assets/icon-192.png",
    "./Assets/icon-512.png"
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;
    e.respondWith(
        fetch(e.request).then((response) => {
            if (response && response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
            }
            return response;
        }).catch(() => {
            return caches.match(e.request, { ignoreSearch: true }).then((cached) => {
                if (cached) return cached;
                if (e.request.mode === "navigate") {
                    return caches.match("./index.html");
                }
                return Response.error();
            });
        })
    );
});
