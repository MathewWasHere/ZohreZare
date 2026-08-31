const CACHE_NAME = 'zohrezare-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './services.html',
  './about.html',
  './auth.html',
  './booking.html',
  './service.html',
  './panel/index.html',
  './assets/css/fonts.css',
  './assets/css/base.css',
  './assets/css/components.css',
  './assets/css/pages.css',
  './assets/js/core/config.js',
  './assets/js/core/store.js',
  './assets/js/core/utils.js',
  './assets/js/core/api.js',
  './assets/js/data/services.js',
  './assets/js/data/auth.js',
  './assets/js/data/appointments.js',
  './assets/js/data/backend-bridge.js',
  './assets/js/ui/icons.js',
  './assets/js/ui/toast.js',
  './assets/js/ui/shell.js',
  './assets/js/pages/home.js',
  './assets/js/pages/services.js',
  './assets/js/pages/service-detail.js',
  './assets/js/pages/auth.js',
  './assets/js/pages/booking.js',
  './assets/js/pages/account.js',
  './assets/js/pages/admin.js',
  './assets/js/ui/hero-orbit.js',
  './assets/img/favicon.svg',
  './assets/img/brand/logo.png',
  './assets/img/portrait-cutout.png',
  './assets/img/salon-interior.jpg',
  './assets/img/banner-cta.jpg',
  './assets/img/banner-cta-mobile.jpg',
  './assets/img/banner-footer.jpg'
];

// نصب service worker و کش کردن فایل‌های استاتیک
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opening cache and adding static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// فعال‌سازی و پاک کردن کش‌های قدیمی
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// استراتژی Cache First برای فایل‌های استاتیک
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // فقط درخواست‌های same-origin
  if (url.origin !== location.origin) return;
  
  // نادیده گرفتن درخواست‌های API
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      // اگر در کش بود، برگردون
      if (response) {
        return response;
      }
      
      // وگرنه از شبکه بگیر و در کش ذخیره کن
      return fetch(event.request).then((response) => {
        // اگر response معتبر نبود، برگردون
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // clone کردن response برای ذخیره در کش
        const responseToCache = response.clone();
        
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return response;
      });
    }).catch(() => {
      // اگر offline بود و فایل در کش نبود، صفحه اصلی رو برگردون
      if (event.request.headers.get('accept').includes('text/html')) {
        return caches.match('./index.html');
      }
    })
  );
});

// پشتیبان‌گیری از نوتیفیکیشن push (اختیاری برای آینده)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'زهره زارع';
  const options = {
    body: data.body || 'پیام جدید',
    icon: data.icon || './assets/img/brand/logo.png',
    badge: './assets/img/favicon.svg'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});
