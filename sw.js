/* N5→N4 Flashcard — Service Worker
 *
 * Strategi:
 *  - Precache shell aplikasi saat install.
 *  - Strategi cache-first untuk same-origin (gampang offline).
 *  - Network-first untuk request lain (cross-origin: Google Fonts dsb).
 *  - Jika versi baru, hapus cache lama saat activate.
 *
 * Naikkan CACHE_VERSION setiap kali Anda merilis perubahan agar
 * service worker di klien re-cache file shell.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `n5n4-${CACHE_VERSION}`;

// Daftar file inti yang akan di-precache.
// Path relatif terhadap scope SW.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  // Aktifkan SW baru tanpa menunggu tab lama ditutup
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch((err) => {
        // Jangan jatuhkan install hanya karena 1 file gagal (mis. icon belum ada)
        console.warn('[SW] precache partial:', err);
      })
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('n5n4-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Hanya tangani GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // Cache-first untuk shell
    event.respondWith(
      (async () => {
        const cached = await caches.match(req, { ignoreSearch: false });
        if (cached) {
          // Update background (stale-while-revalidate)
          fetch(req)
            .then((res) => {
              if (res && res.ok) {
                caches.open(CACHE_NAME).then((c) => c.put(req, res.clone()));
              }
            })
            .catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        } catch (err) {
          // Offline fallback: kembalikan index.html jika navigasi
          if (req.mode === 'navigate') {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
          }
          throw err;
        }
      })()
    );
    return;
  }

  // Cross-origin (Google Fonts dll): network-first dengan cache fallback
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
