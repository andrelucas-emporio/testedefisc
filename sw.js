// ============================================================
// EMPÓRIO FISCAL — sw.js (Service Worker)
// ============================================================

const CACHE   = 'emporio-fiscal-v1';
const ASSETS  = [
  '/',
  '/index.html',
  '/app.js',
  '/firebase-config.js',
  '/manifest.json',
];

// Instalar: faz cache dos arquivos principais
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.warn('Cache install error:', err))
  );
  self.skipWaiting();
});

// Ativar: limpa caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network first, cache fallback (para Firebase funcionar)
self.addEventListener('fetch', e => {
  // Não interceptar requests do Firebase
  if (e.request.url.includes('firebaseio.com') ||
      e.request.url.includes('googleapis.com') ||
      e.request.url.includes('gstatic.com')) {
    return;
  }

  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza o cache com a versão mais recente
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
