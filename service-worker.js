<<<<<<< HEAD
// Define um nome para o cache do seu aplicativo
const CACHE_NAME = 'portal-uziel-cache-v1';

// Lista de todos os arquivos que o seu aplicativo precisa para funcionar offline
const urlsToCache = [
  './',
  './index.html',
  './3.png',
  './5.png',
  './Ministério uziel.png',
  './Imagem do WhatsApp de 2024-10-20 à(s) 10.44.46_3463bbb5.jpg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Anton&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
];

// Evento 'install': é disparado quando o Service Worker é instalado pela primeira vez.
self.addEventListener('install', event => {
  // Espera até que o cache seja aberto e todos os arquivos sejam armazenados.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto com sucesso');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': é disparado toda vez que o aplicativo tenta buscar um arquivo (uma imagem, um script, etc.).
self.addEventListener('fetch', event => {
  event.respondWith(
    // Tenta encontrar o arquivo no cache primeiro.
    caches.match(event.request)
      .then(response => {
        // Se encontrar no cache, retorna o arquivo do cache.
        if (response) {
          return response;
        }
        // Se não encontrar, busca o arquivo na internet.
        return fetch(event.request);
      })
  );
=======
// Define um nome para o cache do seu aplicativo
const CACHE_NAME = 'portal-uziel-cache-v1';

// Lista de todos os arquivos que o seu aplicativo precisa para funcionar offline
const urlsToCache = [
  './',
  './index.html',
  './3.png',
  './5.png',
  './Ministério uziel.png',
  './Imagem do WhatsApp de 2024-10-20 à(s) 10.44.46_3463bbb5.jpg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Anton&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
];

// Evento 'install': é disparado quando o Service Worker é instalado pela primeira vez.
self.addEventListener('install', event => {
  // Espera até que o cache seja aberto e todos os arquivos sejam armazenados.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto com sucesso');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': é disparado toda vez que o aplicativo tenta buscar um arquivo (uma imagem, um script, etc.).
self.addEventListener('fetch', event => {
  event.respondWith(
    // Tenta encontrar o arquivo no cache primeiro.
    caches.match(event.request)
      .then(response => {
        // Se encontrar no cache, retorna o arquivo do cache.
        if (response) {
          return response;
        }
        // Se não encontrar, busca o arquivo na internet.
        return fetch(event.request);
      })
  );
>>>>>>> 2c8c22e0eaf60550cc317c3f08af9df91e734a72
});