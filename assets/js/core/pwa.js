/* ==========================================================================
   pwa.js — ثبت سرویس‌ورکر برای PWA
   ========================================================================== */
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js').catch(function () {
        /* اگر ثبت نشد، سایت عادی کار می‌کند؛ بی‌صدا رد می‌شویم
           تا کنسول بازدیدکننده تمیز بماند. */
      });
    });
  }
})();
