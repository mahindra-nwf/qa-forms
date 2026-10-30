// Lets the forms page open without internet. The page is fetched fresh whenever online
// and the last copy is used when offline. API calls are never cached here.
const CACHE = 'qa-page-v1';
const PAGE = self.registration.scope;

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.add(PAGE))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request)
    .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(PAGE, copy)); } return res; })
    .catch(() => caches.match(PAGE)));
});
