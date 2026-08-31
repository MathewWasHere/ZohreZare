/* ==========================================================================
   pwa.js - Service Worker Registration for PWA
   ========================================================================== */
(function () {
  'use strict';
  
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js')
        .then(function (registration) {
          console.log('[PWA] Service Worker registered successfully. Scope:', registration.scope);
        })
        .catch(function (error) {
          console.log('[PWA] Service Worker registration failed:', error);
        });
    });
  }
})();
