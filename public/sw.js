// Lets the forms page open without internet. The page is fetched fresh whenever online
// and the last copy is used when offline. API calls and other files are never cached here.
const CACHE = 'qa-page-v1';
const PAGE = self.registration.scope;
const PAGE_PATH = new URL(PAGE).pathname;

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.add(PAGE))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isPage = url.origin === location.origin && (url.pathname === PAGE_PATH || url.pathname === PAGE_PATH + 'index.html');
  if (e.request.method !== 'GET' || e.request.mode !== 'navigate' || !isPage) return;
  e.respondWith(fetch(e.request)
    .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(PAGE, copy)); } return res; })
    .catch(() => caches.match(PAGE)));
});
