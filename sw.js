/* 햇살 마을 — offline cache. Bump VERSION whenever any file changes. */
const VERSION = 'haetsal-v4';
const FONT_CACHE = 'haetsal-fonts';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'vendor/three.min.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

// cache:'reload' skips the browser's HTTP cache (GitHub Pages keeps files for 10 minutes),
// so a new version never stores the previous page by mistake.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: serve cached copy, refresh in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // The game page: newest from the network when online, cached copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async c => {
      try {
        const r = await withTimeout(fetch(req, { cache: 'no-cache' }), 4000);
        if (r.ok) c.put('index.html', r.clone());
        return r;
      } catch (err) {
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    }));
    return;
  }

  // Other app files: cache first (works offline)
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  }));
});
