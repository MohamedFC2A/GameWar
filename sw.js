const CACHE_NAME = "gamewar-cache-v10";
const ASSETS = [
    "./",
    "./index.html",
    "./style.css?v=11",
    "./game.js?v=9",
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
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
            return response;
        }).catch(() => {
            return caches.match(e.request);
        })
    );
});
