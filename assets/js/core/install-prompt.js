/* ==========================================================================
   install-prompt.js - PWA Install Prompt (Delava Style)
   ========================================================================== */
(function () {
  'use strict';

  var DISMISS_KEY = 'zz_install_dismissed_v4';
  var deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  }

  function isSafari() {
    var ua = window.navigator.userAgent;
    return /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
  }

  function createPrompt() {
    var el = document.createElement('div');
    el.id = 'installPrompt';
    el.className = 'install-prompt';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'نصب اپلیکیشن زهره زارع');

    el.innerHTML =
      '<div class="install-prompt__inner">' +
        '<img src="assets/img/brand/icon-192.png" alt="لوگوی اپلیکیشن زهره زارع" class="install-prompt__logo" width="48" height="48">' +
        '<div class="install-prompt__content">' +
          '<h3 class="install-prompt__title">نصب اپلیکیشن زهره زارع</h3>' +
          '<p class="install-prompt__desc" id="installDesc">دسترسی سریع به خدمات، همیشه روی صفحه اصلی گوشی تو.</p>' +
        '</div>' +
        '<button class="install-prompt__close" id="installClose" aria-label="بستن">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
        '</button>' +
      '</div>' +
      '<button class="install-prompt__btn" id="installBtn">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
        'نصب اپ زهره زارع' +
      '</button>';

    document.body.appendChild(el);

    document.getElementById('installClose').addEventListener('click', dismiss);
    document.getElementById('installBtn').addEventListener('click', install);

    /* Animate in */
    requestAnimationFrame(function () {
      el.classList.add('is-visible');
    });
  }

  function showPrompt(iosHint, manualHint) {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    if (document.getElementById('installPrompt')) return;

    createPrompt();

    if (iosHint) {
      document.getElementById('installDesc').textContent = 'دکمه اشتراک‌گذاری مرورگر را بزن و «Add to Home Screen» را انتخاب کن.';
      document.getElementById('installBtn').style.display = 'none';
    } else if (manualHint) {
      document.getElementById('installDesc').textContent = 'از منوی مرورگر گزینه «نصب برنامه» یا «افزودن به صفحه اصلی» را انتخاب کن.';
      document.getElementById('installBtn').style.display = 'none';
    }
  }

  function dismiss() {
    var el = document.getElementById('installPrompt');
    if (el) {
      el.classList.remove('is-visible');
      setTimeout(function () { el.remove(); }, 300);
    }
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      dismiss();
    });
  }

  /* beforeinstallprompt - Chrome/Edge Android */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    /* کمی صبر تا کاربر اول خود صفحه را ببیند، بعد پیشنهاد نصب بیاید */
    setTimeout(function () { showPrompt(false, false); }, 2500);
  });

  /* Installed */
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
    var el = document.getElementById('installPrompt');
    if (el) el.remove();
  });

  /* iOS Safari fallback */
  if (isIOS() && isSafari() && !isStandalone() && localStorage.getItem(DISMISS_KEY) !== '1') {
    setTimeout(function () { showPrompt(true, false); }, 2500);
  }
})();
