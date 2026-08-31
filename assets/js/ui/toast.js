/* ==========================================================================
   toast.js — پیام‌های شناور کوتاه
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});
  var host = null;

  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
  }

  var ICONS = { ok: 'checkCircle', danger: 'alert', info: 'info' };

  /**
   * @param {string} message متن پیام
   * @param {'ok'|'danger'|'info'} type نوع
   * @param {number} ms مدت نمایش
   */
  function toast(message, type, ms) {
    var t = type || 'info';
    var node = document.createElement('div');
    node.className = 'toast toast--' + t;
    node.innerHTML = ZZ.icon(ICONS[t] || 'info', null, 18) + '<span>' + ZZ.u.esc(message) + '</span>';
    ensureHost().appendChild(node);

    var timer = setTimeout(close, ms || 3800);
    node.addEventListener('click', close);

    function close() {
      clearTimeout(timer);
      if (!node.parentNode) return;
      node.classList.add('is-out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 300);
    }
    return close;
  }

  toast.ok     = function (m, ms) { return toast(m, 'ok', ms); };
  toast.error  = function (m, ms) { return toast(m, 'danger', ms); };
  toast.info   = function (m, ms) { return toast(m, 'info', ms); };

  ZZ.toast = toast;
})(window);
