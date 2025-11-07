// Service Worker file - Minimal version for PWA functionality
const CACHE_NAME = 'uziel-portal-cache-v1';
const urlsToCache = [
    '../index.html',
    'img/3.png',
    'img/4.jpg',
    'img/5.png',
    'img/6.png',
    'css/style.css',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // CORREÇÃO: Adicionamos './' explicitamente para garantir que as referências
                // dentro da pasta 'assets' (onde o SW está) sejam resolvidas corretamente.
                return cache.addAll(urlsToCache.map(url => url.startsWith('..') ? url : './' + url));
            })
            .catch(error => {
                console.error('Failed to cache:', error);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // No cache hit - fetch from network
                return fetch(event.request);
            })
    );
});