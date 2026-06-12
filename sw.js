// Service worker — offline caching for the Labosport Pitch Inspector.
const CACHE = 'labosport-v50';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/briefParser.js',
  './js/seedImages.js',
  './js/gdrive.js',
  './js/firebase-config.js',
  './js/firebase.js',
  './manifest.webmanifest',
  './report_template.docx',
  './libs/pizzip.min.js',
  './libs/docxtemplater.min.js',
  './libs/imagemodule.js',
  './libs/heic2any.min.js',
  './js/mergeDocx.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];
// pdf.js (loaded from CDN) is cached at runtime on first online use.
const RUNTIME = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // network-first for navigations so updates land; cache fallback offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { cachePut(req, r.clone()); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  // cache-first for everything else (shell + runtime cdn assets)
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (req.url.startsWith(self.location.origin) || RUNTIME.some(u => req.url.startsWith(u.split('?')[0])) || req.url.includes('cdnjs.cloudflare.com') || req.url.includes('gstatic.com/firebasejs'))) {
      cachePut(req, r.clone());
    }
    return r;
  }).catch(() => hit)));
});
function cachePut(req, res) { caches.open(CACHE).then(c => c.put(req, res)).catch(()=>{}); }
