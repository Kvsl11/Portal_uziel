// Service Worker file - Minimal version for PWA functionality
const CACHE_NAME = 'uziel-portal-cache-v1';
const urlsToCache = [
    '../index.html',
    '3.png',
    '4.jpg',
    '5.png',
    '6.png',
    'css/style.css',
    // We cache the entire assets folder
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // Note: The file paths here are relative to the service-worker.js location
                // In this structure, index.html is up one level.
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