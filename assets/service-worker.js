// Service Worker corrigido para estrutura em /assets/js/
const CACHE_NAME = 'uziel-portal-cache-v3';
const BASE_PATH = '/Portal_uziel/'; // ajuste se o site estiver em outro subcaminho

const urlsToCache = [
  BASE_PATH + 'index.html',
  BASE_PATH + 'css/style.css',
  BASE_PATH + 'img/3.png',
  BASE_PATH + 'img/4.jpg',
  BASE_PATH + 'img/5.png',
  BASE_PATH + 'img/6.png',
];

// Instala o SW e armazena os arquivos em cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('[SW] Falha ao armazenar no cache:', err))
  );
  self.skipWaiting();
});

// Remove caches antigos na ativação
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', name);
            return caches.delete(name);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Intercepta requisições (cache-first)
self.addEventListener('fetch', event => {
  const request = event.request;
  event.respondWith(
    caches.match(request).then(response => {
      if (response) return response;
      return fetch(request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const clonedResponse = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clonedResponse));
        return networkResponse;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match(BASE_PATH + 'index.html');
        }
      });
    })
  );
});
